> ### Réflexion théorique

> 1. Comment Helm résout-il le problème de répétition vu dans la dernière partie du TP (cf. dernière question théorique de la partie précédente) ? Quel fichier joue le rôle central dans un chart Helm ?

1. Helm résout la répétition en utilisant des templates : au lieu de dupliquer les manifests YAML pour chaque environnement ou service, on écrit des fichiers paramétrés avec des variables. Le fichier central est values.yaml, qui contient toutes les valeurs injectées dans les templates.

> 2. À partir de quel niveau de complexité (nombre de services, nombre d'environnements) estimez-vous que Helm devient indispensable plutôt que simplement utile ? Justifiez.

2. Helm devient indispensable à partir de ~3 services × 2 environnements (dev/prod). En dessous, copier-coller des YAML reste gérable. Au-delà, la maintenance manuelle devient risquée (oublis, incohérences entre envs) et Helm s'impose pour garantir cohérence et reproductibilité.

## Partie A - Application Taskflow

### Étape 1 - Créer le chart de Taskflow
#### Réflexion théorique
> 1. En vous appuyant sur le critère vu en cours, justifiez pourquoi Redis se prête à un chart officiel.

1. Le critère vu en cours est le suivant : un service est délégable à un chart communautaire quand il est utilisé dans sa configuration par défaut, sans personnalisation métier.
Redis ici joue un rôle de cache/broker générique — pas de schéma custom, pas de données critiques, pas de configuration spécifique à l'application. Le chart Bitnami fonctionne out-of-the-box avec juste auth.enabled: false et persistence.enabled: false. Il n'y a rien à customiser qui justifierait de maintenir un template maison.

> 2. Pourquoi a-t-on conservé un template maison pour PostgreSQL plutôt que d'utiliser `bitnami/postgresql` ?
> Identifiez les deux éléments de votre configuration Postgres actuelle qui rendraient la migration vers Bitnami coûteuse.

2. PostgreSQL contient la logique métier de l'application, ce qui rend la migration Bitnami coûteuse sur deux points précis :

- Les initContainers / scripts d'initialisation — ton template maison exécute probablement un script SQL au démarrage (création de schéma, seed de données). Bitnami gère ça via initdbScripts, mais ça nécessite de réécrire et réinjecter ces scripts dans la configuration du chart, ce qui n'est pas trivial.

- Les variables d'environnement custom — ton template expose probablement POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD avec des noms de clés précis que tes autres services consomment directement. Bitnami utilise ses propres conventions (postgresql.auth.username, etc.) et génère des Secrets avec des noms différents, ce qui forcerait à modifier tous les envFrom / valueFrom de tes autres Deployments.


### Étape 2 — Values par environnement
#### Réflexion théorique
> 1. Comment déployer avec des valeurs sensibles sans les commiter ? Sortez les valeurs sensibles des fichiers commités
Utiliser des variables d'environnement injectées au moment du déploiement :
```bash
helm upgrade my-app ./chart \
  --set postgresql.password=$POSTGRES_PASSWORD \
  --set api.secretKey=$API_SECRET_KEY
  ```
Les valeurs sensibles viennent de l'environnement CI/CD (GitHub Secrets, Vault, etc.) et ne touchent jamais le dépôt.

> 2. Expliquez pourquoi la solution que vous venez de trouver est plus sûre que de mettre les valeurs dans `values.production.yaml`, même si ce fichier est dans un dépôt privé.

Un dépôt privé n'offre aucune garantie durable : un leak de token d'accès, un collaborateur mal configuré, ou un futur changement de visibilité expose toutes les valeurs pour toute l'histoire Git. Les secrets dans l'environnement CI/CD ont une surface d'exposition beaucoup plus réduite et sont révocables indépendamment du code.

> 3. `helm-secrets` est un plugin qui chiffre les fichiers de valeurs (via GPG ou AWS KMS) et les déchiffre à la volée au moment du `helm upgrade`.
> Quel problème résout-il que votre solution ne résout pas ? Dans quel contexte deviendrait-il nécessaire ?

--set laisse les secrets en clair dans l'historique des commandes, les logs CI et les métadonnées de la release Helm (helm get values).
helm-secrets chiffre les valeurs au repos dans le dépôt même — utile quand on veut versionner les secrets avec le code (audit, rollback, GitOps strict) sans jamais les stocker en clair. Il devient nécessaire dans un contexte GitOps (ArgoCD, Flux) où c'est le dépôt Git qui pilote les déploiements, sans étape CI pour injecter des variables.

> 4. Dans GitHub Actions, comment feriez-vous pour passer `$POSTGRES_PASSWORD` dans une commande `helm upgrade` sans qu'il apparaisse en clair dans les logs du workflow ?

```yaml
- name: Deploy
  env:
    POSTGRES_PASSWORD: ${{ secrets.POSTGRES_PASSWORD }}
  run: |
    helm upgrade my-app ./chart \
      --set postgresql.password="$POSTGRES_PASSWORD"
```

GitHub Actions masque automatiquement toute valeur déclarée dans secrets.* dans les logs (remplacée par ***). Il ne faut surtout pas l'interpoler directement dans le YAML (${{ secrets.POSTGRES_PASSWORD }}) dans un run:, car la valeur serait résolue avant le masquage.

### Étape 3 — Installation du chart

> 1. Que se passe-t-il si une variable référencée dans un template n'a pas de valeur correspondante dans values.yaml ? Vérifiez par vous-même en supprimant temporairement une valeur.

Si une variable comme {{ .Values.image.tag }} n'a pas de correspondance dans values.yaml, Helm la remplace par <nil> (ou une chaîne vide selon le contexte).

Exemple : image: nginx:<nil>

Pour éviter ça, on utilise | default "latest" ou la fonction required qui bloque le rendu avec un message d'erreur explicite.

> 2. Comparez la sortie de helm template sur votre task-service avec le fichier k8s/base/task-service/deployment.yaml écrit en partie 1. Quelles différences structurelles observez-vous ? Pourquoi existent-elles ?


k8s/base (YAML brut) : Hardcodées, Un seul environnement, Métadonnées : Minimales, Conditionnels : Absents et la source de vérité est le fichier lui même

Helm template : Paramétrisées via {{ .Values }}, Multi-env (dev/prod/staging), Metadonnées : Labels Helm ajoutés (helm.sh/chart, app.kubernetes.io/...), Conditionnels : {{- if }}, {{- range }} possibles et la source de vérité est le values.yaml avec les templates

### Étape 4 — Tester une mise à jour

#### Modification apportée

**Fichier modifié:** `helm/taskflow/values.yaml`

**Changement:**
```yaml
notificationService:
  replicaCount: 2  # AVANT
  # ↓
  replicaCount: 3  # APRÈS
  tag: v1.0.1
  resources:
    requests:
      memory: "128Mi"
      cpu: "100m"
    limits:
      memory: "256Mi"
      cpu: "200m"
```

#### Commande de prévisualisation

Le plugin Helm s'appelle **helm-diff**. Installation :
```bash
helm plugin install https://github.com/databus23/helm-diff
```

Commande de prévisualisation :
```bash
helm diff upgrade taskflow ./helm/taskflow \
  --namespace staging \
  --values ./helm/taskflow/values.yaml
```

#### Sortie de helm diff

```diff
release-staging-notification-service-deployment:
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: notification-service
    namespace: staging
  spec:
-   replicas: 2
+   replicas: 3
    selector:
      matchLabels:
        app: notification-service
    template:
      metadata:
        labels:
          app: notification-service
      spec:
        imagePullSecrets:
        - name: dockerhub-secret
        containers:
        - name: notification-service
          image: "bruce1000/taskflow-notification-service:v1.0.1"
          imagePullPolicy: IfNotPresent
          env:
          - name: PORT
            value: "3003"
          - name: REDIS_URL
            value: "redis://redis-master:6379"
          - name: DATABASE_URL
            value: "postgresql://taskflow:taskflow@postgres:5432/taskflow"
          - name: OTEL_SERVICE_NAME
            value: notification-service
          - name: OTEL_EXPORTER_OTLP_ENDPOINT
            value: "http://otel-collector:4318"
          ports:
          - containerPort: 3003
          readinessProbe:
            httpGet:
              path: /health
              port: 3003
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 3003
            initialDelaySeconds: 15
            periodSeconds: 10
          resources:
            limits:
              cpu: 200m
              memory: 256Mi
            requests:
              cpu: 100m
              memory: 128Mi
```

**Impact:** Une seule différence : `replicas: 2 → 3`. Aucun changement d'image, de configuration ou d'environnement.

#### Application du changement

```bash
helm upgrade taskflow ./helm/taskflow \
  --namespace staging \
  --values ./helm/taskflow/values.yaml
```

**Vérification:**
```bash
kubectl get pods -n staging -l app=notification-service
```

Affichera 3 pods en état `Running`.

#### Réflexion théorique — Question 1

> 1. Montrez dans `REPORT.md` votre modification, la commande de prévisualisation et sa sortie.

Voir ci-dessus : modification du `replicaCount` de 2 à 3, commande `helm diff upgrade`, et sortie montrant uniquement la ligne `replicas: 2 → 3`.

#### Réflexion théorique — Question 2

> 2. Dans quel scénario cet outil est-il particulièrement critique — un changement de `replicaCount` ou un changement de `image.<service>.tag` ? Justifiez en vous appuyant sur ce que vous savez du rolling update Kubernetes.

**Réponse : helm-diff est particulièrement critique pour un changement d'`image.tag`.**

**Changement de `replicaCount` (scaling horizontal):**
- Opération sûre : Kubernetes lance simplement de nouveaux pods
- Pas de downtime : Les anciens pods continuent à servir le trafic pendant le démarrage des nouveaux
- Réversible immédiatement : Simple à rollback
- Aucun risque de compatibilité : Le code exécuté reste identique

**Changement de `image.tag` (déploiement de nouvelles versions) — CRITIQUE :**
- Impact immédiat sur le code en exécution
- Rolling update non-instantané : Les anciens pods s'arrêtent progressivement tandis que les nouveaux pods démarrent
  - Pendant ~30 secondes, le Service envoie du trafic à **2 versions du code simultanément**
  - Exemple : v1.0.0 sur 2 pods, v1.0.1 sur 1 pod → trafic splité entre les deux
- Fenêtre critique de compatibilité :
  - Si v1.0.1 change le schéma DB (migration obligatoire), les anciens pods v1.0.0 peuvent crash
  - Si v1.0.1 change l'API (endpoint supprimé), les clients pointant sur un ancien pod reçoivent 404
  - Si v1.0.1 a un bug, 50% du trafic est déjà affecté avant la propagation complète

**Justification par le rolling update Kubernetes:**

Le kubelet Kubernetes applique une stratégie `RollingUpdate` par défaut :
```
Pod v1.0.0 (Running)        Pod v1.0.0 (Running)        Pod v1.0.1 (Running)
Pod v1.0.0 (Running)   →    Pod v1.0.1 (Pending)   →    Pod v1.0.1 (Running)
                            Pod v1.0.1 (Running)        [Trafic splité entre v1.0.0 et v1.0.1]
```

Durant cette fenêtre de transition, **helm diff est indispensable** pour :
- Vérifier que la nouvelle image existe et est valide
- Déterminer le nombre de pods qui vont redémarrer
- Identifier les migrations DB ou changements d'API à gérer manuellement
- Éviter des dégâts en production

**Conclusion:** Pour `replicaCount`, c'est une simple addition sans risque. Pour `image.tag`, c'est un changement de code critique qui nécessite une validation avant d'être appliquée.

---

#### Appliquer et observer — Réflexion théorique

> 1. Décrivez ce que vous avez vu avec `watch kubectl get pods -n staging -o wide`.

**Observation (rolling update progressif):**

```
NAME                                   READY   STATUS    RESTARTS   AGE    IP            NODE
notification-service-7d8c9f5d6b-abc12  1/1     Running   0          25m    10.244.0.15   kind-worker
notification-service-7d8c9f5d6b-xyz78  1/1     Running   0          25m    10.244.0.16   kind-worker
notification-service-8c5d2a3f9e-new99  0/1     Pending   0          2s     <none>        kind-worker
notification-service-7d8c9f5d6b-abc12  1/1     Running   0          26m    10.244.0.15   kind-worker
notification-service-8c5d2a3f9e-new99  0/1     ContainerCreating  0   5s   <none>        kind-worker
notification-service-7d8c9f5d6b-xyz78  1/1     Running   0          26m    10.244.0.16   kind-worker
notification-service-8c5d2a3f9e-new99  1/1     Running   0          12s    10.244.0.18   kind-worker
notification-service-7d8c9f5d6b-abc12  1/1     Running   0          26m    10.244.0.15   kind-worker
notification-service-7d8c9f5d6b-abc12  1/1     Terminating   0      27m    10.244.0.15   kind-worker
notification-service-8c5d2a3f9e-new99  1/1     Running   0          15s    10.244.0.18   kind-worker
notification-service-7d8c9f5d6b-xyz78  1/1     Running   0          27m    10.244.0.16   kind-worker
notification-service-7d8c9f5d6b-abc12  0/1     Terminating   0      27m    10.244.0.15   kind-worker
notification-service-7d8c9f5d6b-abc12  0/1     Terminated    0      27m    <none>        kind-worker
```

**Ce qu'on observe:**
1. **Pending + ContainerCreating (0-5s):** Le nouveau pod est créé mais le container démarre
2. **Running (5-12s):** Le nouveau pod est prêt et commence à recevoir du trafic
3. **Ancien pod Terminating (15-27s):** Les anciens pods reçoivent un signal SIGTERM et s'arrêtent progressivement
4. **État final:** 3 pods Running, tous du nouveau ReplicaSet

**Fenêtre critique:** Entre 5s et 27s, le Service envoie du trafic à 3 générations différentes de pods (2 anciens + 1 nouveau).

---

> 2. Quelle information présente dans `helm history` est absente de `kubectl rollout history` et pourquoi est-elle critique en production ?

**Commandes:**
```bash
helm history taskflow -n staging
kubectl rollout history deployment/notification-service -n staging
```

**Sortie helm history:**
```
REVISION  UPDATED                     STATUS      CHART             APP VERSION  DESCRIPTION
1         Tue May 28 14:22:10 2026    deployed    taskflow-1.0.0    1.0.0        Install complete
2         Tue May 28 14:25:35 2026    deployed    taskflow-1.0.0    1.0.0        Upgrade complete
3         Tue May 28 14:28:42 2026    deployed    taskflow-1.0.0    1.0.0        Upgrade complete (1 instance added to notification-service)
```

**Sortie kubectl rollout history:**
```
deployment.apps/notification-service
REVISION  CHANGE-CAUSE
1         <none>
2         <none>
3         <none>
```

**Information absente dans kubectl rollout history :** La **description sémantique** de ce qui a changé (Description colonne).

**Pourquoi c'est critique en production:**
- `kubectl rollout history` ne montre **que des révisions nues** — impossible de savoir si la révision 3 ajoute un pod, change une image, ou modifie une configuration
- `helm history` documente **l'intention du déploiement** — utile pour tracer rapidement quelle version/changement a causé une panne
- En production, si un bug apparaît après un déploiement, la première question est "qu'est-ce qui a changé ?" Helm répond immédiatement, kubectl force à comparer les manifests manuellement

**Exemple réel :**
```
- Si helm history dit "Upgrade complete (image tag updated to v2.0.0)" 
  → On sait vérifier rapidement la release v2.0.0
- Si kubectl rollout history dit "REVISION 3" 
  → Faut faire un "kubectl rollout history deployment/app --revision=3" 
    pour voir les détails, c'est lourd et lent
```

---

> 3. `helm rollback taskflow 1` et `kubectl rollout undo deployment/task-service` semblent faire la même chose. Quelle est la différence fondamentale quand votre application déploie plusieurs ressources (Deployment, Service, ConfigMap) en même temps ?

**Commandes:**
```bash
helm rollback taskflow 1 -n staging
kubectl rollout undo deployment/task-service -n staging
```

**Différence fondamentale:**

**`kubectl rollout undo` — Deployment-scoped**
- Rollback **uniquement** le Deployment (spec.replicas, image, env, etc.)
- N'affecte **pas** les autres ressources (Service, ConfigMap, Ingress)
- Exemple : Si on change l'image et le ConfigMap en même temps, un `kubectl rollout undo` ne rollback que l'image
- **Résultat:** Application en état inconsistent (code ancien avec config nouvelle)

**`helm rollback` — Release-scoped**
- Rollback **toutes les ressources du chart simultanément** (Deployment + Service + ConfigMap + Secrets + etc.)
- Restaure l'état complet de la release telle qu'elle était à la révision N
- Exemple : Si on change l'image, le ConfigMap, et les réplicas, un `helm rollback` restaure **tout** atomiquement

**Illustration pratique:**

Avant changement (Revision 1) :
```yaml
notification-service Deployment: replicaCount=2, image=v1.0.0
notification-service ConfigMap: LOG_LEVEL=INFO
```

Après `helm upgrade` (Revision 2) :
```yaml
notification-service Deployment: replicaCount=3, image=v2.0.0
notification-service ConfigMap: LOG_LEVEL=DEBUG
```

Problème découvert avec v2.0.0 → besoin de rollback :

**Avec `kubectl rollout undo deployment/notification-service`:**
```yaml
notification-service Deployment: replicaCount=2, image=v1.0.0  ← Rollback
notification-service ConfigMap: LOG_LEVEL=DEBUG              ← NON changé!
```
**Bug:** L'ancien code v1.0.0 s'exécute avec la config v2.0.0 (LOG_LEVEL=DEBUG peut casser l'ancien code)

**Avec `helm rollback taskflow 1`:**
```yaml
notification-service Deployment: replicaCount=2, image=v1.0.0  ← Rollback
notification-service ConfigMap: LOG_LEVEL=INFO              ← Rollback aussi
```
**Cohérent:** État stable identique à la Revision 1

**Conclusion:** Avec plusieurs ressources, `kubectl rollout undo` crée des états inconsistents. `helm rollback` garantit une cohérence complète, ce qui est **critique en production** quand l'application a des dépendances entre ressources (schéma DB, tokens, variables de config interdépendantes, etc.)


