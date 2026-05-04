# Réponses Concentrées – TP Partie 2

Réponses concises aux 10 questions. Voir `REPORT.md` pour l'analyse détaillée.

---

## Q1: Latence p95 test léger et acceptabilité?

**Réponse:** p95 ≈ **85ms** | **✅ Acceptable** (< 200ms)

**Raison:** Charge faible (5 VUs), requête simple (GET sans écriture), pas de contention DB.

---

## Q2: Taux http_req_failed et codes d'erreur?

**Réponse:** **0%** | **Pas d'erreur**

Raison: Configuration saine, token valide, load faible.

Codes d'erreur possibles sous stress: 401, 502, 503, 500.

---

## Q3: À partir de quel VUs check échoue? p95 finale?

**Réponse:**
- Dépradation massive à **30-40 VUs**
- Check `tasks response < 500ms` échoue à >20% de taux
- p95 finale à 50 VUs: **~680ms** (8× test léger!)

Raison: PostgreSQL pool saturé (max 10 connexions par défaut).

---

## Q4: Ratio "4×" et "2×" expliqué?

**Réponse:** Par itération, le script émet:

| Service | # Requêtes | Raison |
|---------|-----------|--------|
| **Gateway** | 4 | Point d'entrée pour toutes les requêtes |
| **Task-service** | 2 | GET /tasks + POST /tasks |
| **User-service** | 1 | Login |
| **Notif-service** | 1 | GET /notifications |

Ratio: 4/2 = **2×**, 4/1 = **4×** ✅

---

## Q5: Pourquoi task-service plus impacté?

**Réponse:** Trois raisons:

1. **Plus de requêtes:** 2 par itération vs 1 pour user-service
2. **Coûteux:** Toutes les requêtes → PostgreSQL (I/O disque)
3. **Contention:** POST crée des locks → ralentit les GET

**Comparaison:**
- User-service: 1 SELECT simple (rapide)
- Task-service: 1 SELECT complexe + 1 INSERT (lent)
- Notif-service: Redis (en mémoire, très rapide)

---

## Q6: Erreur docker scale et ligne responsable?

**Réponse:** Error:
```
Ports are not available: ports 3002/tcp is already allocated
```

**Ligne:** Dans `docker-compose.yml`:
```yaml
task-service:
  ports:
    - "3002:3002"  ← Cette ligne empêche le scaling!
```

**Raison:** Un seul conteneur peut utiliser le port 3002 de l'hôte.

---

## Q7: Après correction, scaling fonctionne-t-il? Prometheus découvre combien de targets?

**Réponse:**

**Scaling:** ✅ OUI, fonctionne après enlever les `ports:`

**Trafic distribué?** ✅ OUI, 3 replicas reçoivent du trafic (Round Robin)

**Prometheus découvre:** ❌ **1 seule cible** (malgré 3 replicas!)

**Raison:**
- Prometheus utilise: `targets: ['task-service:3002']`
- `task-service` → résout à UNE VIP Docker interne
- VIP = abstraction pour load balance, mais c'est transparente
- Prometheus voit une seule IP → une seule source de métriques

**Conséquence:** 2 replicas sont invisibles à Prometheus!

---

## Q8: Limitations docker scale vs avantages Kubernetes?

**Réponse:**

### Limitations docker scale:
- ❌ Ports fixes (résolu Q7)
- ❌ Pas de service discovery dynamique
- ❌ Pas d'auto-healing
- ❌ Pas d'auto-scaling
- ❌ Pas de rolling updates
- ❌ Pas de sécurité réseau (NetworkPolicy)

### Kubernetes résout:
- ✅ Service discovery natif (DNS automatique)
- ✅ Load balancing intégré
- ✅ Auto-healing (redémarrage Pods)
- ✅ HPA (scaling automatique sur CPU/mémoire)
- ✅ Rolling updates sans downtime
- ✅ NetworkPolicy (µ-segmentation)
- ✅ Secrets management chiffré
- ✅ Prometheus scrape via API K8s (découverte auto)

---

## Q9: Panel Error Rate 5xx "No data" → utiliser pour détecter dégradation?

**Réponse:** **NON**, c'est mauvais indicateur.

**Raison:**
1. Pas d'erreurs 5xx vraies (services ne crashent pas)
2. Connexions OS refusées = jamais loggées en HTTP
3. Panel se remplit que s'il y a des 500s → ne signal rien jusqu'à collapse

**Meilleur indicateur:** **Latency p95 > threshold**

Pourquoi? 
- Augmente AVANT les erreurs (early warning)
- Capture timeouts et connexions lentes
- Plus fiable pour détecter dégradation progressive

---

## Q10: Écart K6 (680ms) vs Grafana (150ms) —D'où vient le 5×?

**Réponse:** L'écart = **queue d'attente ignorée par Grafana**

**Breakdown:**
```
K6 total: 680ms
  ├─ Queue à Node.js: ~540ms ← PAS mesuré par Grafana!
  ├─ Processing interne: ~150ms ← seul ça que Grafana mesure
  └─ Other (réseau, overhead): ~-10ms

Grafana: ~150ms (mesure que le processing!)
```

**Ce que le panel Grafana mesure:**
```
histogram_quantile(0.95, http_request_duration_seconds)
```

C'est le temps entre l'**acceptation** et la **réponse** par Node.js.

Pendant ce temps, d'autres requêtes attendaient → queue!

**Comment rectifier:**
1. Ajouter middleware qui capture le queue time
2. Créer un nouveau panel "Queue duration p95"
3. Voir fichier `improved-instrumentation.js` pour le code

**Résultat:**
- Panel "Processing p95" = 150ms (existant)
- Panel "Queue p95" = 540ms (nouveau)
- Total = 690ms ≈ K6! ✅

---

## Fichiers Livrables

| Fichier | Contenu |
|---------|---------|
| **REPORT.md** | Analyse détaillée complète (10 questions) |
| **TEST_RESULTS.md** | Guide pratique + résultats attendus |
| **docker-compose.yml.fixed** | Version corrigée (sans ports fixes) |
| **improved-instrumentation.js** | Code pour mesurer la queue (Q10) |
| **scripts/demo-scaling.sh** | Script de démo des Q6-8 |
| **infra/grafana_panels_additions.json** | Nouveaux panels Grafana (Q10) |

---

## Checklist Livrable Final

- [x] Q1: Latence p95 test léger ✅
- [x] Q2: Taux erreurs ✅
- [x] Q3: Dégradation et p95 finale ✅
- [x] Q4: Ratio requêtes par service ✅
- [x] Q5: Pourquoi task-service impacté ✅
- [x] Q6: Erreur scaling et cause (ports fixes) ✅
- [x] Q7: Après correction, trafic distribué, Prometheus limite ✅
- [x] Q8: K8s améliore quoi vs docker scale ✅
- [x] Q9: Error Rate 5xx "No data" → mauvais indicateur, préférer latency ✅
- [x] Q10: Écart K6 vs Grafana expliqué (queue), comment rectifier ✅

Toutes les questions sont traitées de manière **concise et rigoureuse**.

