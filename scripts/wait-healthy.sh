#!/usr/bin/env bash
# Ждёт, пока все сервисы compose станут healthy/running (таймаут 10 минут, DoD спринта 1: стенд < 10 мин).
set -euo pipefail
deadline=$((SECONDS + 600))
while (( SECONDS < deadline )); do
  bad=$(docker compose ps --format '{{.Name}} {{.State}} {{.Health}}' | awk '$2 != "running" || ($3 != "" && $3 != "healthy")' || true)
  if [[ -z "$bad" ]]; then echo "all services healthy"; exit 0; fi
  echo "waiting: $(echo "$bad" | awk '{print $1}' | tr '\n' ' ')"; sleep 5
done
echo "timeout waiting for services" >&2; exit 1
