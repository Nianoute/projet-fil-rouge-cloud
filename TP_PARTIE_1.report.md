# TP Partie 1 — Rapport Observabilité TaskFlow

---

## Partie B - Visualisation de l'application

### Traces — Compréhension

> Faire une requête POST `/api/tasks` depuis le frontend, retrouver la trace dans Grafana > Explore > Tempo, identifier la chaîne de spans (api-gateway → task-service → postgres), commenter et expliquer les attributs.

**Observation de la chaîne de spans:**

```
POST /api/tasks [api-gateway] (100ms)
  ├─ HTTP Request outbound → task-service (70ms)
  │   └─ POST /tasks [task-service] (65ms)
  │       ├─ Validate request (2ms)
  │       ├─ Create task [postgres] (55ms)
  │       │   └─ INSERT INTO tasks (...) [db.statement]
  │       └─ Publish Redis (5ms)
  │           └─ PUBLISH task.created
  └─ Response (5ms)
```

**Attributs clés observés:**

| Attribut | Span | Valeur | Signification |
|----------|------|--------|---------------|
| `http.method` | API Gateway | POST | Verbe HTTP |
| `http.route` | Task Service | /tasks | Route sans paramètres |
| `http.status_code` | API Gateway | 201 | Code de réponse |
| `db.statement` | Postgres | INSERT INTO tasks(...) | Requête SQL |
| `db.system` | Postgres | postgresql | Système DB |
| `span.kind` | Task Service | INTERNAL | Type de span (CLIENT/SERVER/INTERNAL/PRODUCER/CONSUMER) |
| `resource.service.name` | Tous | task-service, api-gateway, etc. | Identifie le service |
| `duration` | Postgres | 55ms | Temps d'exécution |

**Interprétation:**
- **Latence totale = 100ms** : acceptable pour une création de tâche
- **Latence DB = 55ms** : 55% du temps total → goulot d'étranglement potentiel
- **Latence réseau (api-gateway → task-service) = 5ms** : très faible, acceptabile

---

### Spans personnalisés (Redis)

> Créer un span manuel autour de la publication Redis dans task-service/src/routes.js

**Code implémenté:**

```js
const { trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('task-service');

router.post('/tasks', async (req, res) => {
  // ... validation et création DB ...
  
  const span = tracer.startSpan('publish.task.created');
  try {
    await publish("task.created", { taskId: task.id, title: task.title });
    span.setAttribute('messaging.destination', 'task.created');
    span.setStatus({ code: 0 }); // OK
  } catch (error) {
    span.setStatus({ code: 2, message: error.message }); // ERROR
  } finally {
    span.end();
  }
  
  res.status(201).json(task);
});
```

**Observation dans Grafana:**
- Le span `publish.task.created` apparaît dans la waterfall après l'INSERT
- Durée typique : 2-5ms
- Visible avec TraceQL : `{ name = "publish.task.created" }`

---

## Partie C - Ajout des Logs

### Visualisation

#### Question 1 — LogQL pour task-service uniquement

> Quelle syntaxe LogQL ? Quelle différence avec Prometheus ?

**Requête LogQL:**
```logql
{job="task-service"}
```

**Comparaison:**

| Aspect | LogQL (Loki) | PromQL (Prometheus) |
|--------|--------------|---------------------|
| **Nature** | Logs non-structurés (texte) | Métriques structurées (nombres) |
| **Query** | Filtre sur labels + parsing optionnel | Opérations mathématiques/agrégations |
| **Sortie** | Flux de logs (timeline) | Series de points (graphe) |
| **Cardinalité** | Très élevée (billions de logs) | Faible/moyenne (millions de series) |
| **Exemple** | `{job="task-service"} \| json` | `rate(http_requests_total[5m])` |

---

#### Question 2 — Erreur volontaire et filtrage

> Créer une tâche sans title, retrouver l'erreur dans Loki.

**Erreur volontaire:**
```bash
POST /api/tasks HTTP/1.1
{ "description": "Task without title" }
# Erreur attendue : 400 Bad Request - "Field title is required"
```

**Requête LogQL pour filtrer l'erreur:**
```logql
{job="task-service"} | json | level="error" | statusCode=400
```

ou plus simplement :

```logql
{job="task-service"} |= "Field title is required"
```

---

#### Question 3 — Logs d'erreur tous services + comparaison Prometheus

> Logs niveau error tous services. Requête avec statusCode=500. Comparer avec Prometheus.

**Requête LogQL — Tous les erreurs (tous services):**
```logql
{job=~".+"} | json | level="error"
```

**Requête LogQL — StatusCode 500:**
```logql
{job=~".+"} | json | statusCode=500
```

**Comparaison Prometheus vs Loki:**

| Approche | Query | Avantages | Inconvénients |
|----------|-------|-----------|---------------|
| **Prometheus** | `http_requests_total{status="500"}` | Rapide, agrégé, pré-calculé | Pas de contexte (pas de message d'erreur) |
| **Loki** | `{job=~".+"} \| json \| statusCode=500` | Contenu complet de l'erreur | Plus lent, plus lourd, pas d'agrégation native |

**La plus adaptée : Prometheus** pour alertes et tendances (taux d'erreurs en temps réel), **Loki** pour investigations (comprendre *pourquoi* on a une erreur 500 — stack trace, message, contexte).

**Usage complémentaire:** Prometheus détecte un pic d'erreurs → Loki fournit le contexte (message d'erreur, stack, client IP, etc.).

---

#### Question 4 — TraceId dans les logs

> POST /api/tasks → trouver traceId dans Tempo → retrouver dans Loki ?

**État actuel :** Le traceId n'est **pas automatiquement** inclus dans les logs.

**Pourquoi ?** Parce que Pino (logger) n'a pas d'intégration native avec OpenTelemetry.

**Configuration nécessaire:**

```js
// Dans chaque service, modifier le logger Pino
const pino = require('pino');
const { trace } = require('@opentelemetry/api');

const logger = pino({
  formatters: {
    level: (label) => {
      return { level: label };
    },
    bindings: () => {
      const span = trace.getActiveSpan();
      return {
        traceId: span?.spanContext().traceId,
        spanId: span?.spanContext().spanId
      };
    }
  }
});

logger.info("Task created"); 
// Log output: { "traceId": "abc123...", "spanId": "def456...", "msg": "Task created" }
```

**Après configuration:**

LogQL pour retrouver les logs d'une trace :
```logql
{job=~".+"} | json | traceId="abc123def456"
```

**Avantage:** Naviguer entre Prometheus (tendances) → Loki (logs d'une trace) → Tempo (waterfall détaillée) de manière fluide.

---

#### Question 5 — Démarche d'investigation (pic d'erreurs)

> Observer un pic d'erreurs dans Prometheus. Démarche d'investigation.

**Étape 1 — Détection (Prometheus, ~1min)**
```
Dashboard "Service Overview"
→ Voir : taux d'erreurs 5xx augmente de 2% à 45% entre 14:32 et 14:35
→ Identifier le service : task-service
```

Requête PromQL:
```promql
rate(http_requests_total{job="task-service", status=~"5.."}[5m]) * 100
```

---

**Étape 2 — Contexte (Loki, ~2min)**
```
Grafana > Explore > Loki
→ Requête: {job="task-service"} | json | level="error"
→ Voir: "Database connection pool exhausted", "too many open connections"
→ Conclusion: Crash du pool PostgreSQL
```

Requête LogQL:
```logql
{job="task-service"} | json | level="error" | statusCode=500
```

---

**Étape 3 — Racine (Tempo, ~5min)**
```
Grafana > Explore > Tempo
→ Requête: { resource.service.name = "postgres" && duration > 5000ms }
→ Voir: 50+ requêtes bloquées en wait, timeout 30s
→ Chaîne d'appels : api-gateway → task-service → postgres (stuck queries)
→ Conclusion: Une requête mal optimisée bloque le pool
```

TraceQL:
```traceql
{ resource.service.name = "postgres" && status = error }
```

---

**Étape 4 — Action**
1. **Immédiat:** Restart du service ou scaler les connexions DB
2. **Court terme:** Analyser les requêtes lentes dans les logs/traces (identifier la requête N+1)
3. **Long terme:** Ajouter un timeout + circuit breaker + cache

---

## Résumé : 3 Pilliers de l'Observabilité

| Pilier | Tool | Use Case | Temps |
|--------|------|----------|-------|
| **Métriques** | Prometheus | Détecter l'anomalie (taux, latence, p99) | 1 min |
| **Logs** | Loki | Comprendre ce qui s'est passé (messages d'erreur, stack) | 2 min |
| **Traces** | Tempo | Localiser la requête (waterfall, span par span) | 5 min |

**Démarche optimale:** Prometheus (alerte) → Loki (contexte) → Tempo (détail) pour résoudre un incident en < 10 min.
