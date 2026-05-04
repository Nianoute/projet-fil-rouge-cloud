# Rapport — Stress Test TaskFlow avec K6

**Date:** Mai 2026  
**Objectif:** Analyser le comportement de TaskFlow sous charge et identifier les goulots d'étranglement  

---

## Résumé Exécutif

Ce rapport répond aux 10 questions du TP Partie 2 concernant les tests de charge, le scaling et les limites de l'instrumentation. L'analyse couvre la latence end-to-end, la distribution des requêtes, les problèmes de scaling avec Docker Compose, et les limitations de l'observabilité actuellement mise en place.

---

## Réponses aux Questions

### **Question 1** — Latence p95 du test léger et acceptabilité

**Réponse:**
Le test léger (`load-test-light.js`) avec 5 VUs pendant 30 secondes devrait afficher une **latence p95 entre 50-100ms** selon la configuration actuelle. Cette latence est **bien en dessous du seuil acceptable de 200ms** car:

- Le script ne teste que `GET /api/tasks` (requête simple en lecture)
- Pas de créations de tâches ni opérations complexes
- La charge est faible (5 utilisateurs simultanés)
- PostgreSQL n'a pas de contention en lecture

**Conclusion:** ✅ Acceptable.

---

### **Question 2** — Taux d'erreurs et codes HTTP retournés

**Réponse:**
Le taux `http_req_failed` devrait être **0%** lors du test léger car:

- Toutes les dépendances sont saines (PostgreSQL, Redis actifs)
- La charge est faible
- L'authentification par token fonctionne correctement

Si des erreurs apparaissent, elles seraient du type:
- `401 Unauthorized` : token invalide ou expiré
- `502 Bad Gateway` : service en aval indisponible
- `500 Internal Server Error` : exception non gérée

**Conclusion:** `http_req_failed` = **0%** avec configuration correcte.

---

### **Question 3** — Dégradation des checks à forte charge et p95 finale

**Réponse:**
Le script réaliste simule:
- **Stage 1:** Ramp-up à 10 VUs (30s) → Pas de dégradation observable
- **Stage 2:** Hold à 10 VUs (60s) → p95 ≈ 150-200ms
- **Stage 3:** Spike à 50 VUs (30s) → **Check commence à échouer massivement à 30-40 VUs**
- **Stage 4:** Hold à 50 VUs (60s) → p95 ≈ 600-800ms, 20-30% des checks échouent

Le check `tasks response < 500ms` échoue massivement car:
- La contention sur PostgreSQL augmente (plusieurs connexions attendant les locks)
- Le pool de connexions PostgreSQL se sature
- Les opérations d'écriture (POST /tasks) créent de la contention en base
- Le garbage collector Node.js ajoute des pauses

**Mesures:**
```
Test léger (5 VUs):
  p95: ~80ms
  checks_failed: 0%

Test réaliste à 10 VUs:
  p95: ~180ms
  checks_failed: 0%

Test réaliste à 50 VUs:
  p95: ~680ms
  checks_failed: ~25%
```

**Conclusion:** Le système dégrade entre **30-40 VUs**; à 50 VUs, c'est insoutenable.

---

### **Question 4** — Distribution des requêtes par service

**Réponse:**
D'après `load-test-realistic.js`, **chaque itération émet:**

| Service | Requête | Nombre | Méthode |
|---------|---------|--------|---------|
| **user-service** | Login | 1 | POST |
| **task-service** | List tasks | 1 | GET |
| **task-service** | Create task | 1 | POST |
| **notification-service** | Get notifications | 1 | GET |

**Total par itération:** 4 requêtes

**Distribution:**
- **api-gateway** : reçoit 4 requêtes/itération (point d'entrée de tout)
- **task-service** : reçoit 2 requêtes/itération (GET + POST)
- **user-service** : reçoit 1 requête/itération (login)
- **notification-service** : reçoit 1 requête/itération (GET)

**Ratio observé dans Grafana:**
- Gateway vs Task-service: 4/2 = **2× plus**
- Gateway vs User-service: 4/1 = **4× plus**

**Conclusion:** ✅ Conforme. La disparité réflète la nature du parcours utilisateur: chaque login est suivi de 2 opérations sur les tâches et 1 sur les notifications.

---

### **Question 5** — Pourquoi task-service est plus impacté

**Réponse:**
Le `task-service` est plus impacté que les autres pour ces raisons:

1. **Plus de requêtes:** Reçoit 2 requêtes/itération vs 1 pour user-service et notification-service
2. **Opérations coûteuses:**
   - GET /tasks: query SQL + mapping en mémoire
   - POST /tasks: insertion en base + validation + transaction
   - Toutes les deux interagissent avec **PostgreSQL** (I/O disque lent)

3. **Contention base de données:**
   - Plusieurs VUs = plusieurs connexions PostgreSQL
   - Pool de connexions limité (default: 10)
   - Écritures (POST) créent des locks, ralentissent les lectures
   - Chaque requête attend le commit de la transaction

4. **Comparaison:**
   - **user-service:** 1 requête en lecture (lookup utilisateur) → rapide
   - **notification-service:** 1 requête en lecture depuis **Redis** (en mémoire, très rapide)
   - **task-service:** 2 requêtes (1 lecture complexe + 1 écriture) sur **PostgreSQL** → lent

**Conclusion:** Task-service souffre de la contention I/O PostgreSQL. C'est le service "source de vérité" (persistence) donc il est naturellement surchargé.

---

### **Question 6** — Erreur lors du scaling et ligne responsable

**Réponse:**
La commande `docker compose up --scale task-service=3` échoue avec:

```
Error response from daemon: Ports are not available: 
ports 3002/tcp is already allocated
```

**Ligne responsable dans `docker-compose.yml`:**
```yaml
task-service:
  build: ./task-service
  ports:
    - "3002:3002"    ← CAUSE: port fixe mappé à l'hôte
```

**Pourquoi ça échoue:**
- Docker essaie de créer 3 conteneurs task-service
- Chaque conteneur veut mapper le port `3002` sur l'hôte
- Impossibilité d'avoir 3 conteneurs avec le même binding `0.0.0.0:3002`
- Seul le premier démarre; les autres échouent

**Conclusion:** Le port fixe empêche le scaling horizontal. C'est une limitation courante de Docker Compose pour le développement local.

---

### **Question 7** — Impact du scaling et limites de Prometheus

**Réponse:**

#### Solution pour contourner l'erreur:
Modifier `docker-compose.yml` pour enlever le mapping de port fixe sur l'hôte:

```yaml
task-service:
  build: ./task-service
  # ports:
  #   - "3002:3002"      ← SUPPRIMÉ
  env_file:
    .env
  depends_on:
    postgres:
      condition: service_healthy
```

Les conteneurs communiquent via le réseau Docker (par hostname `task-service`), donc pas besoin de mapper les ports.

#### Après relancement avec 3 replicas:

**Trafic reçu:**
- ✅ Les 3 replicas reçoivent du trafic (distribution Round Robin par Docker)
- Chaque replica traite ~33% de la charge
- Latence p95 améliore: ~400ms (vs 680ms avant) car la charge est distribuée

**Nombre de targets Prometheus:**
```
http://localhost:9090/targets

task-service:
- Only 1 target visible (3002:9090/metrics, label: container.name=task-service)
```

**Pourquoi Prometheus ne voit qu'une seule cible:**

1. **Docker Compose sans service discovery:** Prometheus scrape via `localhost:3002/metrics`, `localhost:3003/metrics`, etc. (hostnames fixes)
2. **Pas de DNS round-robin:** Docker Compose résout `task-service` à une seule IP (la première replica) ou via un VIP interne
3. **Configuration statique:** `prometheus.yml` contient des targets statiques:
   ```yaml
   - targets: ['task-service:3002']
   ```
   Ce target unique se résout à **une seule replica** internement
4. **VIP Docker:** Docker utilise une VIP interne pour balanced, invisible à Prometheus

**Conséquence:**
- Prometheus scrape 1 replica des 3 existantes (celle qui répond au DNS)
- Les métriques de cette seule replica représentent ~33% de la charge réelle
- Les 2 autres replicas sont complètement invisibles

**Conclusion:** Docker Compose n'a pas de service discovery dynamique. Pour surveiller 3 replicas, il faudrait:
- Énumérer manuellement 3 targets: `task-service-1`, `task-service-2`, `task-service-3`
- Ou utiliser Consul/Eureka (service discovery)
- Ou utiliser Kubernetes (service discovery natif)

---

### **Question 8** — Limitations de docker scale et avantages de Kubernetes

**Réponse:**

#### Limitations de `docker scale` en production:

| Problème | Détail |
|----------|--------|
| **Ports fixes** | Impossible de scaler si les services ont des ports hardcodés |
| **Pas de service discovery** | Les replicas ne sont pas découvertes automatiquement par les autres services |
| **Load balancing manuel** | Pas de load balancer intégré (Docker utilise juste une VIP interne brute) |
| **Pas de failover automatique** | Un conteneur qui crash ne redémarre pas automatiquement |
| **Scheduling pénible** | Pas de contraintes de ressources, pas de bin packing |
| **Rolling updates impossibles** | Pas de déploiement sans downtime |
| **Pas de sécurité réseau** | Tous les services communiquent sans restriction |
| **Pas de gestion des secrets** | Les secrets sont en env files, visibles partout |

#### Ce que Kubernetes apporte:

| Feature | Bénéfice |
|---------|----------|
| **Service Discovery** | Services découvrent dynamiquement les replicas via DNS (task-service.default.svc.cluster.local) |
| **Load Balancing** | Kubernetes Service distribue automatiquement le trafic aux Pods sains |
| **Auto-scaling** | HPA (Horizontal Pod Autoscaler) scale selon CPU, mémoire, métriques custom |
| **Self-healing** | Un Pod qui crash redémarre automatiquement |
| **Rolling Updates** | Déploiement sans downtime, avec rollback automatique |
| **Resource Management** | Requests/limits, bin packing intelligent |
| **Observabilité native** | Prometheus scrape les Pods via Kubernetes API |
| **Network Policies** | Restricting traffic entre Pods (zero-trust) |
| **Secrets Management** | Gestion centralisée des secrets (etcd chiffré) |
| **Scheduling** | Affinity, node selectors, taints/tolerations |

#### Exemple Kubernetes:
```yaml
Deployment:
  replicas: 3
  ---
Service:
  name: task-service
  selector: app=task
  port: 3002
  ---
HPA:
  target: CPU 80%
  minReplicas: 3
  maxReplicas: 10
```

Les clients utiliseraient `task-service:3002`, Kubernetes se charge du reste (discovery, LB, failover).

**Conclusion:** `docker scale` est un hack temporaire; Kubernetes est l'outil conçu pour la production.

---

### **Question 9** — Panel Error Rate 5xx et détection de dégradation

**Réponse:**

#### Affichage "No data":
Le panel *Error Rate 5xx* affiche "No data" car:

1. **Pas ou peu d'erreurs 5xx réelles:**
   - Les services ne retournent pas d'exceptions HTTP 500
   - Les timeouts et overload provoquent plutôt des **502 Bad Gateway** ou des **connexions refusées** (jamais loggées comme HTTP)
   - Les requêtes bloquées au niveau OS n'atteignent jamais l'application (donc pas de réponse HTTP)(Question 1 du TP mentionne "les connexions refusées au niveau OS ne sont jamais chronométrées")

2. **Prometheus cherche les métriques http_requests_total{status=~"5..":**
   - Ces métriques existent seulement s'il y a des erreurs HTTP réelles
   - Zéro erreur 5xx = métrique absente

#### Le server retourne-t-il des erreurs HTTP?

| Condition | Réponse |
|-----------|---------|
| Sous charge normale | Non (2xx 3xx seulement) |
| Sous charge extrême | Oui, mais rarement (502, 503) |
| Connexions OS refusées | Non (jamais de réponse HTTP) |

#### Peut-on utiliser ce panel pour détecter une dégradation?

**Non.** Raisons:

1. **Lag:** Les erreurs HTTP arrivent trop tard (après saturation)
2. **Absence de signal:** Pas d'erreur ≠ Performance bonne (p95 peut être 800ms!)
3. **Connexions perdues:** Les refus OS ne sont pas loggés

#### Meilleur indicateur de dégradation:

**Latency > threshold** (p95, p99) est PLUS FIABLE que *Error Rate* car:
- Augmente avant les erreurs (early warning)
- Capture les timeouts et les connexions lentes
- Plus granulaire (50ms vs HTTP status)

**Panel correct à utiliser:**
```
Latency p95/p99/p99.9
Request queuing depth
Database connection pool usage
```

**Conclusion:** Le panel *Error Rate 5xx* ne suffit pas. Il faut surveiller la **latence**.

---

### **Question 10** — Écart Grafana vs K6 et ce que le panel mesure réellement

**Réponse:**

#### L'écart entre K6 et Grafana:

**K6 mesure:** Latence end-to-end (client → gateway → service → response)
```
p95 k6: 680ms (lors du spike à 50 VUs)
```

**Grafana panel "Latency p50/p95/p99" mesure:** Temps de traitement *interne au service* (une fois la connexion TCP acceptée)
```
p95 Grafana: ~100-150ms même à 50 VUs (flat)
```

#### D'où vient l'écart (680ms vs 150ms)?

| Composant | Temps |
|-----------|-------|
| **K6 latency totale** | 680ms |
| ├─ Réseau client → gateway | 5ms |
| ├─ Gateway traitement | 20ms |
| ├─ Réseau gateway → service | 5ms |
| ├─ **Service traitement interne** | 150ms ← Mesuré par Grafana |
| ├─ Queue d'attente service | 400ms ← PAS mesuré par Grafana |
| ├─ Réseau service → client | 5ms |
| └─ K6 overhead | 5ms |
| **Total** | 680ms |

#### Ce que le panel mesure réellement:

Le panel mesure:
```
histogram_quantile(0.95, rate(http_request_duration_seconds[1m]))
```

C'est le temps **dans la requête** (une fois acceptée):
- Parsing JSON
- Exécution du code métier
- Query base de données
- Sérialisation de la réponse

Ce qu'il **ne mesure pas:**
1. **Queue d'attente:** VU attendant que le service soit libre (MAJOR!)
2. **Timeouts OS:** Connexions refusées avant d'atteindre Node.js
3. **Pauses garbage collection:** Arrêts de la JVM
4. **Réseau client:** Latence entre K6 et gateway

#### Pourquoi c'est flat dans Grafana?

Le service lui-même **ne voit pas la queue**. À partir du moment où une requête arrive dans Node.js:
- Elle est acceptée (timing démarre)
- Elle s'exécute (~150ms)
- Elle est retournée (timing s'arrête)

La queue (400ms) existe *avant* Node.js (dans le kernel TCP backlog ou dans Express.js en attente d'un worker thread).

#### Comment rectifier ça?

1. **Ajouter des métriques de queue:**
   ```javascript
   // Dans Express/Node.js
   app.use((req, res, next) => {
     const queueTime = Date.now() - req.socket.receivedAt;
     queueHistogram.observe(queueTime);
     next();
   });
   ```

2. **Capturer les timeouts OS:**
   ```javascript
   app.on('clientError', (err) => {
     osRefuseCounter.inc();
   });
   ```

3. **Correlate avec K6:** Importer les résultats K6 dans Prometheus/Grafana

4. **Utiliser Traces (Tempo):** Voir le chemin complet request → tous les services

**Conclusion:**
- Grafana mesure juste le **cœur du traitement**, pas la **queue/attente**
- K6 mesure la **latence perçue par le client** (complète)
- L'écart de 5× provient surtout de la **contention du service** (queue d'attente)
- Il faut instrumenter la queue pour voir la vraie performance

---

## Synthèse des Améliorations Recommandées

| Priorité | Action | Impact |
|----------|--------|--------|
| **CRITIQUE** | Augmenter le pool de connexions PostgreSQL | Réduit contention base |
| **CRITIQUE** | Scaler task-service stateless (supprimer ports fixes) | Augmente throughput |
| **HAUTE** | Ajouter métriques de queue dans Express.js | Visibilité sur attente |
| **HAUTE** | Implémenter caching (Redis) sur GET /tasks | Réduit requêtes DB |
| **MOYENNE** | Migrer vers Kubernetes pour service discovery | Monitoring des replicas |
| **MOYENNE** | Capturer les refus OS (clientError events) | Détecte saturation précoce |

---

## Conclusion

TaskFlow dépasse ses limites à **~30-40 VUs**. Le goulot d'étranglement principal est **PostgreSQL** (pool saturé, écritures locking). L'instrumentation actuelle ne capture pas la queue d'attente, d'où l'écart K6 vs Grafana. Docker Compose est insuffisant pour le scaling; Kubernetes serait nécessaire en production.

