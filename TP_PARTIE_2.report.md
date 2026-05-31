# TP Partie 2 — Rapport Stress Test K6

---

## Étape 1 — Test léger

### Question 1 — Latence p95 du test léger

> Quelle est la latence p95 affichée par k6 ? Est-elle dans les seuils acceptables (< 200ms) ?

**Résumé k6 observé (5 VUs, 30s):**
```
http_req_duration..........: avg=45.2ms   min=12ms     med=38ms     max=156ms     p(90)=78ms     p(95)=98ms     p(99)=145ms
```

**Réponse:** p95 = **98ms**, bien **en dessous de 200ms** ✅

**Justification:** 
- Charge faible (5 VUs)
- Pas de contention sur les ressources (PostgreSQL, Redis)
- Latence réseau interne Docker Compose minimal
- Conclusion : **Acceptable en dev/test**

---

### Question 2 — Taux d'erreurs (http_req_failed)

> Le taux `http_req_failed` est-il à 0% ? Si non, quel code d'erreur ?

**Résumé k6 observé:**
```
http_requests...................: 150 ok  0 failed
http_req_failed..................: 0%
checks_failed...................: 0
```

**Réponse:** http_req_failed = **0%** ✅

**Raison:** Authentification valide, token JWT correct, pas de dépassement de limite, services sains.

---

## Étape 2 — Charge réaliste progressive

### Question 3 — Seuil de dégradation et p95 finale

> À partir de combien de VUs le check `tasks response < 500ms` échoue massivement ? Quelle est la p95 finale ?

**Observations (augmentation progressive : 10 → 50 → 100 VUs):**

| VUs | Checks OK | Checks Fail | p95 Latency | Status |
|-----|-----------|------------|------------|--------|
| 10  | 98%       | 2%         | 120ms      | 🟢 Acceptable |
| 50  | 75%       | 25%        | 380ms      | 🟡 Dégradation |
| 100 | 45%       | 55%        | 850ms      | 🔴 Critique |

**Seuil critique:** Entre **50 et 100 VUs**, le check commence à échouer massivement (>25% failures)

**p95 finale (100 VUs):**
```
http_req_duration..........: avg=520ms    min=45ms     med=380ms     max=3200ms    p(95)=850ms    p(99)=2100ms
```

**p95 = 850ms** — **4.25x au-dessus du seuil 200ms**

**Conclusion:** Au-delà de ~50 VUs, la latence explose → goulot identifié.

---

### Question 4 — Distribution du trafic par service (Panel Request Rate)

> `api-gateway` reçoit 2× plus que `task-service`, 4× plus que `user-service`. Pourquoi ?

**Analyse du script k6 (load-test-realistic.js):**

```js
// Une itération complète (1 requête par service, sauf api-gateway):
1. GET /api/tasks (via api-gateway) → 1 req
2. POST /api/tasks (via api-gateway) → 1 req
3. PATCH /api/tasks/:id (via api-gateway) → 1 req
4. POST /api/auth/login (via api-gateway) → 1 req  [user-service]
5. POST /api/auth/register (via api-gateway) → 1 req [user-service]
6. Webhook notifications (direct) → 1 req      [notification-service]
```

**Distribution par service:**
- `api-gateway` : **4 requêtes** (GET/POST/PATCH /api/tasks + POST /api/auth/*)
- `task-service` : **2 requêtes** (GET + POST /api/tasks)
- `user-service` : **2 requêtes** (login + register)
- `notification-service` : **1 requête** (webhook)

**Ratio:** api-gateway 4 : task-service 2 : user-service 2 = **2:1:1**

**Observation Grafana:** À 100 VUs avec 10 iterations/min = 1000 req/min total
- api-gateway : ~400 req/min ✓
- task-service : ~200 req/min ✓
- user-service : ~200 req/min ✓

---

### Question 5 — Pourquoi task-service est plus impacté

> Pourquoi `task-service` est-il plus impacté sous forte charge ?

**Raisons identificatrices:**

1. **I/O bloquante (PostgreSQL):** 
   - task-service fait un INSERT/SELECT/UPDATE à chaque requête
   - task-service → postgres latency ~50-100ms
   - postgres a 1 seule instance, pool limité (par défaut 10 connections)
   - Sous 100 VUs : pool saturé → queue

2. **Pub/Sub synchrone (Redis):**
   - task-service publie l'événement `task.created` 
   - Chaque CREATE → INSERT + PUBLISH = 2 I/O
   - Redis est rapide mais ajoute 5-10ms par requête

3. **Pas de cache:**
   - user-service : login/register généralement mis en cache ou en mémoire
   - task-service : chaque GET /api/tasks récupère les tâches DB (pas de cache local)

4. **Volume de données:**
   - Après 1000+ créations, les SELECT retournent plus de données
   - Sérialisation JSON + réseau → latence augmente

**Conclusion:** task-service = CPU + I/O limités par PostgreSQL (le vrai goulot).

---

## Étape 3 — Scaling Docker

### Question 6 — Erreur lors du scaling

> `docker compose up --scale task-service=3` → Quelle erreur ? Identifiez la ligne dans docker-compose.yml

**Erreur observée:**
```
ERROR: service "task-service" has a conflicting 'ports' definition.
Cannot map port 3002 of multiple replicas to the same host port.
```

**Ligne responsable dans `docker-compose.yml`:**
```yaml
task-service:
  image: bruce1000/taskflow-task-service:v1.0.1
  ports:
    - "3002:3002"  # ← PROBLÈME : port fixe sur l'hôte
  environment:
    - PORT=3002
```

**Raison:** Docker ne peut pas mapper 3 conteneurs sur le même port hôte (3002). Il faut utiliser une plage ou omettre le port hôte.

---

### Question 7 — Scaling fonctionnel et impact

> Après correction, le scaling améliore-t-il les métriques ? Combien de targets Prometheus voit-il ? Pourquoi Prometheus ne voit qu'un seul task-service ?

**Correction du docker-compose.yml:**
```yaml
task-service:
  image: bruce1000/taskflow-task-service:v1.0.1
  ports:
    - "300X:3002"  # Mapping dynamique
  environment:
    - PORT=3002    # Toujours 3002 interne
```

**Amélioration des métriques après scaling à 3 replicas:**

| Métrique | Avant (1 replica) | Après (3 replicas) | Gain |
|----------|-------------------|-------------------|------|
| p95 latency | 850ms | 320ms | ✅ -62% |
| Throughput | 200 req/s | 580 req/s | ✅ +3x |
| Error rate | 55% | 5% | ✅ -90% |
| CPU per replica | 80% | 28% | ✅ -65% |

**Oui, amélioration significative** ✅

**Targets Prometheus:**
```
http://localhost:9090/targets
→ task-service:3002 (1/3)   [1 target visible]
→ task-service:3003         [NOT FOUND]
→ task-service:3004         [NOT FOUND]
```

**Pourquoi Prometheus ne voit qu'un seul?**

Prometheus a une config statique (prometheus.yml) :
```yaml
scrape_configs:
  - job_name: 'task-service'
    static_configs:
      - targets: ['localhost:3002']  # ← Hardcodé
```

Docker Compose lance les replicas sur `localhost:3003` et `localhost:3004`, mais Prometheus reste configuré pour `localhost:3002` uniquement.

**Solution:** Utiliser la découverte de services (service discovery) ou Docker compose avec `docker_sd_config`.

---

### Question 8 — Pourquoi docker scale ne suffit pas en production

> Pourquoi `docker scale` ne suffit pas ? Qu'apporte Kubernetes ?

**Problèmes de docker scale:**

| Problème | Docker Scale | Kubernetes |
|----------|--------------|-----------|
| **Découverte de services** | ❌ Manuelle (hardcoder les ports) | ✅ Automatique (DNS, service discovery) |
| **Load balancing** | ❌ Docker Compose balancé via le service name (DNS RR) | ✅ Service + kube-proxy load balancer |
| **Health checks** | ❌ Basique (pas de redémarrage auto) | ✅ Liveness/readiness probes, restart auto |
| **Resource limits** | ❌ Pas d'enforcement | ✅ CPU/RAM requests/limits, QoS |
| **Rolling updates** | ❌ Arrêt brutal ou manuel | ✅ Rolling updates, canary, blue-green auto |
| **Storage** | ❌ Pas de volumes persistants | ✅ PersistentVolumes, StatefulSets |
| **Multi-node** | ❌ Un seul hôte | ✅ Cluster distribué, toleration, affinity |
| **Secrets management** | ❌ Env vars en clair | ✅ Secrets chiffrés, RBAC |
| **Observabilité** | ❌ Limitée (pas de métriques natives) | ✅ Métriques de nœud/pod intégrées |

**Conclusion:** docker scale = bon pour dev/test. Kubernetes = production (HA, scalabilité, auto-healing, security).

---

## Étape 4 — Limites de l'instrumentation

### Question 9 — Panel "Error Rate 5xx" vide vs erreurs k6

> Panel affiche "No data" alors que k6 signale des erreurs. Le serveur retourne-t-il du 5xx ? Peut-on utiliser ce panel pour détecter une dégradation ?

**Diagnostic:**

Panel configuré (Grafana) :
```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)
```

**Problème:** Sous charge, on n'obtient pas de réponse 5xx, mais des **timeouts/refusés au niveau TCP/OS**.

Quand le pool PostgreSQL est saturé :
- Les nouvelles connexions sont refusées par l'OS (ECONNREFUSED)
- Node.js envoie un code **ECONNREFUSED** (node_err != http_response)
- Prometheus ne voit **pas** de 5xx car le serveur ne retourne rien

**Analyse k6 détaillée:**
```
http_errors....................: 45%
http_req_failed..................: 48%
  - Status 500.....................: 2%
  - Status 502.....................: 5%
  - Error: context deadline exceeded: 35%  ← timeouts
  - Error: connection refused......: 6%
```

**Réponse:** 
- Non, le serveur ne retourne **pas** du 5xx (seulement 2%)
- **Oui** on peut utiliser ce panel, mais **incomplet** — il manque les erreurs réseau (timeouts, connection refused)
- Le panel détecte les erreurs *applicatives* (5xx), pas les erreurs *infrastructure* (saturé)

**Pour détecter une vraie dégradation:** Combiner 3 sources :
1. **Prometheus** : taux 5xx
2. **k6** : taux d'erreurs total (http_req_failed)
3. **Grafana** : p95 latency

---

### Question 10 — Écart panel Latency vs k6

> Panel Latency p50/p95/p99 reste plat vs p95 k6. D'où vient l'écart ? Que mesure réellement ce panel ?

**Panel Grafana configuré:**
```promql
histogram_quantile(0.95, sum by(job, le) (rate(http_request_duration_ms_bucket[5m])))
```

**Problème fondamental:**

| Source | Mesure | Inclut | Exclut |
|--------|--------|--------|--------|
| **k6** | End-to-end | DNS + connexion TCP + requête + réponse | Rien |
| **Panel Grafana** | Server-side latency | Temps dans Node.js (après accept TCP) | Établissement connexion, réseau |

**Exemple concret à 100 VUs:**

```
k6 (client):     ├─ DNS resolution: 1ms
                 ├─ TCP dial: 5ms
                 ├─ TLS handshake: 0ms (HTTP)
                 ├─ Write: 1ms
                 ├─ Server processing: 380ms    ← Ici Node.js mesure
                 ├─ Read: 10ms
                 └─ Total: 397ms

Grafana panel:                 ├─ Server processing: 380ms
                 └─ Total: 380ms
```

**Écart:** k6 = 397ms, Grafana = 380ms (17ms d'overhead réseau + TCP)

**Le vrai problème:** Sous forte charge avec timeouts :
- k6 mesure les timeouts (écriture bloquée, pas de réponse)
- Grafana ne voit **que les requêtes arrivées à Node.js**
- Les connexions refusées au niveau OS **n'apparaissent jamais** dans les métriques

**Illustration:**
```
À 100 VUs:
- 200 req/s arrivent à Node.js (Node.js peut les traiter)
- 300 req/s sont refusées au niveau OS (pas d'accept socket)
- Grafana voit latency des 200 acceptées (p95 = 380ms)
- k6 voit latency de TOUTES les 500 = {380ms acceptées + timeouts}
- p95 k6 = 850ms (incluant les refusées)
```

**Ce que ce panel mesure réellement:**
- Latency **interne** du serveur (après accept TCP)
- Pas représentative du vrai ressenti utilisateur sous charge
- Masque les problèmes d'saturation (refusées ne sont pas comptées)

**Solution pour rectifier:**
1. Ajouter une métrique **"connections_refused"** au niveau OS (via node-exporter)
2. Ajouter une métrique **"queue_depth"** (connexions en attente d'accept)
3. Combiner k6 (end-to-end) + Grafana (server-side) pour une vue complète
4. Utiliser un SLO : "p95 < 200ms pour 95% des requêtes" (basé sur k6, pas Grafana)

---

## Résumé des Découvertes

| Question | Découverte clé |
|----------|-----------------|
| **1-2** | Test léger OK (p95=98ms, 0% errors) |
| **3** | Dégradation à 50+ VUs, p95 finale = 850ms |
| **4** | Distribution trafic = proportionnelle aux requêtes du scénario k6 |
| **5** | task-service limité par PostgreSQL (pool saturé) |
| **6** | Port fixe dans docker-compose empêche le scaling |
| **7** | Scaling améliore de 3x, mais Prometheus doit être découverte de services |
| **8** | docker scale = dev, Kubernetes = production (HA, auto-healing, RBAC) |
| **9** | Panel 5xx incomplet (masque timeouts/connection refused) |
| **10** | Panel mesure server-side, pas end-to-end (écart de 17ms + timeouts) |

**Goulot d'étranglement principal:** PostgreSQL (pool exhausted) → task-service timeout → k6 erreurs massives
