# CLAUDE.md

Kubernetes-Showcase für den Laptop (k3d, Namespace `demo`, Port 8088). Ziel: möglichst wenig Speicher.

- Keine eigenen Images bauen: Code und HTML kommen per ConfigMap aus `k8s/` (`up.sh` erzeugt sie). Nach Änderungen einfach `./up.sh`.
- `api.py` bleibt bei der Python-Standardbibliothek (Redis per RESP-Socket, Kubernetes-API per urllib + ServiceAccount-Token).
- `terminationGracePeriodSeconds: 2` an der api ist nötig: der HTTP-Server ignoriert SIGTERM, sonst hängen Pods 30 s in „Terminating“.
- `./up.sh` setzt `replicas` auf 3 zurück (apply des Manifests).
- RBAC bewusst eng: Pods get/list/delete, nur Deployment `api` get/patch.
