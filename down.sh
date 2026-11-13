#!/usr/bin/env bash
# Entfernt Cluster und die geladenen Images wieder (gibt Speicher frei).
k3d cluster delete showcase
docker image rm rancher/k3s:latest ghcr.io/k3d-io/k3d-proxy ghcr.io/k3d-io/k3d-tools 2>/dev/null || true
docker image prune -f >/dev/null
