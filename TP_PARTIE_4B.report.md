# TP Partie 4B - Helm monitoring

## Resume d'implementation

La partie 4B ajoute un chart Helm local `helm/monitoring` qui embarque `kube-prometheus-stack` comme dependance officielle. Ce chart gere maintenant :

- Grafana, Prometheus, Alertmanager et kube-state-metrics via `kube-prometheus-stack`.
- Un dashboard TaskFlow versionne dans `helm/monitoring/dashboards/taskflow-services.json`.
- Quatre `ServiceMonitor` generes par un seul template Helm pour `api-gateway`, `user-service`, `task-service` et `notification-service`.
- Une regle Prometheus `HighP95Latency` sur le P95 du `task-service`.
- Un Secret Alertmanager genere par Helm, avec credentials SMTP a fournir dans un fichier non committe.
- Un HPA conditionnel sur `task-service`, actif en production et desactive en staging.

Les secrets reels doivent rester dans `helm/monitoring/values.monitoring.secret.yaml`, ignore par Git.

## 1. Dependances et composition Helm

`kube-prometheus-stack` est un chart compose. Il installe plusieurs composants par dependances : Prometheus Operator, Prometheus, Alertmanager, Grafana, kube-state-metrics, node-exporter, etc.

Helm ne garantit pas automatiquement un rollback de toute la release si Grafana echoue pendant une installation ou un upgrade. Il faut explicitement demander a Helm d'attendre les ressources et de revenir a la derniere release valide en cas d'echec.

Avec Helm 4.2.0, l'aide `helm upgrade --help` indique l'option :

```powershell
--rollback-on-failure
```

Elle active aussi `--wait` par defaut. Commande recommandee :

```powershell
helm upgrade --install monitoring ./helm/monitoring `
  --namespace monitoring `
  --create-namespace `
  -f helm/monitoring/values.monitoring.yaml `
  -f helm/monitoring/values.monitoring.secret.yaml `
  --rollback-on-failure `
  --wait `
  --wait-for-jobs `
  --timeout 10m
```

Avec Helm 3, on verrait souvent `--atomic`; avec Helm 4.2.0, la commande disponible dans cet environnement est `--rollback-on-failure`.

## 2. Installation de la stack officielle

Fichiers ajoutes ou modifies :

- `helm/monitoring/Chart.yaml`
- `helm/monitoring/Chart.lock`
- `helm/monitoring/charts/kube-prometheus-stack-*.tgz`
- `helm/monitoring/values.yaml`
- `helm/monitoring/values.monitoring.yaml`
- `helm/monitoring/values.monitoring.secret.example.yaml`

Commande de preparation executee :

```powershell
helm dependency update ./helm/monitoring
```

Resultat observe : dependance `kube-prometheus-stack` telechargee depuis `https://prometheus-community.github.io/helm-charts`.

Par rapport a la partie 1, on ecrit beaucoup moins de manifests Kubernetes manuels. La stack complete est principalement pilotee par `Chart.yaml` et les fichiers de values.

## 3. Port-forward Grafana vs Ingress TaskFlow

TaskFlow est accessible sur `http://localhost` grace au couple :

- `k8s/kind-config.yaml`, qui expose les ports 80/443 du control-plane kind vers la machine locale.
- `k8s/base/ingress.yaml`, qui declare les routes HTTP vers le frontend et l'API.

Grafana est dans le namespace `monitoring` et le chart officiel ne cree pas d'Ingress local adapte a `http://localhost/grafana`. Il faut donc utiliser :

```powershell
kubectl port-forward -n monitoring svc/monitoring-grafana 3100:80
```

Pour rendre Grafana disponible via `http://localhost/grafana`, il faudrait ajouter un Ingress dedie dans le namespace `monitoring`, avec une route `/grafana` vers le service `monitoring-grafana`, puis configurer `grafana.ini.server.root_url` et `serve_from_sub_path`.

## 4. Values sensibles et surcharge

Les valeurs non sensibles sont dans :

```text
helm/monitoring/values.monitoring.yaml
```

Les valeurs sensibles doivent etre dans :

```text
helm/monitoring/values.monitoring.secret.yaml
```

Ce fichier ne doit pas etre committe. Le fichier d'exemple versionne est :

```text
helm/monitoring/values.monitoring.secret.example.yaml
```

Passer deux fichiers de values a Helm :

```powershell
helm upgrade --install monitoring ./helm/monitoring `
  --namespace monitoring `
  --create-namespace `
  -f helm/monitoring/values.monitoring.yaml `
  -f helm/monitoring/values.monitoring.secret.yaml
```

Difference entre `--values` et `--set` :

- `--values` convient aux configurations structurees, relisibles, reproductibles et versionnables.
- `--set` convient aux petites surcharges ponctuelles, par exemple un mot de passe injecte depuis une variable CI.

Pour les secrets, un fichier local ignore par Git ou un gestionnaire de secrets CI/CD est preferable a un fichier versionne.

## 5. Dashboards Grafana

Comme `infra/grafana/dashboards/` ne contient pas de dashboard JSON reel, un dashboard minimal a ete cree :

```text
helm/monitoring/dashboards/taskflow-services.json
```

Il contient deux panneaux :

- `Request rate per service` avec `sum by (job) (rate(http_requests_total[5m]))`
- `Task service p95 latency` avec `histogram_quantile(...)` sur `http_request_duration_ms_bucket`

Le template :

```text
helm/monitoring/templates/dashboard-configmap.yaml
```

utilise :

```gotemplate
.Files.Glob "dashboards/*.json"
```

Cela evite de coller du JSON inline dans le template. C'est plus maintenable, plus lisible, et chaque nouveau dashboard JSON peut etre ajoute sans modifier le template Helm.

Verification executee :

```powershell
helm template monitoring ./helm/monitoring `
  --namespace monitoring `
  -f helm/monitoring/values.monitoring.yaml `
  -f helm/monitoring/values.monitoring.secret.example.yaml `
  --show-only templates/dashboard-configmap.yaml
```

Resultat observe : le ConfigMap `taskflow-dashboards` contient bien `taskflow-services.json`.

Capture a faire apres installation : Grafana > Dashboards > verifier que `TaskFlow Services` apparait.

## 6. ServiceMonitors TaskFlow

Les Services backend du chart TaskFlow ont ete prepares pour Prometheus :

- `helm/taskflow/templates/api-gateway.yaml`
- `helm/taskflow/templates/user-service.yaml`
- `helm/taskflow/templates/task-service.yaml`
- `helm/taskflow/templates/notification-service.yaml`

Chaque Service expose maintenant :

```yaml
metadata:
  labels:
    app: <service>
ports:
  - name: http
```

Le template unique :

```text
helm/monitoring/templates/service-monitors.yaml
```

genere quatre `ServiceMonitor` avec `range`, un par service backend. `jobLabel: app` donne des jobs Prometheus lisibles : `api-gateway`, `user-service`, `task-service`, `notification-service`.

Verification executee :

```powershell
helm template monitoring ./helm/monitoring `
  -f helm/monitoring/values.monitoring.yaml `
  -f helm/monitoring/values.monitoring.secret.example.yaml `
  --show-only templates/service-monitors.yaml
```

Resultat observe : les quatre `ServiceMonitor` sont rendus.

Verification runtime a faire :

```powershell
kubectl get servicemonitor -A
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
```

Puis ouvrir `http://localhost:9090/targets`.

## 7. Alerte Prometheus HighP95Latency

Template modifie :

```text
helm/monitoring/templates/alerts.yaml
```

Regle creee :

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(http_request_duration_ms_bucket{job="task-service"}[1m])
  )
) > 500
```

Parametres :

- `for: 30s`
- `severity: warning`
- service cible : `task-service`
- seuil : P95 > 500 ms

Verification executee :

```powershell
helm template monitoring ./helm/monitoring `
  -f helm/monitoring/values.monitoring.yaml `
  -f helm/monitoring/values.monitoring.secret.example.yaml `
  --show-only templates/alerts.yaml
```

Resultat observe : la ressource `PrometheusRule` contient bien `HighP95Latency`.

Verification runtime a faire :

```powershell
kubectl get prometheusrule -n monitoring
```

Puis ouvrir `http://localhost:9090/rules` et verifier que la regle est chargee en etat `OK`.

## 8. Alertmanager et email

Template modifie :

```text
helm/monitoring/templates/alertmanager-config.yaml
```

Le chart cree le Secret :

```text
taskflow-alertmanager-config
```

`values.monitoring.yaml` configure `kube-prometheus-stack.alertmanager.alertmanagerSpec.configSecret` pour pointer vers ce Secret.

Les credentials SMTP doivent etre fournis dans :

```text
helm/monitoring/values.monitoring.secret.yaml
```

Ne pas les mettre dans le rapport.

Timings importants :

- `for: 30s` : Prometheus attend 30 secondes de condition vraie avant de declencher.
- `group_wait: 5s` : Alertmanager attend 5 secondes avant le premier envoi.
- `group_interval: 5m` : delai minimum entre notifications d'un meme groupe si le groupe evolue.

Verification executee :

```powershell
helm template monitoring ./helm/monitoring `
  --namespace monitoring `
  -f helm/monitoring/values.monitoring.yaml `
  -f helm/monitoring/values.monitoring.secret.example.yaml `
  --show-only charts/kube-prometheus-stack/templates/alertmanager/alertmanager.yaml
```

Resultat observe : le champ `configSecret: taskflow-alertmanager-config` est bien present.

Verification runtime a faire :

```powershell
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-alertmanager 9093:9093
```

Puis ouvrir `http://localhost:9093`.

Pour diagnostiquer l'email :

```powershell
kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager -f
```

Chercher `Notify success` ou `Error on notify`.

## 9. HPA task-service

Fichiers modifies :

- `helm/taskflow/templates/task-service.yaml`
- `helm/taskflow/values.yaml`
- `helm/taskflow/values.staging.yaml`
- `helm/taskflow/values.production.yaml`

En staging :

```yaml
taskService:
  hpa:
    enabled: false
```

En production :

```yaml
taskService:
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPU: 70
```

Quand le HPA est actif, le template ne rend plus `spec.replicas` dans le Deployment `task-service`, car le HPA devient responsable du nombre de pods.

Verification executee :

```powershell
helm template taskflow ./helm/taskflow `
  --namespace staging `
  -f helm/taskflow/values.staging.yaml `
  --show-only templates/task-service.yaml
```

Resultat observe : en staging, `replicas: 2` est present et aucun HPA n'est genere.

Verification production executee :

```powershell
helm template taskflow ./helm/taskflow `
  -f helm/taskflow/values.production.yaml `
  --show-only templates/task-service.yaml
```

Resultat observe : le HPA `autoscaling/v2` est rendu avec `minReplicas: 2`, `maxReplicas: 10`, `averageUtilization: 70`, et le Deployment ne definit pas `replicas`.

Runtime a faire si test HPA demande :

```powershell
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

kubectl patch deployment metrics-server -n kube-system `
  --type='json' `
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

kubectl get hpa -n staging
```

Dans l'etat final demande par le TP, le HPA reste desactive en staging.

## 10. Scaling et choix des metriques

Le CPU n'est pas toujours la meilleure metrique pour un service HTTP. Exemple : si le service attend Postgres ou Redis, le CPU peut rester bas alors que la latence utilisateur augmente fortement.

Metriques complementaires pertinentes :

- Latence P95 HTTP, par exemple `http_request_duration_ms_bucket`.
- Taux d'erreur HTTP, par exemple `http_requests_total` filtre sur statuts 5xx.
- Eventuellement longueur de file ou backlog si l'application en expose une.

Pour piloter un HPA avec une metrique Prometheus custom, il manque un adaptateur comme `prometheus-adapter`. Le Metrics Server standard ne fournit que les metriques CPU/memoire de base.

Sur kind, ajouter des pods ne cree pas de nouvelles ressources physiques. Si les noeuds sont satures, les pods peuvent rester en `Pending` ou se disputer les ressources. En cloud, un `Cluster Autoscaler` ou Karpenter peut ajouter des noeuds, ce que kind ne fait pas.

## 11. Haute disponibilite et resilience

Elasticite : adapter automatiquement le nombre de replicas a la charge.

Haute disponibilite : continuer a servir malgre la perte d'un pod, d'un noeud ou d'une zone.

Le HPA contribue a l'elasticite. Il peut aider indirectement la disponibilite en augmentant le nombre de pods, mais il ne remplace pas une strategie HA.

Avec `replicaCount: 2` sur `api-gateway`, si un pod crashe, le Service peut continuer a router vers le pod restant pendant que le Deployment recree le pod supprime. Avec `replicaCount: 1`, la perte du pod peut provoquer une interruption temporaire.

Le composant Kubernetes responsable de maintenir le nombre de replicas souhaite est le controller de Deployment, via le ReplicaSet.

La HA en production necessite aussi :

- plusieurs replicas,
- readiness probes correctes,
- ressources suffisantes,
- anti-affinity ou repartition multi-noeuds,
- plusieurs noeuds,
- idealement plusieurs zones de disponibilite.

Test runtime demande :

```powershell
kubectl delete pod -n staging -l app=api-gateway --wait=false
kubectl get pods -n staging -w
```

Observation a documenter apres execution : impact eventuel sur k6/Grafana pendant la recreation.

## 12. Commandes de validation statique executees

```powershell
helm version
helm dependency update ./helm/monitoring
helm lint ./helm/monitoring
helm lint ./helm/taskflow
helm template monitoring ./helm/monitoring --namespace monitoring -f helm/monitoring/values.monitoring.yaml -f helm/monitoring/values.monitoring.secret.example.yaml
helm template monitoring ./helm/monitoring -f helm/monitoring/values.monitoring.yaml -f helm/monitoring/values.monitoring.secret.example.yaml --show-only templates/service-monitors.yaml
helm template monitoring ./helm/monitoring -f helm/monitoring/values.monitoring.yaml -f helm/monitoring/values.monitoring.secret.example.yaml --show-only templates/dashboard-configmap.yaml
helm template monitoring ./helm/monitoring -f helm/monitoring/values.monitoring.yaml -f helm/monitoring/values.monitoring.secret.example.yaml --show-only templates/alerts.yaml
helm template taskflow ./helm/taskflow --namespace staging -f helm/taskflow/values.staging.yaml --show-only templates/task-service.yaml
helm template taskflow ./helm/taskflow -f helm/taskflow/values.production.yaml --show-only templates/task-service.yaml
```

Resultats observes :

- `helm lint ./helm/monitoring` : 0 chart failed.
- `helm lint ./helm/taskflow` : 0 chart failed.
- Les quatre `ServiceMonitor` sont rendus.
- Le dashboard JSON est bien inclus dans le ConfigMap.
- La regle `HighP95Latency` est bien rendue.
- Le HPA est desactive en staging et active en production.

## 13. Commandes runtime restantes a executer

Ces commandes necessitent le cluster kind, les images locales et le fichier secret reel.

Installation TaskFlow :

```powershell
helm upgrade --install taskflow ./helm/taskflow `
  --namespace staging `
  -f helm/taskflow/values.staging.yaml `
  --wait `
  --timeout 10m
```

Installation monitoring :

```powershell
helm upgrade --install monitoring ./helm/monitoring `
  --namespace monitoring `
  --create-namespace `
  -f helm/monitoring/values.monitoring.yaml `
  -f helm/monitoring/values.monitoring.secret.yaml `
  --rollback-on-failure `
  --wait `
  --wait-for-jobs `
  --timeout 10m
```

Verifications :

```powershell
helm list -n monitoring
kubectl get pods -n monitoring
kubectl get servicemonitor -A
kubectl get prometheusrule -n monitoring
```

Prometheus :

```powershell
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
```

Ouvrir :

```text
http://localhost:9090/targets
http://localhost:9090/rules
```

Grafana :

```powershell
kubectl port-forward -n monitoring svc/monitoring-grafana 3100:80
```

Ouvrir :

```text
http://localhost:3100
```

Alertmanager :

```powershell
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-alertmanager 9093:9093
```

Ouvrir :

```text
http://localhost:9093
```

Charge :

```powershell
k6 run scripts/load-test-realistic.js
```

Captures a ajouter apres execution :

- Grafana dashboard `TaskFlow Services`.
- Prometheus `/targets` avec les quatre services TaskFlow.
- Prometheus `/rules` avec `HighP95Latency`.
- Alertmanager avec l'alerte si elle se declenche.
- Logs Alertmanager indiquant `Notify success` ou `Error on notify`.
- Resultats k6 avant/apres HPA si le test HPA est execute.
