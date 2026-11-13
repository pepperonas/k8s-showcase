# CLAUDE.md

Kubernetes-Showcase „Kubernetes zum Anfassen“: ein k3d-Cluster mit drei Programmen (nginx, Python-API ×3, Redis), eine erklärende Startseite, eine Cluster-Oberfläche und das JSON-Astrolabium. Lokal auf `:8088`, live auf **k8s.celox.io**. Ziel von Anfang an: wenig Speicher, verständlich für Laien.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `/` | `index.html` + `landing.js` – Startseite mit kleiner anfassbarer Scheibe |
| `/cluster.html` | `cluster.html` + `app.js` – Load Balancing, Skalieren, Löschen, Klartext-Protokoll |
| `/tree.html` | `tree.html` + `tree.js` – JSON-Astrolabium |
| gemeinsam | `hyper.js` (Geometrie), `orb.js` (Darstellung der Scheibe), `site.css` (Farben/Schrift für Start + Cluster) |
| Bilder | `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `og.jpg` – gerendert aus `tools/og.html`, `tools/icons.html` |
| Cluster | `k8s/manifests.yaml`, `k8s/api.py`, `k8s/nginx.conf` |
| Server | `deploy.sh`, `deploy/nginx/` (vHost + Kopfzeilen) |

## Cluster

- **Keine eigenen Images:** Code und Seiten kommen per ConfigMap in den Cluster. `up.sh` erzeugt `api-code` aus `k8s/api.py` und `web-html` aus dem ganzen Ordner `k8s/web/` (Bilder als Binärdaten, im Cluster Base64-kodiert: ~220 kB Dateien ergeben ~500 kB ConfigMap; Limit 1 MB – große Bilder gehören nicht hierher). Nach Änderungen einfach `./up.sh`.
- `up.sh` setzt `replicas` auf 3 zurück. Parameter per Umgebung: `BIND` (Seite, Default `8088`), `API` (k8s-API, Default `127.0.0.1:6550`), `CAP_CPUS`/`CAP_MEM` (Docker-Deckel, nur auf dem VPS).
- `api.py` bleibt bei der Python-Standardbibliothek (Redis per RESP-Socket, Kubernetes-API per urllib + ServiceAccount-Token).
- `terminationGracePeriodSeconds: 2` an der api ist nötig: der HTTP-Server ignoriert SIGTERM, sonst hängen Pods 30 s in „Terminating“.
- nginx im Cluster löst `api` pro Anfrage über CoreDNS `10.43.0.10` auf (`resolver` + Variable). Ein fester Upstream ließ nginx beim Kaltstart abstürzen, weil das DNS noch nicht bereit war.
- **RBAC bewusst eng, nur Namespace `demo`:** Pods get/list/delete (die API löscht nur `api-`-Pods), Deployment `api` get/patch, Deployments/ReplicaSets/Services/ConfigMaps/ServiceAccounts nur `list` (für `/api/tree`). ConfigMap-Inhalte nie ausgeben, nur Dateinamen.
- Keine Inline-Skripte in `k8s/web/` – die CSP erlaubt nur `script-src 'self'` (Inline-Stile sind erlaubt).

## Live auf dem VPS (`k8s.celox.io`, seit 2026-11-13)

- k3d-Cluster `showcase` in Docker, Quellen unter `/opt/k8s-showcase`, Binaries `/usr/local/bin/{k3d,kubectl}` (Versionen in `deploy.sh`).
- **Nur an 127.0.0.1 gebunden:** Seite `:4277`, k8s-API `:6550`. Docker-Ports auf 0.0.0.0 würden ufw umgehen – nie ändern. Container `restart=unless-stopped`.
- **Schutz in drei Schichten** (für Laien beschrieben auf der Startseite „Kann man damit etwas kaputtmachen?“ und in der README – bei Änderungen der Zahlen beide nachziehen):
  1. Docker-Deckel: `k3d-showcase-server-0` 1 CPU / 1200m RAM (Swap gleich), `serverlb` 0,25 CPU / 64m. `docker update` übersteht Neustarts, nicht aber `k3d cluster delete/create` – dann setzt `up.sh` sie neu. Gemessen: vier Endlosschleifen im Container bleiben bei ~1 Kern.
  2. Pod-Grenzen: api 200m/64Mi, redis 100m/64Mi, web 100m/32Mi, höchstens 6 api-Kopien.
  3. nginx: je Adresse 10 Abrufe/s, 20 Änderungen/min, 30 Live-Bäume/min, 20 Verbindungen; global (`$server_name`-Zonen) 40 Abrufe/s, 2 Änderungen/s, 3 Live-Bäume/s. 429 = Drossel; Oberflächen zeigen das als „kurz warten“, nie als Ausfall.
- Restrisiko: k3d braucht einen privilegierten Container (Ausbruch = Rechte auf dem Server). Steht so in der README.
- Ausrollen: `./deploy.sh` (Inhalt), `./deploy.sh nginx` (+ vHost), `./deploy.sh setup` (einmalig Binaries). Kein Zustand zu sichern (Redis-Zähler ist flüchtig).
- Entfernen: `ssh root@69.62.121.168 'k3d cluster delete showcase; rm /etc/nginx/sites-enabled/k8s.celox.io && nginx -t && systemctl reload nginx'`.

## Texte und Gestalt

- Alles für Laien: kurze Sätze, du-Form, Fachwort nur mit Erklärung (Restaurant-Vergleich, Glossar, Klartext-Protokoll in `app.js`, `ABOUT` je Datensatz in `tree.js`).
- Farben Messing/Nachtblau in allen drei Seiten (`site.css`; `tree.html` hat dieselben Tokens inline), hell und dunkel.
- `og.jpg` und Favicon-PNGs in Chrome rendern (README „Vorschaubild und Favicon neu erzeugen“), nicht mit ImageMagick. Für transparente PNGs braucht die Vorlage `background:transparent`; das Apple-Icon ist absichtlich deckend.

## JSON-Astrolabium

- **Geometrie (`hyper.js`, UMD, getestet: `node --test tests/hyper.test.mjs`):** Alle Ansichtsbewegungen sind Möbius-Transformationen `V` plus euklidischer Zoom `zoom` und Versatz `ox/oy`. Neue Gesten immer als `V = H.compose(<Abbildung>, V)`, nie Knotenpositionen verschieben. Layout-Garantie: Kinddistanz `s >= -ln(tan(share/4))` hält jeden Unterbaum in seinem Winkelanteil (Test pinnt das).
- **Darstellung (`orb.js`, Global `Orb`, auch für landing.js und tools/og.html):** Backdrop (Sterne nur im dunklen Thema), Glaskugel (`drawDisk` darunter, `drawGlass` über den Knoten), hyperbolisches Gitter (`drawGrid`), Messingring (`drawRing`), Sprite-Kugeln (`drawNode`), Lichter auf Geodäten (`drawComet`, `geoLerp`). Sprites je Farbe einmal vorrendern (Cache), nie pro Bild.
  - ⚠️ Ringfläche: zwischen den zwei `arc`-Aufrufen ein `moveTo`, sonst verbindet eine Linie beide Kreise zu einem Keil.
  - ⚠️ Verläufe nie in eine kleinere Form schneiden (harte Kante); stattdessen Transformation + `fillRect`.
- **Bewegung:** `morph` ({t0, dur, stagger, grow}) für Auffalten beim Laden und Umordnen beim Auf-/Zuklappen, `ripple` bei Auswahl, `anim` fürs Zentrieren, `inertia` nach dem Ziehen. Die Zeichenschleife läuft nur, solange etwas animiert. „Bewegung reduzieren“ schaltet alles ab. Gemessen 119–121 fps.
- **Beschriftungen:** `nameOf()` nennt Listeneinträge nach einem Namensfeld (`name/title/id/…`), sonst „Nr. n“. Platzierung auf der vom Elternknoten abgewandten Seite, Kollisionsprüfung, gezeichnet außerhalb des Scheiben-Clips. Erst sichtbar, wenn ein Knoten beim Auffalten fast angekommen ist.
- **Layout der Seite:** `resize()` misst den freien Platz aus Kopfzeile, Panel und Knopfreihe; Kopfhöhe erst nach `renderSets()` messen. Panel auf/zu lässt die Scheibe gleiten (`shiftStage`). `body.has-sel` blendet die Hilfe aus, solange das Panel offen ist; `loadData` muss die Klasse entfernen.
- **Laden:** `loadSeq` verwirft verspätete `/api/tree`-Antworten, wenn inzwischen ein anderer Datensatz gewählt wurde. 429 → `clusterState='busy'`, Knopf bleibt klickbar.
- `window.__astro` ist der Testhaken für Browser-Prüfungen (V, zoom, selected, mode, visible, focusNode, find).

## Startseite und Cluster-Seite

- Startseiten-Scheibe (`landing.js`): Antippen zentriert, Ziehen zu 60 % gedämpft, nach 3,5 s Ruhe fährt der Baum zurück und kreist weiter; die Bildunterschrift reagiert auf das erste Anfassen.
- `app.js`: `event.currentTarget` ist nach einem `await` null – Element vorher in eine Variable legen. Das Protokoll entsteht aus dem Vergleich zweier Pod-Abfragen (gestartet / bereit / verschwunden).
