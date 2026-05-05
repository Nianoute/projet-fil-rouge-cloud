Etape 0, installation changement de commande pour réussir l'installation de kind :
curl.exe -Lo kind.exe https://kind.sigs.k8s.io/dl/v0.31.0/kind-windows-amd64
Move-Item .\kind.exe C:\Windows\System32\kind.exe
(pour windows depuis un terminal powershell en admin)

Etape 1 :
Pas d'alerte, suivi du TP ok et génération des 3 noeuds ok

Etape 2 :
Changement de la commande pour permettre à windows de reconnaitre watch :
kubectl get pods -n staging -o wide --watch

Etape 3 :
NAME                            READY   STATUS             RESTARTS   AGE   IP           NODE               NOMINATED NODE   READINESS GATES
user-service-58dcf85f6c-47hdn   0/1     ImagePullBackOff   0          72s   10.244.2.2   taskflow-worker2   <none>           <none>
user-service-58dcf85f6c-bglgh   0/1     ImagePullBackOff   0          72s   10.244.1.2   taskflow-worker    <none>           <none>

Passage de ContainerCreated à ErreurPullImage à ImagePullBackOff à ErrImagePull

failed to resolve reference "docker.io/mewtw/taskflow-user-service:v1.0.0": pull access denied, repository does not exist

Le problème : kind ne peut pas pull l'image de Docker Hub. Il y a deux solutions :

Construire l'image localement et la charger dans kind
Utiliser imagePullPolicy: Never

docker build -t taskflow-user-service:v1.0.0 ./user-service

kind load docker-image taskflow-user-service:v1.0.0 --name taskflow

user-service-84b95b48-6sm7d    0/1     Running   0             62s     10.244.2.6   taskflow-worker    <none>           <none>
user-service-cc754b75c-lcr4z   0/1     Running   3 (82s ago)   2m16s   10.244.2.5   taskflow-worker    <none>           <none>
user-service-cc754b75c-llpj4   0/1     Running   3 (81s ago)   2m16s   10.244.1.5   taskflow-worker2   <none>           <none>

Push de l'image docker dans le docker hub


Etape 4 :
Ajout d'un name space
commande : 
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/postgres/

> Combien de pods sont en `Running` ? 3 mais suite à un relancement du projet je suis passé à 2. Un ancien pods s'est détaché du son nouvelle état suite à un changement de code et/ou commande
> Sur quels nœuds sont-ils schedulés ? taskflow-worker et taskflow-worker2

Modification du bail

NAME                                    READY   STATUS    RESTARTS        AGE     IP           NODE               NOMINATED NODE   READINESS GATES
notification-service-7d8f9588bb-6rwdz   1/1     Running   0               22m     10.244.2.8   taskflow-worker    <none>           <none>
task-service-789c6c56c5-blc24           1/1     Running   0               22m     10.244.1.8   taskflow-worker2   <none>           <none>
task-service-789c6c56c5-nrdcj           1/1     Running   0               22m     10.244.2.7   taskflow-worker    <none>           <none>
user-service-84b95b48-6sm7d             0/1     Running   0               3h54m   10.244.2.6   taskflow-worker    <none>           <none>
user-service-cc754b75c-lcr4z            0/1     Running   3 (3h54m ago)   3h55m   10.244.2.5   taskflow-worker    <none>           <none>
user-service-cc754b75c-llpj4            0/1     Running   3 (3h54m ago)   3h55m   10.244.1.5   taskflow-worker2   <none>           <none>


> 1. Quelle propriété du StatefulSet garantit que chaque Pod conserve toujours le même volume de stockage, même après un redémarrage ou un rescheduling sur un autre nœud ?
C'est cette propriété qui crée un PVC dédié et nommé de manière stable pour chaque Pod (postgres-data-postgres-0, postgres-data-postgres-1…). Contrairement à un volume classique, le PVC survit à la suppression du Pod et se relie au même Pod au redémarrage, quel que soit le nœud.
> 2. Pourquoi un Deployment serait-il inadapté pour PostgreSQL, même si techniquement on peut lui attacher un volume ?
Un Deployment génère des Pods avec des noms aléatoires et interchangeables. Si le Pod est recréé, il peut recevoir un nouveau PVC (ou aucun si mal configuré), perdant ainsi les données. De plus, avec plusieurs replicas, plusieurs Pods écriraient simultanément sur le même volume → corruption des données. PostgreSQL a besoin d'un identifiant réseau stable et d'un stockage garanti : exactement ce que le StatefulSet fournit.
> 3. Parmi les services restants de la stack TaskFlow (Redis, notification-service, `api-gateway`, frontend), lequel mériterait potentiellement un StatefulSet plutôt qu'un Deployment en production ? Justifiez votre choix.
Redis est le seul candidat sérieux au StatefulSet parmi ces services. En mode persistance (AOF/RDB) ou cluster Redis, chaque nœud doit conserver ses données et son identité réseau stable. Les autres (api-gateway, notification-service, frontend) sont stateless par nature : pas de stockage local, interchangeables, donc un Deployment suffit largement.

Etape 5 :
> 1. Comment ce service consomme-t-il les événements Redis ? 
Le service utilise le Pub/Sub Redis (subscriber.subscribe()). Chaque message publié est broadcasté à tous les abonnés connectés simultanément — pas de queue, pas de persistance, pas de consommation exclusive.
> 2. Qu'est-ce que cela implique sur le nombre de replicas à choisir ? Pour quel(s) service(s) ?
notification-service → 1 seul replica obligatoire, pour deux raisons cumulées :

Pub/Sub = broadcast : N replicas = N notifications créées pour un seul événement.
Stockage en mémoire : notifications[] est local à chaque processus, donc les données sont fragmentées entre instances et les lectures deviennent incohérentes.

task-service → scalable librement : il est producteur (PUBLISH), sans état lié au Pub/Sub.
> 3. Justifiez votre choix dans votre `REPORT.md`.
**notification-service : 1 replica**
Le Pub/Sub Redis broadcaste chaque message à tous les abonnés : N replicas
produiraient N notifications dupliquées. De plus, le stockage en mémoire
(`notifications[]`) est local à chaque instance, rendant les lectures
incohérentes avec un load balancer.

**task-service : scalable librement**
Simple producteur (`PUBLISH`), sans contrainte liée au Pub/Sub.


Etape 6 :
Pas d'alerte, ça avance

Etape 7 :
> Pour chaque service, posez-vous ces questions : 
>
> 1. Que sert-il ? De la logique métier ou des fichiers statiques ?
> 2. Y a-t-il un état partagé entre les requêtes qui pourrait poser problème avec plusieurs instances ?
> 3. Quel est l'impact d'une indisponibilité momentanée de l'un d'entre eux en environnement staging ?
> 4. Exécute-t-il du code à chaque requête, ou se contente-t-il de servir des fichiers précompilés ? Qu'est-ce que cela implique sur les ressources nécessaires (requests et limits) ?

**API-Gateway (Node.js + Express + http-proxy-middleware)**

1. **Rôle** : Logique métier
   - Point d'entrée unique pour tous les clients
   - Proxie les requêtes vers les services internes (user-service, task-service, notification-service)
   - Gère l'authentification JWT

2. **État partagé** : Aucun (service stateless)
   - Chaque requête est traitée indépendamment
   - Pas de session stockée localement
   - Les replicas sont complètement interchangeables

3. **Impact indisponibilité** : 🔴 CRITIQUE
   - Point d'entrée unique = goulot d'étranglement
   - Indisponibilité = application complètement inaccessible
   - En staging : forte impact sur les tests

4. **Exécution** : Code à chaque requête
   - Middleware Express, parsing JSON, routage dynamique
   - Consommation CPU variable selon le volume de requêtes
   - Implique des ressources moyennes

**Choix : 2 replicas minimum**
- Replicas : 2 (haute disponibilité) — avec 1 seul, une indisponibilité bloquerait 100% du trafic
- Resources : 
  - Requests : CPU 100m, Memory 128Mi
  - Limits : CPU 200m, Memory 256Mi

---

**Frontend (Nginx + fichiers statiques précompilés)**

1. **Rôle** : Fichiers statiques
   - Serveur nginx distribuant HTML/CSS/JS compilés
   - Configuration nginx proxie `/api` vers api-gateway

2. **État partagé** : Aucun (service stateless)
   - Fichiers compilés au build, immuables à l'exécution
   - Nginx sans session locale
   - Parfaitement interchangeable

3. **Impact indisponibilité** : 🟡 MOYEN
   - Les clients tombent sur une erreur de connexion
   - Mais le reste de la stack n'est pas affecté
   - Avec une réplica, 50% du trafic est perdu (stateless → LB simple)

4. **Exécution** : Fichiers précompilés
   - Nginx sert des fichiers statiques pré-construits
   - Très peu de CPU (pas d'interprétation de code)
   - Très peu de mémoire (caching système)

**Choix : 2 replicas**
- Replicas : 2 (staging) — chaque réplica peut absorber 100% du trafic
- Resources : 
  - Requests : CPU 50m, Memory 64Mi
  - Limits : CPU 100m, Memory 128Mi

---

**Justification du nombre de replicas et ressources :**

| Service | Replicas | CPU Requests | Memory Requests | Justification |
|---------|----------|--------------|-----------------|---------------|
| api-gateway | 2 | 100m | 128Mi | Point d'entrée → HA critique. Code à chaque requête → CPU modéré. |
| frontend | 2 | 50m | 64Mi | Fichiers statiques → très léger. Staging → 2 pour la HA. |

**En production**, on augmenterait :
- api-gateway : 3-5 replicas (charge métier)
- frontend : 2-3 replicas (peu de charge, audience importante possible)

Etape 8 :
kubectl get all -n staging
NAME                                        READY   STATUS    RESTARTS   AGE
pod/api-gateway-7cc9f7865c-gswpp            1/1     Running   0          21m
pod/api-gateway-7cc9f7865c-nhvvq            1/1     Running   0          21m
pod/frontend-7859d6cdb6-bbdk7               1/1     Running   0          21m
pod/frontend-7859d6cdb6-d4wst               1/1     Running   0          21m
pod/notification-service-7d8f9588bb-6rwdz   1/1     Running   0          83m
pod/task-service-789c6c56c5-blc24           1/1     Running   0          83m
pod/task-service-789c6c56c5-nrdcj           1/1     Running   0          83m
pod/user-service-84b95b48-kz79j             0/1     Running   0          19m
pod/user-service-cc754b75c-5p9qw            0/1     Running   0          19m
pod/user-service-cc754b75c-8qj2r            0/1     Running   0          19m

NAME                           TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
service/api-gateway            ClusterIP   10.96.164.102   <none>        3000/TCP   21m
service/frontend               ClusterIP   10.96.253.240   <none>        80/TCP     21m
service/notification-service   ClusterIP   10.96.183.158   <none>        80/TCP     83m
service/task-service           ClusterIP   10.96.33.159    <none>        80/TCP     83m
service/user-service           ClusterIP   10.96.145.84    <none>        80/TCP     5h

NAME                                   READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/api-gateway            2/2     2            2           21m
deployment.apps/frontend               2/2     2            2           21m
deployment.apps/notification-service   1/1     1            1           83m
deployment.apps/task-service           2/2     2            2           83m
deployment.apps/user-service           0/2     1            0           4h56m

NAME                                              DESIRED   CURRENT   READY   AGE
replicaset.apps/api-gateway-7cc9f7865c            2         2         2       21m
replicaset.apps/frontend-7859d6cdb6               2         2         2       21m
replicaset.apps/notification-service-7d8f9588bb   1         1         1       83m
replicaset.apps/task-service-789c6c56c5           2         2         2       83m
replicaset.apps/user-service-84b95b48             1         1         0       4h55m
replicaset.apps/user-service-cc754b75c            2         2         0       4h56m

Oublie du /health pour le user.service 0


---

## Partie 2 — Exposer avec un Ingress

### Configuration et déploiement

L'Ingress controller NGINX a été installé et schedulé correctement sur le `control-plane` avec le label `ingress-ready=true`.

Configuration du fichier `k8s/base/ingress.yaml` :

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: taskflow-ingress
  namespace: staging
spec:
  ingressClassName: nginx
  rules:
    - host: localhost
      http:
        paths:
          - path: /api       → api-gateway:3000
          - path: /         → frontend:80
```

### Tests de connectivité

`curl http://localhost/api/health` → Réponse du api-gateway (erreur JWT attendue)
`curl http://localhost/` → Frontend TaskFlow HTML reçu avec succès
**Accès navigateur** : http://localhost → Interface TaskFlow chargée

### Service vs Ingress — Réponses aux questions

> **Question 1** : Vous avez utilisé une commande pour vous connecter à PostgreSQL depuis votre machine. Pourquoi n'avez-vous pas pu vous connecter directement sur `localhost:5432` sans celle-ci ?

PostgreSQL s'exécute **à l'intérieur du cluster Kubernetes**, sur le Service `postgres-service` (ClusterIP) qui n'est accessible que de l'intérieur du cluster. Les ports n'y sont pas exposés vers la machine hôte.
`ClusterIP` = IP virtuelle interne au cluster, non routable depuis l'extérieur
Pour accéder à PostgreSQL : `kubectl port-forward svc/postgres-service 5432:5432`
L'Ingress, au contraire, écoute sur le port 80 exposé du nœud control-plane et fait le routage HTTP.

---

> **Question 2** : Quel composant du cluster fait réellement le routage HTTP que vous avez décrit dans votre `Ingress` ? Comment est-il apparu dans le cluster ?

C'est le **Ingress Controller NGINX** qui effectue le routage HTTP.
**Comment il est apparu** : Installation via manifest : `kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml`
**Fonctionnement** : Le controller écoute les ressources Ingress et génère automatiquement une configuration nginx qui proxie les requêtes HTTP selon les règles définies
**Scheduling** : Forcé sur le `control-plane` avec le label `ingress-ready=true` pour exposer les ports 80/443 vers la machine hôte

---

> **Question 3** : Dans votre cluster, qui joue le rôle de load balancer entre les replicas de `task-service` ? Est-ce l'Ingress, le Service, ou autre chose ? Qu'est-ce que cela implique sur le rôle réel de l'Ingress dans cette architecture ?

C'est le **Service Kubernetes** (ClusterIP) qui joue le rôle de load balancer entre les replicas.

**Architecture du load balancing** :
```
Client HTTP (localhost/api)

Ingress Controller NGINX (port 80) -> (proxie vers http://api-gateway:3000)
Service ClusterIP (api-gateway) -> (load balance avec kube-proxy)
Pod 1 (10.244.1.10:3000)
Pod 2 (10.244.2.9:3000)
```

**Rôle réel de l'Ingress** :
- L'Ingress est une ressource **de configuration HTTP couche 7** — elle décrit les règles de routage
- Le **Ingress Controller** exécute ces règles (nginx dans notre cas)
- Le **Service** effectue le **load balancing couche 4** (TCP) entre les Pods
- Donc : **Ingress = routage HTTP** / **Service = load balancing TCP**

**Implication** : Si on veut scaler verticalement le task-service, il suffit d'augmenter les replicas dans le Deployment — le Service distribue automatiquement sans reconfigurer l'Ingress.

---
## Partie 3 — Scénarios d'observation (live)

### Scénario 1 — Self-healing

```bash
kubectl delete pod -n staging -l app=task-service
```

Observez le Terminal A. 

> Décrivez dans votre `REPORT.md` ce que vous voyez et pourquoi Kubernetes recrée les Pods.
Container creating -> terminating -> runnning. grâce aux healt et aux restart, les pods se relance automatiquement lors de la mort d'un sevice. Il détecte donc qu'il n'y a plus rien, il créer un container pour remplacer, il termine la création puis commence le running. Ensuite schéma classique pour passer le pod à 1/1

### Scénario 2 — Readiness probe

Recréez le cluster from scratch avec la readiness probe du `task-service` délibérément cassée. Modifiez le path dans `k8s/base/task-service/deployment.yaml` avant d'appliquer :

## Journal de bord — 05/05

### Mise en place du cluster

- Timeout au démarrage (E0505) → réécriture du config Kind → re-create cluster
- `kind create cluster` → OK mais no data
- `kubectl apply -f k8s/base/` → tous les pods en Pending puis ErrImageNeverPull
  - Seuls Redis et Postgres running (images publiques dockehub, pas de pull policy Never)
- Cause : images custom non présentes sur les noeuds Kind après création du cluster

### Fix images

```bash
kind load docker-image taskflow-*:v1.0.0 --name taskflow
kubectl rollout restart deployment -n staging
```

- Tous les pods passent Running sauf `task-service` → reste à 0/1 READY

---

### Exercice readiness probe cassée

**1. État des pods task-service**
0/1 — pod Running mais pas Ready. Le container tourne mais la readiness probe
échoue (path incorrect), donc le pod est exclu du Service : aucun trafic ne lui
est envoyé.

**2. Connexion / création de tâche**
- Login, listing : OK (user-service et api-gateway répondent)
- Création de tâche : KO — le Service task-service n'a aucun endpoint healthy,
  les requêtes tombent en erreur 503.

**3. Après remise du path à `/health`**
- Pods repassent 1/1, création de tâche : OK.

---

### Readiness vs Liveness

| | Readiness | Liveness |
|---|---|---|
| Question posée | "Prêt à recevoir du trafic ?" | "Encore en vie ?" |
| Échec → | Retiré des endpoints du Service | Pod **tué et redémarré** |
| Cas d'usage | Init lente, dépendance indispo | Deadlock, crash silencieux |

**Si on avait cassé la liveness à la place :**
le pod aurait été redémarré en boucle (CrashLoopBackOff) — il n'aurait jamais
eu le temps de répondre, et le résultat aurait été encore pire qu'avec la
readiness.

### Scénario 3 — Rolling update
> 1. Pendant le rolling update, le nombre de pods disponibles a-t-il diminué ? Pourquoi ?
Non, le nombre de pods disponibles n'a pas diminué — c'est précisément l'intérêt du rolling update. Kubernetes applique par défaut maxUnavailable: 25% et maxSurge: 25%, ce qui signifie qu'il crée d'abord un nouveau pod (v1.0.1), attend qu'il soit Ready, puis seulement termine un ancien pod (v1.0.0). À aucun moment la capacité totale ne descend sous le seuil minimal configuré. L'application reste disponible tout au long de la mise à jour.

> 2. Que se serait-il passé si le nouveau pod n'était jamais passé en `1/1` ?
Le rolling update se serait bloqué indéfiniment. Kubernetes ne détruit pas les anciens pods tant que le nouveau n'est pas Ready (readiness probe validée). Au bout du délai progressDeadlineSeconds (600 s par défaut), le déploiement passe en état Failed et génère un événement d'alerte — mais il ne fait pas de rollback automatique sans configuration explicite. L'ancienne version continuerait donc de servir le trafic, ce qui est le comportement souhaité, mais l'opérateur doit intervenir manuellement (ou via un pipeline CI/CD qui surveille l'état du rollout).

> 3. Pourquoi annoter les révisions est-il important en équipe ?
Sans annotation, kubectl rollout history affiche une liste de numéros de révision avec <none> dans la colonne CHANGE-CAUSE : on ne sait pas ce qui a changé, qui l'a fait, ni pourquoi. En équipe, cela rend le diagnostic en cas d'incident très difficile (quel commit a provoqué la régression ? quelle révision cibler pour le rollout undo --to-revision=N ?). Les annotations constituent un journal d'audit minimal directement dans Kubernetes, complémentaire au git log, et lisible sans accès au dépôt.

> 4. `kubectl rollout undo` est-il suffisant comme stratégie de rollback en production ? Quelles limites voyez-vous ?
Non, il ne suffit pas seul. Ses limites principales :

Ne concerne que les Deployments : il ne rollback pas les ConfigMaps, Secrets, migrations de base de données ou changements d'API déployés en parallèle. Si v1.0.1 a migré le schéma SQL, revenir sur le pod ne suffit pas.
Historique limité : par défaut revisionHistoryLimit: 10 ; au-delà, les révisions anciennes sont perdues.
Pas de validation fonctionnelle : undo remet l'ancienne image mais ne vérifie pas que l'application fonctionne réellement (il faut des smoke tests ou des health checks solides).
Pas de rollback des ressources associées : Ingress, HPA, PodDisruptionBudget modifiés séparément ne sont pas rétablis.
Absence de traçabilité formelle : en production, un rollback devrait idéalement passer par le pipeline CI/CD (GitOps) pour que le dépôt reste la source de vérité — un rollout undo manuel crée une divergence entre l'état du cluster et le git.

En production, on lui préfère une stratégie GitOps (revert du commit + re-déploiement automatisé) ou un outil dédié comme Argo Rollouts avec analyse automatique.

> 1. Identifiez au moins 3 valeurs que vous avez répétées dans plusieurs fichiers (namespace, nom d'image, URL de service...). Que se passe-t-il concrètement si vous devez changer l'une d'elles pour un déploiement en production ?
Ce qui se passe concrètement si on doit changer l'une d'elles pour la production :
Il faut modifier manuellement chaque fichier concerné — et avec ~20 fichiers YAML, le risque d'oubli est élevé. Un seul fichier non mis à jour peut provoquer une incohérence silencieuse (par exemple, un pod qui pointe encore sur l'image de staging, ou un service qui ne trouve pas le bon endpoint). C'est le problème classique de la duplication de configuration : elle viole le principe DRY et rend les environnements multiples fragiles à maintenir.
La solution : Kustomize ou Helm
C'est exactement ce que résout la couche k8s/overlays/ avec Kustomize :

le namespace, le préfixe des noms, et les tags d'images sont définis une seule fois dans kustomization.yaml
les overlays staging/ et production/ surchargent uniquement ce qui diffère
un changement de tag d'image en prod se fait sur une seule ligne dans kustomization.yaml, pas dans chaque Deployment

Avec Helm, les valeurs répétées deviennent des variables dans values.yaml (image.tag, namespace, backend.url), et les templates les référencent via {{ .Values.image.tag }}. Passer de staging à production revient à switcher de fichier de values — zéro duplication.