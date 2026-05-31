# Organisation des Fichiers Livrables

## 📖 Comment Naviguer

### Pour les **étudiants/correcteurs** qui relisent le TP

```
START HERE:
├─ ANSWERS.md .......................... Les 10 réponses ultra-concises
│  └─ Idéal pour: Vérification rapide, validation answers
│
├─ REPORT.md ........................... Analyse complète et rigoureuse
│  └─ Idéal pour: Approfondir chaque question avec explications tech
│
└─ SUMMARY.md .......................... Vue d'ensemble du livrable
   └─ Idéal pour: Comprendre ce qui a été fait
```

### Pour les **développeurs** qui veulent implémenter

```
IMPLEMENTATION:
├─ docker-compose.yml.fixed ........... Compose sans ports fixes
│  └─ Commit: Replace docker-compose.yml with this
│
├─ scripts/improved-instrumentation.js  Module Node.js pour queue metrics
│  └─ Commit: Add to task-service, user-service, notification-service
│
├─ infra/grafana_panels_additions.json  Nouveaux panels Prometheus
│  └─ Commit: Add to Grafana dashboard config
│
└─ scripts/demo-scaling.sh ............ Démo des problèmes et solutions
   └─ Commit: For future reference/training
```

### Pour les **testeurs** qui veulent reproduire

```
TESTING:
├─ TEST_RESULTS.md .................... Guide complet + sorties attendues
│  └─ Section 1-4: Tests K6 étape par étape
│
├─ scripts/run-tests.sh ............... Script automatisé
│  └─ Copy-paste les commandes pour reproduire
│
└─ TEST_RESULTS.md (Section "Résumé") . Vérifier vos résultats
   └─ Compare avec les observations données
```

---

## 📊 Fichiers par Question

| Question | Réponse Courte | Analyse | Code/Démo | Test |
|----------|----------------|---------|-----------|------|
| Q1-Q2 | ANSWERS.md | REPORT.md Q1-Q2 | - | TEST_RESULTS.md Étape 1 |
| Q3-Q5 | ANSWERS.md | REPORT.md Q3-Q5 | TEST_RESULTS.md | TEST_RESULTS.md Étape 2 |
| Q6-Q7 | ANSWERS.md | REPORT.md Q6-Q7 | docker-compose.yml.fixed | TEST_RESULTS.md Étape 3 |
| Q8 | ANSWERS.md | REPORT.md Q8 | scripts/demo-scaling.sh | - |
| Q9 | ANSWERS.md | REPORT.md Q9 | TEST_RESULTS.md | TEST_RESULTS.md Obs 3 |
| Q10 | ANSWERS.md | REPORT.md Q10 | improved-instrumentation.js | TEST_RESULTS.md + Grafana |

---

## 🎯 Use Cases

### "Je dois rendre le TP maintenant"
```
1. Ouvrir ANSWERS.md
2. Copier les 10 réponses
3. Ajouter captures d'écran de Grafana + K6 terminal
4. Done ✅
```

### "Je veux comprendre en profondeur"
```
1. Lire SUMMARY.md (vue d'ensemble)
2. Lire REPORT.md complet
3. Lire TEST_RESULTS.md (contexte pratique)
4. Optionnel: Exécuter les tests (scripts/run-tests.sh)
```

### "Je veux repliquer les résultats"
```
1. Suivre TEST_RESULTS.md Prérequis
2. Lancer npm run dev:infra (Terminal 1)
3. Exécuter les 4 tests K6 (Terminal 2)
4. Observer Grafana pendant (Terminal 3)
5. Comparer avec les observations attendues
```

### "Je veux ajouter la queue metrics"
```
1. Lire REPORT.md Q10 (contexte)
2. Copier improved-instrumentation.js
3. Intégrer dans task-service, user-service
4. Ajouter les panels Grafana (grafana_panels_additions.json)
5. Relancer les tests
```

### "Je veux passer à Kubernetes"
```
1. Lire REPORT.md Q8 (avantages)
2. Exécuter scripts/demo-scaling.sh
3. Utiliser les configurations K8s du script
4. Redéployer sur K8s au lieu de Docker
```

---

## 📂 Structure Complète du Repo

```
taskflow-app/
├─ ANSWERS.md ............................ ⭐ START HERE
├─ REPORT.md ............................ ⭐ Analyse détaillée
├─ SUMMARY.md ........................... ⭐ Vue d'ensemble
├─ TEST_RESULTS.md ...................... ⭐ Guide pratique
├─ README_DELIVERABLES.md ............... ← Tu es ici
│
├─ docker-compose.yml ................... (original)
├─ docker-compose.yml.fixed ............. (SOLUTION Q6-Q7)
├─ docker-compose.infra.yml ............. (observabilité)
│
├─ scripts/
│  ├─ load-test-light.js
│  ├─ load-test-realistic.js
│  ├─ run-tests.sh ...................... (guide exécution)
│  ├─ demo-scaling.sh ................... (SOLUTION Q6-Q8)
│  ├─ improved-instrumentation.js ....... (SOLUTION Q10)
│  └─ init.sql
│
├─ infra/
│  ├─ grafana_panels_additions.json ..... (SOLUTION Q10)
│  ├─ grafana/provisioning/...
│  ├─ prometheus/prometheus.yml
│  ├─ otel/config.yml
│  ├─ tempo/tempo.yml
│  └─ ...
│
├─ api-gateway/
├─ task-service/
├─ user-service/
├─ notification-service/
├─ frontend/
└─ ... (services existing)
```

---

## 🔍 Mapping Questions ↔️ Fichiers

```
Q1: "Latence p95 test léger?"
   ANSWERS.md                    ← Réponse directe
   TEST_RESULTS.md Étape 1       ← Comment la tester
   REPORT.md Q1                  ← Explications détaillées

Q2: "Taux http_req_failed?"
   ANSWERS.md                    ← Réponse directe
   TEST_RESULTS.md Étape 1       ← Contexte
   REPORT.md Q2                  ← Explications détaillées

Q3: "À partir de quel VU le check échoue? p95 finale?"
   ANSWERS.md                    ← Réponse directe
   TEST_RESULTS.md Étape 2       ← Phases observées
   REPORT.md Q3                  ← Breakdown détaillé
   scripts/run-tests.sh          ← Comment reproduire

Q4: "Pourquoi Gateway 4×, Task 2×?"
   ANSWERS.md                    ← Réponse + tableau
   REPORT.md Q4                  ← Explication détail
   scripts/load-test-realistic.js ← Voir les requêtes
   TEST_RESULTS.md Étape 2       ← Graphique Grafana

Q5: "Pourquoi task-service plus impacté?"
   ANSWERS.md                    ← Réponse structurée
   REPORT.md Q5                  ← Analyse complète
   TEST_RESULTS.md Étape 2       ← Observations Grafana

Q6: "Erreur docker scale et cause?"
   ANSWERS.md                    ← Réponse + ligne exact
   REPORT.md Q6                  ← Diagnostic approfon
   docker-compose.yml.fixed      ← Solution
   scripts/demo-scaling.sh       ← Démonstration
   scripts/run-tests.sh          ← Exécution

Q7: "Après correction, trafic distribué? Prometheus découvre?"
   ANSWERS.md                    ← Réponse nette
   REPORT.md Q7                  ← Explication complète
   docker-compose.yml.fixed      ← Comment appliquer
   TEST_RESULTS.md Étape 3       ← Observations

Q8: "Limitations docker scale vs K8s?"
   ANSWERS.md                    ← Comparaison tableau
   REPORT.md Q8                  ← Avantages détaillés
   scripts/demo-scaling.sh       ← Explications + K8s YAML
   ← Livrabilité complète

Q9: "Error Rate 5xx pour détecter dégradation?"
   ANSWERS.md                    ← Réponse: NON, utiliser latency
   REPORT.md Q9                  ← Validation + alternatives
   TEST_RESULTS.md Section 4     ← Observations Grafana

Q10: "Écart K6 680ms vs Grafana 150ms?"
   ANSWERS.md                    ← Explication queue
   REPORT.md Q10                 ← Breakdown détaillé
   improved-instrumentation.js   ← Code pour mesurer
   grafana_panels_additions.json ← Panels à ajouter
   TEST_RESULTS.md Section 4     ← Vérification
```

---

## ✅ Checklist de Livraison

- [x] **Réponses aux 10 questions** — Concises et rigoureuses
- [x] **Analyse détaillée** — Avec explications techniques
- [x] **Code corrigé** — docker-compose.yml.fixed prêt à utiliser
- [x] **Instrumentation** — improved-instrumentation.js à intégrer
- [x] **Métriques** — grafana_panels_additions.json pour visualiser queue
- [x] **Démo** — scripts avec explications et exemples K8s
- [x] **Guide pratique** — TEST_RESULTS avec tous les resultats attendus
- [x] **Documentation** — SUMMARY.md, README_DELIVERABLES.md
- [x] **Reproductibilité** — run-tests.sh avec toutes les commandes

---

## 💡 Tips

1. **Répondre au TP rapidement**: Copier ANSWERS.md
2. **Approfondir**: Lire REPORT.md + TEST_RESULTS.md
3. **Implémenter**: Utiliser docker-compose.yml.fixed + improved-instrumentation.js
4. **Reproduire**: Suivre scripts/run-tests.sh
5. **Expliquer à quelqu'un**: SUMMARY.md en 5 minutes

---

**Dernier update:** Mai 2026  
**Status:** ✅ Prêt à livrer

