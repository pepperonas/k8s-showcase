#!/usr/bin/env bash
# Ausrollen nach k8s.celox.io.   ./deploy.sh          -> Cluster-Inhalt aktualisieren
#                                ./deploy.sh nginx    -> zusaetzlich vHost + Header-Snippet
#                                ./deploy.sh setup    -> einmalig k3d + kubectl auf dem VPS installieren
set -euo pipefail
cd "$(dirname "$0")"
VPS=root@69.62.121.168
DIR=/opt/k8s-showcase
K3D_VERSION=v5.9.0
KUBECTL_VERSION=v1.34.1

node --test tests/hyper.test.mjs >/dev/null && echo "Tests gruen"

if [[ "${1:-}" == "setup" ]]; then
  ssh "$VPS" "set -e
    command -v k3d >/dev/null || { curl -fsSL -o /usr/local/bin/k3d https://github.com/k3d-io/k3d/releases/download/$K3D_VERSION/k3d-linux-amd64 && chmod 755 /usr/local/bin/k3d; }
    command -v kubectl >/dev/null || { curl -fsSL -o /usr/local/bin/kubectl https://dl.k8s.io/release/$KUBECTL_VERSION/bin/linux/amd64/kubectl && chmod 755 /usr/local/bin/kubectl; }
    k3d version | head -1; kubectl version --client | head -1"
fi

ssh "$VPS" "mkdir -p $DIR"
rsync -az --delete --chmod=D755,F644 up.sh k8s "$VPS:$DIR/"
ssh "$VPS" "chmod 755 $DIR/up.sh && cd $DIR && BIND=127.0.0.1:4277 API=127.0.0.1:6550 CAP_CPUS=1 CAP_MEM=1200m ./up.sh | tail -2"

if [[ "${1:-}" == "nginx" || "${1:-}" == "setup" ]]; then
  ssh "$VPS" 'pgrep -x certbot >/dev/null && { echo "certbot laeuft - abgebrochen"; exit 1; } || true'
  scp deploy/nginx/k8s-headers.conf "$VPS:/etc/nginx/snippets/k8s-headers.conf"
  scp deploy/nginx/k8s.celox.io "$VPS:/etc/nginx/sites-available/k8s.celox.io"
  ssh "$VPS" 'ln -sfn /etc/nginx/sites-available/k8s.celox.io /etc/nginx/sites-enabled/k8s.celox.io \
    && nginx -t && systemctl reload nginx'
fi

sleep 2
curl -fsS -o /dev/null -w "https://k8s.celox.io/ -> %{http_code}\n" https://k8s.celox.io/
curl -fsS -o /dev/null -w "https://k8s.celox.io/tree.html -> %{http_code}\n" https://k8s.celox.io/tree.html
