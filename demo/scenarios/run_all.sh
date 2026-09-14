#!/usr/bin/env bash
# Сквозной сценарий 2.3 (8 шагов) — печатает ссылки на объекты стенда. На UI-стенде без Docker сценарий открывается из ⌘K → «Сценарий демо».
set -euo pipefail
API=${OBJECT_API:-http://localhost:8600}
echo "1. Ситуационный центр:            http://localhost:5173/#/s/situation"
echo "2. НПС-2, аномалия давления 0.87: http://localhost:5173/#/x/nps_01J8SN000000000000000NPS02/pressure_anomaly_score"
echo "3. Насос-104 (ER SAP ↔ 1С):        http://localhost:5173/#/o/eq_01J8ZK3V9Q7R6X4M2N1P0S8T7A"
echo "4. ООО «Вектор», связи, картель:   http://localhost:5173/#/o/org_01J8SN00000000000000VEKTOR"
echo "5. Действие flag_counterparty:     http://localhost:5173/#/a/flag_counterparty/org_01J8SN00000000000000VEKTOR"
echo "6. Помощник:                       http://localhost:5173/#/s/agent"
echo "7. Инспектор аудита:               http://localhost:5173/#/s/audit"
echo "8. Ветка dev/backfill-2026-08:     http://localhost:5173/#/s/branches"
curl -sf "$API/v1/freshness" >/dev/null 2>&1 && echo "Object API доступен: $API" || echo "Object API не запущен — используется браузерный стенд"
