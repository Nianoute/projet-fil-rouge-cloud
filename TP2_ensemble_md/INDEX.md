# 📚 Index Centralisé des Livrables — TP Partie 2

Navigation rapide vers tous les fichiers et réponses.

---

## ⚡ Quick Links

### Réponses Directes
- **ANSWERS.md** — Les 10 réponses ultra-concises (5 min)
- **SUMMARY.md** — Résumé exécutif (10 min)

### Analyse Détaillée
- **REPORT.md** — Analyse complète avec explications techniques (30 min)
- **TEST_RESULTS.md** — Guide pratique avec résultats attendus (20 min)

### Implementation & Code
- **docker-compose.yml.fixed** — Compose sans ports fixes (Q6 solution)
- **scripts/improved-instrumentation.js** — Queue metrics (Q10 solution)
- **infra/grafana_panels_additions.json** — Nouveaux panels (Q10 solution)
- **scripts/demo-scaling.sh** — Explications détaillées (Q6-8)

### Exécution des Tests
- **scripts/run-tests.sh** — Guide complet avec toutes les commandes

---

## 🎯 Par Objectif

### Je dois répondre aux questions du TP
```
1. Ouvrir: ANSWERS.md
2. Chaque question = 2-3 lignes de réponse
3. Ajouter captures d'écran K6 + Grafana
4. Livrer ✅
```

### Je veux comprendre les problèmes
```
1. Lire: SUMMARY.md (5 min)
2. Lire: REPORT.md complet (30 min)
3. Exécuter: scripts/run-tests.sh pour voir (30 min)
4. Total: 1h15 pour maîtriser le sujet
```

### Je veux implémenter les corrections
```
1. Lire: REPORT.md Q6/Q10 (explications)
2. Appliquer: docker-compose.yml.fixed
3. Intégrer: scripts/improved-instrumentation.js
4. Ajouter: infra/grafana_panels_additions.json
5. Tester via: scripts/run-tests.sh
```

### Je veux reproduire exactement les résultats
```
1. Suivre: TEST_RESULTS.md prérequis
2. Exécuter: scripts/run-tests.sh terminal par terminal
3. Observer: Grafana pendant les tests
4. Comparer: Vos résultats avec les sorties attendues
```

### Je veux passer à Kubernetes
```
1. Lire: REPORT.md Q8 (avantages détaillés)
2. Exécuter: scripts/demo-scaling.sh (explications + exemples)
3. Déployer: Utiliser les configs K8s YAML du script
4. Comparer: Problèmes résolus vs Docker Compose
```

---

## 📋 Les 10 Questions — Où Trouver?

| Q# | Titre | ANSWERS.md | REPORT.md | TEST_RESULTS | Code/Démo |
|----|-------|-----------|---------|---------------|-----------|
| **Q1** | Latence p95 léger < 200ms? | Section 1 | Q1 | Étape 1 | - |
| **Q2** | http_req_failed = 0%? | Section 2 | Q2 | Étape 1 | - |
| **Q3** | Dégradation à quel VU? | Section 3 | Q3 | Étape 2 | run-tests.sh |
| **Q4** | Ratio Gateway/Task 4× 2×? | Section 4 | Q4 | Étape 2 | load-test-realistic.js |
| **Q5** | Pourquoi task-service impacté? | Section 5 | Q5 | Étape 2 | run-tests.sh |
| **Q6** | Erreur scaling + cause? | Section 6 | Q6 | Étape 3 | docker-compose.yml.fixed |
| **Q7** | Trafic distribué? Prometheus? | Section 7 | Q7 | Étape 3 | docker-compose.yml.fixed |
| **Q8** | K8s vs docker scale? | Section 8 | Q8 | - | demo-scaling.sh |
| **Q9** | Error Rate 5xx utile? | Section 9 | Q9 | Obs 3 | - |
| **Q10** | Écart K6 vs Grafana? | Section 10 | Q10 | Obs 4 | improved-instrumentation.js |

---

## 📂 Structure des Fichiers

```
Réponses & Analyses:
├─ ANSWERS.md ...................... Q1-Q10 réponses directes
├─ REPORT.md ....................... Analyse complète (détails tech)
├─ SUMMARY.md ...................... Vue d'ensemble
├─ TEST_RESULTS.md ................. Guide pratique + observations

Implémentation:
├─ docker-compose.yml.fixed ........ Remove ports fixes (Q6-Q7)
├─ scripts/improved-instrumentation.js . Queue metrics (Q10)
├─ infra/grafana_panels_additions.json . Panels (Q10)

Exécution:
├─ scripts/run-tests.sh ............ Guide complet étape-par-étape
├─ scripts/demo-scaling.sh ......... Explication Q6-Q8 + K8s

Reference:
├─ README_DELIVERABLES.md ......... Organisation des fichiers
└─ INDEX.md ........................ Tu es ici
```

---

## 🔍 Topics Index

### Performance & Latency
- K6 vs Grafana latency difference → REPORT.md Q10
- Test léger 85ms → ANSWERS.md Q1
- Test réaliste dégradation → ANSWERS.md Q3 + TEST_RESULTS.md Étape 2
- Queue time metrics → improved-instrumentation.js

### Load Testing
- Load test légère → TEST_RESULTS.md Étape 1
- Load test réaliste → TEST_RESULTS.md Étape 2
- Commandes K6 → scripts/run-tests.sh

### Service Distribution & Scaling
- Ratio requêtes par service → ANSWERS.md Q4
- Task-service bottleneck → ANSWERS.md Q5
- Docker scaling error → ANSWERS.md Q6
- Docker compose fix → docker-compose.yml.fixed
- Kubernetes improvements → ANSWERS.md Q8 + scripts/demo-scaling.sh

### Observability
- Grafana metrics gaps → ANSWERS.md Q10
- Error Rate 5xx panel → ANSWERS.md Q9
- Adding queue metrics → improved-instrumentation.js
- New Grafana panels → grafana_panels_additions.json

### Infrastructure
- Database pool saturation → REPORT.md Q5
- Prometheus service discovery → REPORT.md Q7
- Docker network modes → docker-compose.yml.fixed
- Kubernetes architecture → scripts/demo-scaling.sh

---

## 🚀 Workflow Recommandé

### Pour l'étudiant qui rend le TP
```
1. Lire SUMMARY.md (5 min) ← Comprendre le contexte
2. Copier ANSWERS.md (5 min) ← Les réponses
3. Ajouter captures: K6 terminal + Grafana screenshot (10 min)
4. Relire REPORT.md Q1-Q10 (15 min) ← Vérifier cohérence
5. Soumettre ✅ (Total: 35 min)
```

### Pour l'étudiant qui veut maîtriser le sujet
```
1. Lire SUMMARY.md (5 min)
2. Lire REPORT.md complet (30 min)
3. Exécuter scripts/run-tests.sh (45 min)
4. Comparer avec TEST_RESULTS (10 min)
5. Lire ANSWERS.md pour validation (5 min)
6. Total: 95 min pour la maîtrise complète
```

### Pour le développeur qui veut implémenter
```
1. Lire REPORT.md Q6-Q7 (10 min) → Comprendre le problème
2. Appliquer docker-compose.yml.fixed (5 min)
3. Lire REPORT.md Q10 (15 min) → Comprendre queue metrics
4. Intégrer improved-instrumentation.js (20 min)
5. Ajouter grafana_panels_additions.json (10 min)
6. Tester avec scripts/run-tests.sh (30 min)
7. Total: 90 min pour passer en production
```

---

## 📞 FAQ Navigation

**Q: Où trouver la réponse à la question 5?**  
A: ANSWERS.md section 5, ou REPORT.md Q5 pour plus de détails

**Q: Comment reproduire le test léger (Q1)?**  
A: TEST_RESULTS.md "Étape 1", puis scripts/run-tests.sh "TERMINAL 1"

**Q: Où est le code pour corriger le port fixe?**  
A: docker-compose.yml.fixed (appliquer en remplacement du docker-compose.yml)

**Q: Comment ajouter la queue metrics?**  
A: Intégrer scripts/improved-instrumentation.js + grafana_panels_additions.json

**Q: Pourquoi K6 mesure 680ms et Grafana seulement 150ms?**  
A: ANSWERS.md Q10 pour résumé, REPORT.md Q10 pour explication complète

**Q: Comment déployer sur Kubernetes?**  
A: Lire scripts/demo-scaling.sh (inclut configuration K8s YAML complète)

---

## ✅ Checklist de Lecture

- [ ] J'ai lu SUMMARY.md (vue d'ensemble: 5 min)
- [ ] J'ai lu ANSWERS.md (les 10 réponses: 10 min)
- [ ] J'ai lu REPORT.md Q1-5 (performance: 20 min)
- [ ] J'ai lu REPORT.md Q6-8 (scaling: 15 min)
- [ ] J'ai lu REPORT.md Q9-10 (observabilité: 15 min)
- [ ] J'ai regardé docker-compose.yml.fixed (solution Q6)
- [ ] J'ai créé un token JWT pour tester
- [ ] J'ai exécuté test léger sur mon infra
- [ ] J'ai exécuté test réaliste et observé Grafana
- [ ] J'ai compris chaque réponse du TP

Total lectures recommandé: **80 minutes**

---

## 🎯 One-Liners

**Je veux les réponses:** `cat ANSWERS.md`

**Je veux l'analyse:** `cat REPORT.md`

**Je veux reproduire:** `bash scripts/run-tests.sh`

**Je veux implémenter:** `cp docker-compose.yml.fixed docker-compose.yml && vi scripts/task-service.js`

**Je veux Kubernetes:** `bash scripts/demo-scaling.sh`

---

**Créé:** Mai 2026  
**Statut:** ✅ Complet et prêt à utiliser

