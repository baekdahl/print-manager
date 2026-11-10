# 2. AWS serverless, runnable as plain Node locally

Status: proposed

## Context

[ADR 0001](0001-label-printing-platform-architecture.md) asks for:

- a REST API
- a sync job that runs every 60 s against the vendor
- an async print worker with retries

The load is small: hundreds of printers, thousands of labels, tens of print jobs a minute. We want the whole system to run locally as one plain Node process, without an AWS account, for development, tests and demos.

## Decision

**Cloud: AWS.** It's the most common choice for this kind of team, and it lets us show real cloud infrastructure: VPCs, NAT, connection pooling, IAM and dead-letter queues. We considered Cloudflare Workers, Queues and D1. It's simpler and nearly free, but it hides most of the infrastructure we want to discuss. The core logic doesn't depend on the cloud, so moving later stays possible.

**Language: TypeScript on Node 22.**

**Compute:**

| Component | Trigger | Code |
|---|---|---|
| API Lambda | API Gateway (HTTP API) | Hono app |
| Sync Lambda | EventBridge Scheduler, every 60 s | `syncPrinters()`, `syncLabels()` |
| Print worker Lambda | SQS `print-jobs` | `processPrintJob()` |

Lambda handlers are thin wrappers. The logic lives in plain TypeScript modules that the Lambdas, the local Node process and the tests all call. We add interfaces only where a second implementation is actually needed. The first one is `VendorClient`, which the tests replace. We rejected full ports and adapters as too heavy for this size.

**HTTP: Hono and Zod.** Hono runs on Lambda (`hono/aws-lambda`) and on Node (`@hono/node-server`) unchanged. Zod validates requests. We rejected Fastify (heavier) and Express (weak types, dated).

**Database: RDS Postgres with Drizzle.** Postgres runs locally in Docker exactly as in production, and the `isPrimary` rule becomes a partial unique index. We rejected DynamoDB: the local setup is worse, and the uniqueness rule would need transactions in code. Drizzle gives us schema, typed queries and migrations in one place.

**Queue: SQS with a dead-letter queue.** Retries are driven by SQS:

- A retryable error (ADR 0001 #12) makes the worker report the message as failed (`ReportBatchItemFailures`).
- Before that, the worker sets a backoff with `ChangeMessageVisibility`: 2^`ApproximateReceiveCount` seconds.
- On the final attempt the worker marks the job `failed` itself instead of failing the message.
- The dead-letter queue only catches unexpected crashes.

**Submitting a print job:** insert the job as `queued`, then send it to SQS. If the send fails, mark the job `failed` and return `503`. We rejected a transactional outbox as overkill.

**Sync:** one transaction per run:

- Upsert everything the vendor returned and soft-delete everything it didn't.
- If the vendor call fails, skip the run.
- Accept an empty list from the vendor, since soft delete can be undone.
- `pg_try_advisory_lock` keeps runs from overlapping.

**Networking:**

| | Production (diagram) | Deployed demo |
|---|---|---|
| Lambdas | In a VPC, private subnets | Same |
| RDS | Private subnets | Same |
| RDS Proxy | Yes, pools connections from many Lambdas | No, the load is too low to need it |
| NAT gateway | Yes, for vendor traffic | Yes, to reach the fake vendor |

We rejected running Lambdas outside the VPC: it would make RDS reachable from the internet. The demo is deployed briefly and torn down, so the NAT gateway costs very little.

**Fake vendor:** a small Hono app that implements the vendor's three endpoints over in-memory data. Admin endpoints let you add and remove printers and labels, and inject failures (`500`, slow responses, connection refused). It runs locally and is deployed as a Lambda with a function URL.

**Local development:**

- `docker-compose` runs Postgres and ElasticMQ, an SQS-compatible server.
- One Node process (`tsx`) runs the Hono server, `setInterval(sync, 60s)`, and a loop that receives SQS messages and calls the same handler as the Lambda.
- The SQS client is the real AWS SDK, pointed at a different endpoint.

**Infrastructure as code: Terraform**, as an appendix. We know it best, and `plan` shows exactly what will change. We considered CDK, which would give same-language infrastructure and automatic bundling. esbuild builds one bundle per Lambda.

**Operations:**

- **Migrations:** `drizzle-kit migrate` runs locally and in CI. In AWS, a migration Lambda is invoked after `terraform apply`.
- **Database password:** RDS manages it in Secrets Manager.
- **Logging and alarms:** structured JSON logs go to CloudWatch. There are alarms on dead-letter queue depth, sync failures, and the rate of `failed` jobs.
- **CI:** GitHub Actions runs typecheck, lint (Biome) and tests.

**Tests:**

- **Unit tests:** Vitest, covering sync, error classification, `isPrimary` and `PATCH` validation, with `VendorClient` mocked.
- **Integration tests:** against `docker-compose` and the fake vendor, covering the full submit → queue → worker → status flow.

**Repo layout:** a single npm package.

```
src/            core logic, Hono app, Lambda handlers, local runner
fake-vendor/    fake vendor app
infra/          Terraform
docs/           ADRs, API, architecture
docker-compose.yml
```

## Consequences

- Lambdas in a VPC need a NAT gateway to reach the vendor, which is a fixed monthly cost in production.
- Without RDS Proxy, the demo deployment relies on low concurrency to stay within Postgres connection limits.
- Between the database insert and the SQS send, a crash can leave a job `queued` with no message. That's the trade-off for not having an outbox.
- The local setup runs the same code paths as AWS, except for the triggers. API Gateway, EventBridge Scheduler and the SQS-to-Lambda event mapping are only exercised in AWS.
