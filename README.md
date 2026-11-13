# k8s-showcase

<p>
  <a href="LICENSE"><img alt="Lizenz" src="https://img.shields.io/github/license/pepperonas/k8s-showcase?style=flat-square&labelColor=131318&color=b3c5ff"></a>
  <a href="https://github.com/pepperonas/k8s-showcase/commits/main"><img alt="Letzter Commit" src="https://img.shields.io/github/last-commit/pepperonas/k8s-showcase?style=flat-square&labelColor=131318&color=7dd99b"></a>
  <img alt="Codegröße" src="https://img.shields.io/github/languages/code-size/pepperonas/k8s-showcase?style=flat-square&labelColor=131318&color=7dd99b">
</p>
<p>
  <img alt="Kubernetes" src="https://img.shields.io/badge/Kubernetes-k3s-326CE5?style=flat-square&labelColor=131318&logo=kubernetes&logoColor=326CE5">
  <img alt="k3d" src="https://img.shields.io/badge/Cluster-k3d%20in%20Docker-2496ED?style=flat-square&labelColor=131318&logo=docker&logoColor=2496ED">
  <img alt="Python" src="https://img.shields.io/badge/API-Python%203.12%20stdlib-3776AB?style=flat-square&labelColor=131318&logo=python&logoColor=3776AB">
  <img alt="Redis" src="https://img.shields.io/badge/State-Redis%207-DC382D?style=flat-square&labelColor=131318&logo=redis&logoColor=DC382D">
  <img alt="nginx" src="https://img.shields.io/badge/Web-nginx%20alpine-009639?style=flat-square&labelColor=131318&logo=nginx&logoColor=009639">
</p>
<p>
  <img alt="Image-Builds" src="https://img.shields.io/badge/Eigene%20Images-0-ffcf70?style=flat-square&labelColor=131318">
  <img alt="Abhängigkeiten" src="https://img.shields.io/badge/Laufzeit--Abh%C3%A4ngigkeiten-0-ffcf70?style=flat-square&labelColor=131318">
  <img alt="Platte" src="https://img.shields.io/badge/Platte-~0%2C5%20GB-d0bcff?style=flat-square&labelColor=131318">
  <img alt="RAM" src="https://img.shields.io/badge/RAM-~700%20MB-d0bcff?style=flat-square&labelColor=131318">
  <img alt="Start" src="https://img.shields.io/badge/Start-1%20Befehl-d0bcff?style=flat-square&labelColor=131318">
</p>

Kleiner, sparsamer Kubernetes-Showcase für den Laptop: drei Container, orchestriert in einem lokalen k3d-Cluster, dazu eine Weboberfläche, an der man **Load Balancing**, **Skalieren** und **Self-Healing** live sieht.

![Oberfläche](docs/screenshot.png)

## Inhalt

- [Architektur](#architektur)
- [Schnellstart](#schnellstart)
- [Was man zeigen kann](#was-man-zeigen-kann)
- [Warum so klein](#warum-so-klein)
- [Aufbau des Repos](#aufbau-des-repos)
- [Aufräumen](#aufräumen)

## Architektur

```
Browser ──► :8088 ──► NodePort 30080 ──► web (nginx)
                                            │  /api/
                                            ▼
                                   Service api ──► api-Pod ×3 (Python)
                                                       │            │
                                                       ▼            ▼
                                              Service redis   Kubernetes-API
                                                   (Zähler)   (Pods lesen/löschen,
                                                               Deployment skalieren)
```

| Deployment | Image | Replicas | Aufgabe |
|---|---|---|---|
| `web` | `nginx:alpine` | 1 | liefert die Oberfläche, leitet `/api/` an den Service `api` weiter |
| `api` | `python:3.12-alpine` | 3 (1–6) | zählt Besuche in Redis, meldet den antwortenden Pod, spricht mit der Kubernetes-API |
| `redis` | `redis:7-alpine` | 1 | gemeinsamer Zustand aller api-Pods |

Die API darf über ihren **ServiceAccount** nur, was die **Role** im Namespace `demo` erlaubt: Pods lesen und löschen, und ausschließlich die Deployment `api` lesen und patchen. Gelöscht werden über die Oberfläche nur `api-`-Pods.

## Schnellstart

Voraussetzungen: Docker (Desktop) läuft, `kubectl` und `k3d` sind installiert (`brew install k3d`).

```bash
./up.sh
# → http://localhost:8088
```

`up.sh` legt beim ersten Aufruf den Cluster `showcase` an (ein Node, Traefik und Metrics-Server abgeschaltet), spielt die Manifeste ein, erzeugt die ConfigMaps aus `k8s/` und wartet, bis alles läuft. Ein erneuter Aufruf deployt Änderungen an Code oder Oberfläche.

## Was man zeigen kann

| Aktion in der Oberfläche | Was Kubernetes tut |
|---|---|
| **20 Requests** | Der Service verteilt die Anfragen auf die api-Pods, jede Farbe ist ein anderer Pod. Der Zähler bleibt dank Redis über alle Pods hinweg konsistent. |
| **+ 1 / − 1** | `spec.replicas` der Deployment wird per API gepatcht, der Scheduler startet bzw. beendet Pods. |
| **Kill** | Der Pod wird gelöscht, das ReplicaSet stellt den Sollzustand nach ~4 s wieder her. |

Am eindrucksvollsten mit einem Terminal daneben:

```bash
kubectl -n demo get pods -w
```

## Warum so klein

- **Keine eigenen Images:** Der API-Code (`k8s/api.py`) und die Oberfläche (`k8s/index.html`) kommen als ConfigMap in den Cluster. Es gibt keinen `docker build`, keine Registry, keinen Build-Cache.
- **Nur Alpine-Images** und **k3s** statt eines vollen Kubernetes.
- **Null Python-Abhängigkeiten:** Redis wird über das RESP-Protokoll direkt per Socket angesprochen, die Kubernetes-API per `urllib` mit dem ServiceAccount-Token.
- **Ressourcen-Limits** an jedem Container (16–64 MiB).

Gemessen: rund 0,5 GB auf der Platte, rund 700 MB RAM für den ganzen Cluster.

## Aufbau des Repos

```
up.sh               Cluster anlegen und deployen
down.sh             Cluster und Images entfernen
k8s/manifests.yaml  Namespace, Deployments, Services, RBAC
k8s/api.py          API (Python-Standardbibliothek)
k8s/index.html      Oberfläche (eine Datei, kein Build)
k8s/nginx.conf      Auslieferung + Proxy auf /api/
```

## Aufräumen

```bash
./down.sh
```

Löscht den Cluster und die k3s-Images, der Speicherplatz ist danach wieder frei.

## Lizenz

[MIT](LICENSE) © 2026 Martin Pfeffer | [celox.io](https://celox.io)
