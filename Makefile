.PHONY: up seed demo test reset ui ui-build ontology help

help:            ## список команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up:              ## поднять полный стенд (Docker 26+, Compose v2)
	docker compose up -d --build
	./scripts/wait-healthy.sh
	./scripts/register-debezium.sh      # CDC-коннектор к postgres-sap
	./scripts/bootstrap-nessie.sh       # ветки main/dev, namespace raw/clean/gold

seed:            ## сгенерировать и загрузить синтетический холдинг
	docker compose run --rm dagster python -m demo.generator --dzo 3 --wells 120 --orgs 900 --docs 5000 --days 30
	docker compose run --rm dagster dagster asset materialize --select "raw/* clean/* er/* gold/* enrich/*"

demo:            ## прогнать сквозной сценарий 2.3 и распечатать ссылки
	./demo/scenarios/run_all.sh

test:            ## юнит + интеграция + security red-team
	docker compose run --rm dagster pytest pipelines/tests
	docker compose run --rm object-api go test ./...
	./tests/security/redteam.sh

reset:           ## снести стенд вместе с томами
	docker compose down -v

ui:              ## UI-стенд без Docker: синтетика и Object API работают в браузере
	cd ui && npm install && npm run dev

ui-build:        ## статическая сборка UI (dist/)
	cd ui && npm install && npm run build

ontology:        ## выгрузить онтологию как код (ontology/*.yaml) из ui/src/data/ontology.ts
	cd ui && npx esbuild scripts/export-ontology.ts --bundle --platform=node --format=esm --outfile=/tmp/export-ontology.mjs --log-level=error && node /tmp/export-ontology.mjs ../ontology
