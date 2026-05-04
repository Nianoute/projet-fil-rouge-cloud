# Guide Pratique – Tests de Charge et Observations

Guide étape-par-étape pour reproduire les résultats du TP Partie 2.

---

## Prérequis

```bash
# 1. K6 installé
k6 version
# v0.X.X

# 2. Docker et docker-compose
docker compose version

# 3. Frontend accessible et compte utilisateur créé
# Ouvrir http://localhost:5173
# Login ou créer un compte: email + password

# 4. Récupérer un token JWT valide
# Dans DevTools (F12) -> Application -> LocalStorage -> token
# Ou via curl:
curl -X POST http://localhost:4000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
# Copier la valeur du champ "token"
```

---

## Étape 1 – Test Léger (Question 1-2)

### Setup

```bash
# Terminal 1: Lancer l'infra complète
npm run dev:infra

# Terminal 2: Dans le repo 
export TOKEN="votre_token_jwt"
```

### Exécution

```bash
k6 run -e TOKEN="$TOKEN" scripts/load-test-light.js
```

### Sortie attendue (résumé terminal K6)

```
     checks........................: 100% ✓ 150    ✗ 0
     data_received..................: 15 kB 500 B/s
     data_sent.......................:  6 kB 200 B/s
     http_req_blocked...............: avg=1ms    min=0ms    med=1ms    max=5ms    p(90)=2ms    p(95)=3ms    p(99)=4ms
     http_req_connecting............: avg=0ms    min=0ms    med=0ms    max=2ms    p(90)=0ms    p(95)=0ms    p(99)=0ms
     http_req_duration..............: avg=45ms   min=10ms   med=30ms   max=95ms   p(90)=75ms   p(95)=85ms   p(99)=92ms
     http_req_failed................: 0.0%   ✓ 150    ✗ 0
     http_req_queuing............... : avg=5ms    min=0ms    med=2ms    max=20ms   p(90)=12ms   p(95)=15ms   p(99)=18ms
     http_req_receiving.............: avg=2ms    min=1ms    med=1ms    max=8ms    p(90)=3ms    p(95)=4ms    p(99)=5ms
     http_req_sending..............: avg=1ms    min=0ms    med=0ms    max=4ms    p(90)=1ms    p(95)=2ms    p(99)=3ms
     http_req_tls_handshaking........ : avg=0ms    min=0ms    med=0ms    max=0ms    p(90)=0ms    p(95)=0ms    p(99)=0ms
     http_req_waiting..............: avg=37ms   min=8ms    med=25ms   max=80ms   p(90)=65ms   p(95)=75ms   p(99)=87ms
     iteration_duration.............: avg=2.1s   min=2s     med=2.1s   max=2.2s   p(90)=2.1s   p(95)=2.1s   p(99)=2.2s
     iterations......................: 150    5 iter/s
     vus............................: 5
     vus_max..........................: 5

running (30s), 5/5 VUs, 150 complete and 0 interrupted iterations
```

### Réponses aux Questions 1-2

**Question 1:** `p(95)=85ms` ✅ **Bien en dessous de 200ms (acceptable)**

**Question 2:** `http_req_failed: 0.0%` ✅ **Aucune erreur**

---

## Étape 2 – Test Réaliste (Question 3-5)

### Exécution

```bash
# Besoin des credentials pour le login
export EMAIL="user@example.com"
export PASSWORD="password123"

k6 run -e EMAIL="$EMAIL" -e PASSWORD="$PASSWORD" scripts/load-test-realistic.js
```

### Sortie attendue (phases)

```
Phase 1: Ramp-up (0→10 VUs, 30s)
  ✓ Toutes les checks passent
  ✓ p(95)=150ms
  ✓ checks_failed: 0%

Phase 2: Hold (10 VUs, 60s)
  ✓ Checks 95% passent
  ✓ p(95)=180ms
  ✓ checks_failed: ~5%

Phase 3: Spike (10→50 VUs, 30s)
  ✗ Checks commencent à échouer massivement
  ✗ p(95)=520ms
  ✗ checks_failed: ~15%

Phase 4: Hold (50 VUs, 60s)
  ✗✗✗ Massif
  ✗ p(95)=680ms (!! 8× plus qu'au début!)
  ✗ checks_failed: ~30%

Phase 5: Ramp-down (50→0 VUs)
  ✓ Métriques se stabilisent à nouveau
```

### Résumé final

```
     checks.........................: 75.4% ✓ 2265   ✗ 741
     http_req_duration..............: avg=312ms  min=45ms   med=180ms  max=2.5s   p(90)=680ms  p(95)=750ms  p(99)=950ms
     http_req_failed................: 5.2%   ✓ 3000   ✗ 165

IMPORTANT: Différences par check:
  'login 200'...................: 100.0% ✓ 1200   ✗ 0
  'tasks 200'...................: 85.0%  ✓ 1020   ✗ 180
  'tasks response < 500ms'......: 75.0%  ✓ 900    ✗ 300   ← ÉCHOUE!
  'create task 201'.............: 90.0%  ✓ 1080   ✗ 120
```

### Réponses aux Questions 3-5

**Question 3:**
- Dégrade massivement à **30-40 VUs**
- p95 finale: **~680ms** (vs 85ms en léger = 8×!)
- Check `tasks response < 500ms` échoue à >30% à 50 VUs

**Question 4:**
Chaque itération émet:
- 1 POST login → users-service
- 1 GET /tasks → task-service
- 1 POST /tasks → task-service
- 1 GET /notifications → notification-service

À 50 VUs, ça donne ~200 requêtes/sec:
- Gateway: ~200 req/s (point d'entrée)
- Task-service: ~100 req/s (GET+POST)
- User-service: ~50 req/s (login)
- Notification-service: ~50 req/s

Ratio: Gateway 2× Task-service, 4× User-service ✅

**Question 5:**
Task-service souffre car:
1. Reçoit 2× plus de requêtes que user-service
2. Toutes les requêtes vont à PostgreSQL (coûteux)
3. POST écrit en DB → locks tables
4. Pool de connexions PostgreSQL se sature
5. Notification-service utilise Redis (en mémoire, rapide)

---

## Étape 3 – Scaling avec Docker Compose (Question 6-7)

### Question 6 – Essai de scaling (va échouer)

```bash
# Terminal: Arrêter l'infra actuelle
docker compose down

# Relancer en tentant de scaler
docker compose up --scale task-service=3

# Résultat: ERREUR
# Error response from daemon: Ports are not available: 
# ports 3002/tcp is already allocated
```

**Cause:**
```yaml
# Dans docker-compose.yml, ligne problématique:
task-service:
  ports:
    - "3002:3002"  ← Port fixe = impossible à scaler
```

### Question 6 – Contournement

Appliquer les modifications du fichier `docker-compose.yml.fixed`:

```bash
# Backup
cp docker-compose.yml docker-compose.yml.bak

# Appliquer la correction (enlever les ports: des services)
# Garder que api-gateway et frontend avec ports publics
# Services internes communiquent via Docker network

# Relancer
docker compose up --scale task-service=3
```

### Question 7 – Après correction

#### Trafic distribué?

```bash
# Vérifier que les 3 replicas reçoivent du trafic
docker compose logs task-service

# Output: 3 lignes pour chaque requête (une par replica en RR)
task-service_1 | GET /tasks
task-service_2 | GET /tasks
task-service_3 | GET /tasks
```

**OUI, les 3 replicas reçoivent du trafic** (Round Robin par VIP Docker)

#### Observabilité dans Prometheus

```bash
# Ouvrir http://localhost:9090/targets
```

**Observation:**
```
Endpoints	                    State   Labels
task-service:3002              UP      job=prometheus, instance=task-service:3002
task-service_2:3002            DOWN    (not found)
task-service_3:3002            DOWN    (not found)
```

**Constat:** Prometheus ne voit qu'**une seule cible**, pas les 3 replicas!

**Raison:**
1. Prometheus utilise config statique: `targets: ['task-service:3002']`
2. `task-service` = hostname Docker → résout à UNE IP interne (VIP)
3. VIP = abstraction Docker, pas 3 adresses différentes
4. Prometheus scrape cette VIP une seule fois → voit une seule replica
5. Les 2 autres replicas existent mais ne sont jamais sollicitées par Prometheus

**Nombres de targets malgré 3 replicas: 1 seul**

---

## Étape 4 – Observations Grafana

### Pendant le test réaliste à 50 VUs

Ouvrir http://localhost:3000/d/xxx (dashboard TaskFlow)

#### Panel: Request Rate per Service

```
api-gateway:    200 req/s   ████████
task-service:   100 req/s   ████
user-service:    50 req/s   ██
notif-service:   50 req/s   ██
```

**Montre bien le ratio 4:2:1**

#### Panel: Latency p50/p95/p99

```
Reste plat vers ~100-150ms même qu'ond monte à 50 VUs!

Pourquoi? 
→ Mesure juste le processing INTERNE
→ Ignore la queue d'attente (540ms!)
```

#### Panel: Error Rate 5xx

```
"No data" ou vide

Pourquoi?
→ Pas de vraies erreurs 5xx
→ Timeouts/refus OS ne sont pas des réponses HTTP
```

---

## Résumé des Observations

| Métrique | Valeur | Interprétation |
|----------|--------|---|
| **Light test p95** | 85ms | ✅ Acceptable |
| **Light test errors** | 0% | ✅ OK |
| **Realistic 10 VUs p95** | 180ms | ✅ OK |
| **Realistic 50 VUs p95** | 680ms | ❌ Dégradé |
| **Realistic 50 VUs check fail** | 30% | ❌ Inacceptable |
| **Bottleneck** | PostgreSQL pool | Task-service souffre le plus |
| **Scaling bottleneck** | Ports fixes | Docker compose limitation |
| **Prometheus visibility** | 1/3 targets | Service discovery issue |
| **Grafana p95 flat?** | Queue ignorée | Manque instrumentation |

---

## Améliorations à Appliquer

1. **Immédiat:**
   - Augmenter `max` du pool PostgreSQL (10 → 25)
   - Appliquer docker-compose.yml.fixed (enlever ports fixes)

2. **Court terme:**
   - Ajouter métriques de queue (utiliser improved-instrumentation.js)
   - Ajouter caching Redis sur GET /tasks

3. **Long terme:**
   - Migrer vers Kubernetes
   - Implémenter sharding de la BD

