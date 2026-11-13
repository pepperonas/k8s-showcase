#!/usr/bin/env bash
# Startet den Showcase: k3d-Cluster (1 Node, ohne Traefik/Metrics) + 3 Apps.
#   lokal:  ./up.sh                      -> http://localhost:8088
#   VPS:    BIND=127.0.0.1:4277 API=127.0.0.1:6550 CAP_CPUS=1 CAP_MEM=1200m ./up.sh
#           (nur lokal erreichbar, nginx davor; harte Obergrenze fuer den ganzen Cluster)
set -euo pipefail
cd "$(dirname "$0")"
BIND="${BIND:-8088}"
API="${API:-127.0.0.1:6550}"
if ! k3d cluster list showcase >/dev/null 2>&1; then
  k3d cluster create showcase --servers 1 --agents 0 --api-port "$API" -p "${BIND}:30080@server:0" \
    --k3s-arg "--disable=traefik@server:0" --k3s-arg "--disable=metrics-server@server:0" --wait
fi
# Harter Deckel fuer den ganzen Cluster: was auch passiert, der Rest des Servers bleibt frei.
# docker update bleibt ueber Neustarts erhalten; erneut anwenden ist harmlos.
if [[ -n "${CAP_CPUS:-}" ]]; then
  docker update --cpus "$CAP_CPUS" --memory "${CAP_MEM:-1200m}" --memory-swap "${CAP_MEM:-1200m}" \
    k3d-showcase-server-0 >/dev/null
  docker update --cpus 0.25 --memory 64m --memory-swap 64m k3d-showcase-serverlb >/dev/null
fi
kubectl config use-context k3d-showcase >/dev/null
kubectl apply -f k8s/manifests.yaml
kubectl -n demo create configmap api-code --from-file=k8s/api.py --dry-run=client -o yaml | kubectl apply -f -
kubectl -n demo create configmap web-html --from-file=k8s/web/ --dry-run=client -o yaml | kubectl apply -f -
kubectl -n demo create configmap web-conf --from-file=default.conf=k8s/nginx.conf --dry-run=client -o yaml | kubectl apply -f -
kubectl -n demo rollout restart deploy/api deploy/web >/dev/null
kubectl -n demo rollout status deploy/redis deploy/api deploy/web --timeout=180s
echo "Fertig: http://localhost:${BIND##*:}"
