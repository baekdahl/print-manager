# Print manager

A REST API for printing labels remotely. It sits in front of a third-party print vendor: it syncs that vendor's printers and labels, adds our own metadata to them, and submits print jobs asynchronously with retries.

## Docs

- [API](docs/api.md)
- [Architecture](docs/architecture.md)
- [ADR 0001: Label printing platform architecture](docs/adr/0001-label-printing-platform-architecture.md)
- [ADR 0002: AWS serverless, runnable as plain Node locally](docs/adr/0002-aws-serverless-with-local-node.md)

## Running locally

You need Node 22 or later, pnpm and Docker.

```sh
pnpm install
cp .env.example .env
docker compose up -d --wait   # Postgres
pnpm db:migrate
```

Then, in two terminals:

```sh
pnpm fake-vendor   # the fake vendor on http://localhost:4000
pnpm dev           # the API on http://localhost:3000; syncs at startup, then every SYNC_INTERVAL_MS
```

Swagger UI is at <http://localhost:3000/docs>, and the OpenAPI document is at `/openapi.json`.

### Try it

```sh
curl localhost:3000/printers
curl -X PATCH localhost:3000/printers/ZD420-HALL-B \
  -H 'content-type: application/json' -d '{"nickname": "Hall B left"}'
curl -X PATCH localhost:3000/labels/lbl_102 \
  -H 'content-type: application/json' -d '{"isPrimary": true}'
```

Play the other team: change things at the fake vendor, then sync right away instead of waiting for the interval.

```sh
curl -X DELETE localhost:4000/admin/printers/GK420-OFFICE
curl -X POST localhost:4000/admin/printers \
  -H 'content-type: application/json' -d '{"name": "ZT410-DOCK-2", "model": "ZT410"}'
pnpm sync
curl localhost:3000/printers/GK420-OFFICE   # 404: removed at the vendor
```

The fake vendor keeps its data in memory, so restarting it brings back the seed data. Stop it to see how sync handles a vendor that's down.

### Checks

```sh
pnpm test        # needs Postgres; uses a separate <database>_test database, created and migrated on each run
pnpm typecheck
pnpm lint
pnpm build       # one bundle per Lambda handler in dist/
```

## Build plan

- [x] Repo skeleton, `docker-compose`, Drizzle schema and migrations
- [x] Fake vendor
- [x] `VendorClient` and sync, with the soft delete and `isPrimary` rules
- [x] API routes for printers and labels
- [ ] Print jobs: the endpoint, the worker, retries and error classification
- [ ] Local runner and integration tests (the local runner is done for sync; integration tests come with print jobs)
- [ ] Appendices: Terraform, CI, diagram polish
