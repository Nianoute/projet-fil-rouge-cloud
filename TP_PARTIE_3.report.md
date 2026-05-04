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

> 1. Quelle propriété du StatefulSet garantit que chaque Pod conserve toujours le même volume de stockage, même après un redémarrage ou un rescheduling sur un autre nœud ?
C'est cette propriété qui crée un PVC dédié et nommé de manière stable pour chaque Pod (postgres-data-postgres-0, postgres-data-postgres-1…). Contrairement à un volume classique, le PVC survit à la suppression du Pod et se relie au même Pod au redémarrage, quel que soit le nœud.
> 2. Pourquoi un Deployment serait-il inadapté pour PostgreSQL, même si techniquement on peut lui attacher un volume ?
Un Deployment génère des Pods avec des noms aléatoires et interchangeables. Si le Pod est recréé, il peut recevoir un nouveau PVC (ou aucun si mal configuré), perdant ainsi les données. De plus, avec plusieurs replicas, plusieurs Pods écriraient simultanément sur le même volume → corruption des données. PostgreSQL a besoin d'un identifiant réseau stable et d'un stockage garanti : exactement ce que le StatefulSet fournit.
> 3. Parmi les services restants de la stack TaskFlow (Redis, notification-service, `api-gateway`, frontend), lequel mériterait potentiellement un StatefulSet plutôt qu'un Deployment en production ? Justifiez votre choix.
Redis est le seul candidat sérieux au StatefulSet parmi ces services. En mode persistance (AOF/RDB) ou cluster Redis, chaque nœud doit conserver ses données et son identité réseau stable. Les autres (api-gateway, notification-service, frontend) sont stateless par nature : pas de stockage local, interchangeables, donc un Deployment suffit largement.
