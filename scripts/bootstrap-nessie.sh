#!/usr/bin/env bash
# Создаёт ветку dev от main и namespace raw/clean/er/gold/enrich в каталоге Nessie (Iceberg REST).
set -euo pipefail
N=http://localhost:19120/api/v2
main_hash=$(curl -sf "$N/trees/main" | python3 -c 'import sys,json; print(json.load(sys.stdin)["reference"]["hash"])')
curl -sf -X POST "$N/trees?name=dev&type=BRANCH" -H 'Content-Type: application/json' -d "{\"type\":\"BRANCH\",\"name\":\"main\",\"hash\":\"$main_hash\"}" >/dev/null || echo "branch dev exists"
for ns in raw clean er gold enrich; do
  curl -sf -X POST "http://localhost:19120/iceberg/v1/namespaces" -H 'Content-Type: application/json' -d "{\"namespace\":[\"$ns\"],\"properties\":{\"owner\":\"spectr\"}}" >/dev/null || echo "namespace $ns exists"
done
echo "nessie bootstrapped: branches main/dev, namespaces raw clean er gold enrich"
