# k8s.celox.io - Kubernetes-Showcase. Der k3d-Cluster laeuft in Docker auf diesem
# Server und ist nur an 127.0.0.1:4277 gebunden; nginx ist der einzige Weg hinein.
# Wildcard-DNS und Wildcard-Zertifikat (*.celox.io), kein certbot noetig.
limit_req_zone $binary_remote_addr zone=k8s_write:1m rate=20r/m;
limit_req_zone $binary_remote_addr zone=k8s_read:1m rate=10r/s;
limit_req_zone $binary_remote_addr zone=k8s_tree:1m rate=30r/m;
# Gesamtdrossel ueber ALLE Adressen zusammen: gegen viele Angreifer gleichzeitig
limit_req_zone $server_name zone=k8s_all:1m rate=40r/s;
limit_req_zone $server_name zone=k8s_all_write:1m rate=2r/s;
limit_req_zone $server_name zone=k8s_all_tree:1m rate=3r/s;
limit_conn_zone $binary_remote_addr zone=k8s_conn:1m;

server {
    listen 80;
    server_name k8s.celox.io;
    return 301 https://k8s.celox.io$request_uri;
}

server {
    listen 443 ssl http2;
    server_name k8s.celox.io;

    ssl_certificate /etc/nginx/ssl/celox-wildcard/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/celox-wildcard/key.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    client_max_body_size 4k;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 15s;
    proxy_hide_header Content-Security-Policy;
    limit_conn k8s_conn 20;
    limit_conn_status 429;

    # Schreibende Aufrufe (Skalieren, Pod loeschen): gedrosselt, nur POST
    location ~ ^/api/(scale|kill)$ {
        include snippets/k8s-headers.conf;
        limit_except POST { deny all; }
        limit_req zone=k8s_write burst=10 nodelay;
        limit_req zone=k8s_all_write burst=10 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:4277;
    }

    # Der Live-Baum fragt Kubernetes sechsmal je Aufruf ab: eigene, engere Grenze
    location = /api/tree {
        include snippets/k8s-headers.conf;
        add_header Cache-Control "no-store" always;
        limit_req zone=k8s_tree burst=5 nodelay;
        limit_req zone=k8s_all_tree burst=6 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:4277;
    }

    location /api/ {
        include snippets/k8s-headers.conf;
        add_header Cache-Control "no-store" always;
        limit_req zone=k8s_read burst=40 nodelay;
        limit_req zone=k8s_all burst=80 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:4277;
    }

    location / {
        include snippets/k8s-headers.conf;
        add_header Cache-Control "no-cache" always;
        limit_except GET HEAD { deny all; }
        proxy_pass http://127.0.0.1:4277;
    }
}
