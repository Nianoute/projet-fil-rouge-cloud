# ⚡ TL;DR — Les 10 Réponses en 30 Secondes

Résumé ultra-rapide des 10 questions du TP Partie 2.

---

## 1️⃣ Latence p95 test léger?
**~85ms** ✅ Acceptable (< 200ms)

## 2️⃣ http_req_failed = 0%?
**OUI** ✅ Aucune erreur

## 3️⃣ Dégradation à quel VU?
**30-40 VUs** → p95 passe de 85ms à **680ms** (8×)

## 4️⃣ Ratio Gateway/Task 4× 2×?
**Expliqué par:** 4 req/iter → Gateway, 2 req/iter → Task, 1 → User, 1 → Notif

## 5️⃣ Pourquoi task-service impacté?
**PostgreSQL pool saturé** (max 10 connections) + 2 req/iter + écritures

## 6️⃣ Erreur docker scale?
**Port 3002 fixe** → Impossible de créer 3 conteneurs sur même port

## 7️⃣ Après correction, scaling OK?
**✅ OUI:** Trafic distribué aux 3 replicas  
**❌ MAIS:** Prometheus ne voit qu'une cible (service discovery limité)

## 8️⃣ Avantages Kubernetes?
**Service discovery** + **Auto-healing** + **HPA** + **Rolling updates** + **NetworkPolicy**

## 9️⃣ Error Rate 5xx pour détecter?
**❌ NON** → Utiliser **Latency p95** à la place

## 🔟 Écart K6 (680ms) vs Grafana (150ms)?
**Queue d'attente (540ms) ignorée par Grafana**  
Solution: Ajouter middleware queue metrics

---

## 📁 Fichiers à Lire

| Si vous voulez... | Lisez... |
|---|---|
| Les 10 réponses | **ANSWERS.md** |
| Approfondir | **REPORT.md** |
| Reproduire les tests | **TEST_RESULTS.md** ou **scripts/run-tests.sh** |
| Implémenter Q6-Q7 | **docker-compose.yml.fixed** |
| Implémenter Q10 | **scripts/improved-instrumentation.js** |
| Comprendre K8s | **REPORT.md Q8** ou **scripts/demo-scaling.sh** |

---

**✅ Prêt à utiliser immédiatement!**

