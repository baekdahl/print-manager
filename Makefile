PG_CONTAINER ?= print-manager-postgres
PG_VOLUME ?= print-manager-pgdata
PG_IMAGE ?= postgres:17
PG_PORT ?= 5432
PG_USER ?= postgres
PG_PASSWORD ?= postgres
PG_DB ?= print_manager

.PHONY: db-up db-down db-reset db-psql db-logs

db-up:
	@if [ -z "$$(docker ps -aq -f name=^$(PG_CONTAINER)$$)" ]; then \
		docker run -d --name $(PG_CONTAINER) \
			-e POSTGRES_USER=$(PG_USER) \
			-e POSTGRES_PASSWORD=$(PG_PASSWORD) \
			-e POSTGRES_DB=$(PG_DB) \
			-p $(PG_PORT):5432 \
			-v $(PG_VOLUME):/var/lib/postgresql/data \
			$(PG_IMAGE) >/dev/null; \
	else \
		docker start $(PG_CONTAINER) >/dev/null; \
	fi
	@until docker exec $(PG_CONTAINER) pg_isready -h 127.0.0.1 -U $(PG_USER) -d $(PG_DB) >/dev/null 2>&1; do sleep 0.5; done
	@echo "Postgres ready: postgres://$(PG_USER):$(PG_PASSWORD)@localhost:$(PG_PORT)/$(PG_DB)"

db-down:
	@docker stop $(PG_CONTAINER) >/dev/null 2>&1 || true

db-reset:
	@docker rm -f $(PG_CONTAINER) >/dev/null 2>&1 || true
	@docker volume rm $(PG_VOLUME) >/dev/null 2>&1 || true
	@$(MAKE) --no-print-directory db-up

db-psql:
	@docker exec -it $(PG_CONTAINER) psql -U $(PG_USER) -d $(PG_DB)

db-logs:
	@docker logs -f $(PG_CONTAINER)
