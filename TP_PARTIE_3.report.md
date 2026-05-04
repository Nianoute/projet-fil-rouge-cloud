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

> Combien de pods sont en `Running` ? 3
> Sur quels nœuds sont-ils schedulés ? 0

