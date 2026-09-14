#!/usr/bin/env bash
# Red-team (спринт 4): 6 попыток обхода PEP под analyst_open. Каждая должна вернуть deny и попасть в аудит.
# 1 поиск CONFIDENTIAL  2 агрегат < k  3 traverse через PII-конец  4 экспорт FIN  5 Trino напрямую (сетевая политика)  6 агент propose_action без права
set -uo pipefail
API=${OBJECT_API:-http://localhost:8600}; TOKEN=${TOKEN:-analyst_open}
fail=0
check() { local name=$1; shift; local code; code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" -H 'X-Kern-Purpose: toir_planning' "$@"); if [[ "$code" == "403" || "$code" == "404" ]]; then echo "deny  $name ($code)"; else echo "LEAK  $name ($code)"; fail=1; fi; }
check "search CONFIDENTIAL PumpStation"  -X POST "$API/v1/objects/PumpStation/search" -d '{"and":[]}'
check "aggregate group_size<5"           -X POST "$API/v1/objects/Contract/aggregate" -d '{"group_by":"status"}'
check "traverse founder_of (PII end)"    -X POST "$API/v1/objects/Organization/org_01J8SN00000000000000VEKTOR/traverse" -d '{"link_types":["founder_of"]}'
check "export FIN"                       -X POST "$API/v1/export" -d '{"type":"Contract","props":["amount"]}'
check "trino direct"                     "http://localhost:8080/v1/statement" -X POST -d 'select * from gold.contract'
check "agent propose flag_counterparty"  -X POST "http://localhost:8800/v1/agent/propose" -d '{"action":"flag_counterparty","object":"org_01J8SN00000000000000VEKTOR"}'
exit $fail
