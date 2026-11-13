#!/usr/bin/env bash
# Startet den Showcase: k3d-Cluster (1 Node, ohne Traefik/Metrics) + 3 Apps.
set -euo pipefail
cd "$(dirname "$0")"
if ! k3d cluster list showcase >/dev/null 2>&1; then
  k3d cluster create showcase --servers 1 --agents 0 -p "8088:30080@server:0" \
    --k3s-arg "--disable=traefik@server:0" --k3s-arg "--disable=metrics-server@server:0" --wait
fi
kubectl config use-context k3d-showcase >/dev/null
kubectl apply -f k8s/manifests.yaml
kubectl -n demo create configmap api-code --from-file=k8s/api.py --dry-run=client -o yaml | kubectl apply -f -
kubectl -n demo create configmap web-html --from-file=k8s/index.html --dry-run=client -o yaml | kubectl apply -f -
kubectl -n demo create configmap web-conf --from-file=default.conf=k8s/nginx.conf --dry-run=client -o yaml | kubectl apply -f -
kubectl -n demo rollout restart deploy/api deploy/web >/dev/null
kubectl -n demo rollout status deploy/redis deploy/api deploy/web --timeout=180s
echo "Fertig: http://localhost:8088"
