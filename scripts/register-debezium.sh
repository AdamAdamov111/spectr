#!/usr/bin/env bash
# Регистрирует CDC-коннектор Debezium к реплике "SAP" (postgres-sap). Топики raw.sap.<table> (спец. 9.4).
set -euo pipefail
curl -sf -X PUT http://localhost:8083/connectors/sap-replica/config -H 'Content-Type: application/json' -d '{
  "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
  "database.hostname": "postgres-sap", "database.port": "5432", "database.user": "sap", "database.password": "sap", "database.dbname": "sap",
  "topic.prefix": "raw.sap", "plugin.name": "pgoutput", "slot.name": "spectr_sap", "publication.autocreate.mode": "filtered",
  "table.include.list": "public.equi,public.aufk,public.ekko,public.lfa1,public.iflot,public.anla",
  "snapshot.mode": "initial", "tombstones.on.delete": "true", "decimal.handling.mode": "string", "time.precision.mode": "connect"
}' && echo "debezium connector sap-replica registered"
