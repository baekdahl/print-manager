# Print manager

A REST API for printing labels remotely. It sits in front of a third-party print vendor: it syncs that vendor's printers and labels, adds our own metadata to them, and submits print jobs asynchronously with retries.

## Docs

- [Design](docs/design.md): problem, architecture, decisions, consistency and trade-offs
- Swagger UI at <http://localhost:3000/docs> once the API is running

## Running locally

You need Node 22 or later, pnpm and Docker.

```sh
pnpm install
pnpm fake-vendor   # terminal 1: the fake vendor on http://localhost:4000
pnpm dev           # terminal 2: the API on http://localhost:3000, the sync loop and the print worker
```

`pnpm dev` first runs `pnpm local:up`: it creates `.env` from `.env.example` if it's missing, starts Postgres and ElasticMQ (a local SQS, with a web UI on <http://localhost:9325>) with `docker compose`, and applies migrations. The two processes stay separate so you can stop the vendor and watch how sync and print jobs cope.

Swagger UI is at <http://localhost:3000/docs>, and the OpenAPI document is at `/openapi.json`.

### Try it

```sh
curl localhost:3000/printers
curl -X PATCH localhost:3000/printers/ZD420-HALL-B \
  -H 'content-type: application/json' -d '{"nickname": "Hall B left"}'
curl -X PATCH localhost:3000/labels/lbl_102 \
  -H 'content-type: application/json' -d '{"isPrimary": true}'
```

Print, and follow the job from `queued` to `success`:

```sh
curl -i -X POST localhost:3000/print-jobs \
  -H 'content-type: application/json' -d '{"printerName": "ZD420-HALL-B", "labelId": "lbl_101"}'
curl localhost:3000/print-jobs/<id from the Location header>
curl localhost:4000/admin/prints   # what the fake vendor received
```

Make the vendor misbehave on the next prints:

```sh
curl -X POST localhost:4000/admin/print-faults \
  -H 'content-type: application/json' -d '{"status": 500, "times": 2}'   # retried after 10 s, then 20 s
curl -X POST localhost:4000/admin/print-faults \
  -H 'content-type: application/json' -d '{"delayMs": 11000}'            # response timeout: failed, not retried
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
pnpm test        # runs local:up too; uses a <database>_test database and a print-jobs-test queue
pnpm typecheck
pnpm lint
pnpm build       # one bundle per Lambda handler in dist/
```
