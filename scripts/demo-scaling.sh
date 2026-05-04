#!/bin/bash

# Script de démonstration pour les questions 6-7 du TP Partie 2
# Execute les manipulations de scaling et capture les erreurs/métriques

set -e

echo "=========================================="
echo "QUESTION 6: Tentative de scaling initial"
echo "=========================================="
echo ""
echo "Commande: docker compose up --scale task-service=3"
echo "Résultat attendu: ERREUR sur le port 3002"
echo ""

docker compose up --scale task-service=3 2>&1 | head -20 || {
  ERROR_MSG=$(docker compose up --scale task-service=3 2>&1 | grep -i "ports" | head -1)
  echo "❌ ERREUR ATTENDUE:"
  echo "$ERROR_MSG"
  echo ""
  echo "Cause: Port 3002 ne peut pas être utilisé par 3 conteneurs simultanément"
  echo ""
}

echo "=========================================="
echo "QUESTION 6 (suite): Identification de la ligne"
echo "=========================================="
echo ""
echo "Ligne responsable dans docker-compose.yml:"
grep -A 5 "task-service:" docker-compose.yml | grep -A 3 "ports:"
echo ""
echo "La directive 'ports' force Docker à mapper le port 3002 de l'hôte"
echo "Seul un conteneur peut occuper ce port → scaling impossible"
echo ""

echo "=========================================="
echo "QUESTION 6: Correction du docker-compose.yml"
echo "=========================================="
echo ""
echo "Modification à appliquer:"
echo "1. Enlever les sections 'ports:' des services (sauf api-gateway + frontend)"
echo "2. Ajouter un réseau personnalisé 'taskflow'"
echo "3. Faire pointer api-gateway vers les noms de service (via hostnames Docker)"
echo ""
echo "Exemple de changement:"
echo "  AVANT:"
echo "    task-service:"
echo "      ports:"
echo "        - \"3002:3002\""
echo ""
echo "  APRÈS:"
echo "    task-service:"
echo "      networks:"
echo "        - taskflow"
echo "      # Pas de ports:!"
echo ""

echo "=========================================="
echo "QUESTION 7: Avec la correction appliquée"
echo "=========================================="
echo ""
echo "Hypothèse: Si on applique la correction et on relance:"
echo "  docker compose up --scale task-service=3"
echo ""
echo "✅ Les 3 replicas démarreraient avec succès"
echo ""
echo "Distribution du trafic:"
echo "  - Docker utilise une VIP interne pour 'task-service'"
echo "  - Les 3 replicas reçoivent ~33% du trafic chacun (Round Robin)"
echo "  - Latence globale s'améliore (load distribué)"
echo ""

echo "Vérification dans Prometheus:"
echo "  http://localhost:9090/targets"
echo ""
echo "❌ LIMITATION: Prometheus ne verra qu'une seule cible:"
echo "    task-service:3002"
echo ""
echo "Raison: Prometheus utilise la configuration statique (prometheus.yml)"
echo "qui contient: - targets: ['task-service:3002']"
echo ""
echo "Cette cible se résout à UNE SEULE replica internement,"
echo "car Docker Compose n'a pas de service discovery dynamique."
echo ""
echo "Les 2 autres replicas:"
echo "  - Reçoivent du trafic via la VIP interne ✓"
echo "  - Mais ne sont pas exposées à Prometheus ✗"
echo "  - Leurs métriques ne sont jamais grattées"
echo ""

echo "=========================================="
echo "QUESTION 8: Limitations de docker scale et K8s"
echo "=========================================="
echo ""
echo "Problèmes rencontrés avec docker compose:"
echo ""
echo "1. Ports fixes (résolu par cette correction)"
echo "2. Pas de service discovery dynamique"
echo "   → Prometheus ne peut pas découvrir automatiquement les replicas"
echo "3. Pas de health checks du service lui-même"
echo "   → Si une replica crash, elle ne redémarre pas automatiquement"
echo "4. Pas d'auto-scaling basé sur las vraies metriques"
echo "5. Load balancing rudimentaire (juste VIP DNS)"
echo "6. Pas de rolling updates sans downtime"
echo ""
echo "Kubernetes résout tous ces problèmes:"
echo ""
echo "  ✓ Service discovery natif"
echo "    - Kubernetes service résout 'task-service' aux 3 Pods"
echo "    - Prometheus découvre via l'API Kubernetes"
echo ""
echo "  ✓ Self-healing"
echo "    - Pod crash → Kubernetes en redémarre une nouvelle"
echo "    - Trafic rerouter automatiquement"
echo ""
echo "  ✓ Auto-scaling"
echo "    - HPA (Horizontal Pod Autoscaler)"
echo "    - Scale basé sur CPU, mémoire, métriques custom"
echo ""
echo "  ✓ Rolling updates"
echo "    - Déployer une nouvelle version sans downtime"
echo "    - Rollback automatique si ça échoue"
echo ""
echo "Exemple Kubernetes:"
echo ""
cat <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: task-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: task
  template:
    metadata:
      labels:
        app: task
    spec:
      containers:
      - name: task-service
        image: taskflow/task-service:latest
        ports:
        - containerPort: 3002
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: task-service
spec:
  selector:
    app: task
  ports:
  - port: 3002
    protocol: TCP
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: task-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: task-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 80
EOF

echo ""
echo "Avec cette simple config, Kubernetes:"
echo "  - Crée 3 Pods"
echo "  - Les connecte via un Service (load balancing intégré)"
echo "  - Va auto-scaler à 10 Pods si CPU > 80%"
echo "  - Redémarre les Pods qui crashent"
echo "  - Découvre les Pods automatiquement"
echo ""
