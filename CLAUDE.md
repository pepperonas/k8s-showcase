# CLAUDE.md

Kubernetes-Showcase für den Laptop (k3d, Namespace `demo`, Port 8088). Ziel: möglichst wenig Speicher.

- Keine eigenen Images bauen: Code und HTML kommen per ConfigMap aus `k8s/` (`up.sh` erzeugt sie). Nach Änderungen einfach `./up.sh`.
- `api.py` bleibt bei der Python-Standardbibliothek (Redis per RESP-Socket, Kubernetes-API per urllib + ServiceAccount-Token).
- `terminationGracePeriodSeconds: 2` an der api ist nötig: der HTTP-Server ignoriert SIGTERM, sonst hängen Pods 30 s in „Terminating“.
- `./up.sh` setzt `replicas` auf 3 zurück (apply des Manifests). Parameter per Umgebung: `BIND` (Seite, Default `8088`), `API` (Kubernetes-API, Default `127.0.0.1:6550`).
- nginx im Cluster löst `api` pro Anfrage über CoreDNS `10.43.0.10` auf (`resolver` + Variable). Ein fester Upstream ließ nginx beim Kaltstart abstürzen, weil das DNS noch nicht bereit war.
- Keine Inline-Skripte in `k8s/web/` – die VPS-CSP erlaubt nur `script-src 'self'` (Inline-Stile sind erlaubt).
- RBAC bewusst eng: Pods get/list/delete, nur Deployment `api` get/patch.

## JSON-Astrolabium (`k8s/web/tree.html`, `tree.js`, `hyper.js`)

- Alle Ansichtsbewegungen sind Moebius-Transformationen `V` (Scheibenautomorphismus) plus euklidischer Zoom `zoom` und Versatz `ox/oy`. Neue Gesten immer als `V = H.compose(<Abbildung>, V)` formulieren, nie Knotenpositionen verschieben.
- `hyper.js` ist UMD (Browser-Global `Hyper` + `require`) und wird von `tests/hyper.test.mjs` geprueft: `node --test tests/hyper.test.mjs`.
- Layout-Garantie: Kinddistanz `s >= -ln(tan(share/4))` haelt jeden Unterbaum in seinem Winkelanteil (Test pinnt das).
- `window.__astro` ist der Testhaken fuer Browser-Pruefungen (V, zoom, selected, mode, focusNode, find).
- Die Scheibe misst ihren Platz aus dem echten Layout (Kopfzeile, Panel, Knopfreihe) in `resize()`; Panel auf/zu laesst sie gleiten (`shiftStage`).
- `/api/tree` in `api.py` baut den Live-Baum; RBAC dafuer nur `list`. ConfigMap-Inhalte nie ausgeben, nur Dateinamen.
- ConfigMap `web-html` entsteht aus dem ganzen Ordner `k8s/web/` (`up.sh`).

## Live auf dem VPS (`k8s.celox.io`, seit 2026-11-13)

- k3d-Cluster `showcase` in Docker auf dem VPS, Quellen unter `/opt/k8s-showcase`, Binaries `/usr/local/bin/{k3d,kubectl}` (Versionen in `deploy.sh`).
- **Nur an 127.0.0.1 gebunden:** Seite `127.0.0.1:4277`, Kubernetes-API `127.0.0.1:6550`. Docker-Ports auf 0.0.0.0 würden ufw umgehen – nie ändern. Container `restart=unless-stopped`, überleben einen Neustart.
- nginx-vHost + Kopfzeilen vendort in `deploy/nginx/`; Wildcard-DNS/-Zertifikat, kein certbot. `/api/scale|kill` nur POST, 20/min je Adresse (burst 10), sonst 429; `/` nur GET/HEAD; noindex.
- Ausrollen: `./deploy.sh` (Inhalt), `./deploy.sh nginx` (+ vHost), `./deploy.sh setup` (einmalig Binaries). Kein Zustand, der gesichert werden müsste (Redis-Zähler ist flüchtig).
- Entfernen: `ssh root@69.62.121.168 'k3d cluster delete showcase; rm /etc/nginx/sites-enabled/k8s.celox.io && nginx -t && systemctl reload nginx'`.
