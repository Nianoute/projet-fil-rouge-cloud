# TaskFlow — TP Cloud & DevOps

Architecture multi-services pour apprendre Kubernetes, l'observabilité et le CI/CD.

## Services

| Service | Port | Rôle |
|---|---|---|
| api-gateway | 4000 | Point d'entrée unique, auth JWT |
| user-service | 3001 | Gestion des utilisateurs |
| task-service | 3002 | CRUD des tâches |
| notification-service | 3003 | Événements via Redis Pub/Sub |
| frontend | 5173 | Interface React |

## Infrastructure

### Services applicatifs

| Outil | Port | Rôle |
|---|---|---|
| PostgreSQL | 5432 | Base de données principale |
| Redis | 6379 | Bus de messages entre services |

### Stack d'observabilité

| Outil | Port | Rôle |
|---|---|---|
| Prometheus | 9090 | Collecte des métriques |
| Grafana | 3000 | Visualisation (métriques, logs, traces) |
| Tempo | 3200 | Backend de traces distribuées |
| Loki | 3101 | Agrégation des logs |
| OTel Collector | 4317/4318 | Récepteur traces/métriques (gRPC/HTTP) |

## Démarrage rapide

```bash
# Installation des dépendances
npm run install:all

# Lancer l'app
npm run dev

# Lancer l'infra d'observabilité (dans un autre terminal)
docker compose -f docker-compose.infra.yml up -d
```

## Configuration de l'observabilité

### Accès Grafana

- **URL** : http://localhost:300
- **Login** : admin / admin

### Métriques clés instruées

**task-service** :
- `tasks_created_total{priority}` — Tâches créées par priorité
- `tasks_status_changes_total{from_status,to_status}` — Transitions de statut
- `tasks_gauge{status}` — Nombre de tâches actuelles par statut

**user-service** :
- `user_registrations_total` — Enregistrements
- `user_login_attempts_total{success}` — Tentatives de connexion

**api-gateway** :
- `upstream_errors_total{service}` — Erreurs upstream (502)

**notification-service** :
- `notifications_sent_total{event_type}` — Notifications envoyées

---

## TP Partie 1 — Réponses aux questions

### Traces : Compréhension générale

**Scénario** : POST `/api/tasks` → Grafana > Explore > Tempo

**Chaîne de spans observée** :
1. `POST /api/tasks` (api-gateway)
   - `http.method = POST`
   - `http.route = /api/tasks`
   - `http.status_code = 201`
   
2. `POST /tasks` (task-service)
   - `http.method = POST`
   - `http.target = /tasks`
   - Contient les 2 spans enfants :
   
3. `INSERT INTO tasks ...` (PostgreSQL)
   - `db.system = postgresql`
   - `db.statement = INSERT INTO tasks (...) VALUES (...)`
   - `db.connection_string = postgresql://...`

**Attributs clés expliqués** :
- `http.method` / `http.route` : Indique la méthode HTTP et la route appelée
- `db.statement` : Requête SQL brute exécutée
- `duration` : Latence totale du span
- `status` : `ok` ou `error` selon la réussite

### Traces : Spans custom

**Implémentation** : Dans [task-service/src/routes.js](task-service/src/routes.js), span manuel autour du publish Redis :

```js
const { trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('task-service');

const span = tracer.startSpan('publish.task.created');
await publish("task.created", { ... });
span.end();
```

**Observation** : Ce span `publish.task.created` apparaît dans la vue waterfall de Grafana, entre l'INSERT et la réponse HTTP.

---

### Logs : Syntaxe LogQL vs PromQL

| Aspect | **PromQL** | **LogQL** |
|--------|-----------|---------|
| **Type** | Métriques (nombres) | Logs (texte brut/structuré) |
| **Filtre simple** | `http_requests_total{status="500"}` | `{job="task-service"} \|= "error"` |
| **Parsing JSON** | N/A (déjà agrégé) | `{job="task-service"} \| json \| level="error"` |
| **Agrégation** | `rate()`, `sum()` | `rate()` sur les logs parsés |
| **Requête** | Valeur pour chaque timestamp | Tous les logs matchant les filtres |

**Différence clé** : PromQL agrège déjà les métriques; LogQL retourne les logs bruts et permet le parsing post-hoc.

---

### Logs : Filtrer une erreur spécifique

**Scénario** : Créer une tâche sans `title` → erreur attendue

**Requête LogQL** :
```logql
{job="task-service"} | json | level="error" | statusCode="400"
```

**Résultat** : Affiche le log d'erreur avec le message "title is required".

---

### Logs : Comparaison des approches (Prometheus vs Loki)

**Approche Prometheus** :
```promql
http_requests_total{status="500"}
```
- ✅ Rapide, agrégé, optimisé
- ❌ Ne montre pas la raison de l'erreur

**Approche Loki** :
```logql
{job=~".+"} | json | statusCode >= 500
```
- ✅ Détails complets du contexte
- ❌ Plus lent, pas d'histogramme temps

**Verdict** : **Prometheus pour la détection**, **Loki pour le diagnostic**.

---

### Logs : Correlation trace ID

**Question** : Le traceId d'une trace Tempo apparaît-il dans les logs Loki ?

**Réponse** : **Non, pas automatiquement**. Il faudrait :

1. Configurer OpenTelemetry pour injecter le traceId dans les logs Pino via `@opentelemetry/auto-instrumentations-node`
2. Parser le JSON Loki et rechercher le champ `traceId`

**Configuration** : Éditer `infra/promtail/promtail.yml` pour ajouter le parsing du traceId.

---

### Logs + Traces : Démarche d'investigation complète

**Scénario** : Pic d'erreurs observé à 14h32 dans Prometheus.

**Démarche** :

1. **ÉTAPE 1 — Metrics (Prometheus)**
   ```promql
   rate(http_requests_total{status=~"5.."}[5m])
   ```
   → Identifie le taux d'erreur, le service affecté, l'heure exacte

2. **ÉTAPE 2 — Logs (Loki)**
   ```logql
   {job="task-service"} | json | level="error" | statusCode >= 500
   ```
   → Affiche le message d'erreur : *"Cannot connect to database"*
   → Confirme que c'est un problème de connexion PostgreSQL

3. **ÉTAPE 3 — Traces (Tempo)**
   ```traceql
   { resource.service.name = "task-service" && status = error && duration > 5000ms }
   ```
   → Vue waterfall : task-service → PostgreSQL (timeout 5s)
   → Confirme le bottleneck exact

**Conclusion** : PostgreSQL était hors ligne pendant 5 minutes.

---

## Requêtes utiles

### Prometheus

```promql
# Taux d'erreurs par service
sum by (job) (rate(http_requests_total{status=~"5.."}[5m]))

# Latence p99
histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m]))

# Tâches créées par minute
rate(tasks_created_total[1m]) * 60
```

### Loki

```logql
# Tous les logs d'erreur
{job=~".+"} | json | level="error"

# Erreurs sur un service spécifique
{job="task-service"} | json | level="error"

# Requêtes en 500
{job=~".+"} | json | statusCode >= 500
```

### Tempo

```traceql
# Traces lentes
{ duration > 1000ms }

# Erreurs sur task-service
{ resource.service.name = "task-service" && status = error }
```
