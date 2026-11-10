# Architecture

Decisions behind this architecture are in [ADR 0002](adr/0002-aws-serverless-with-local-node.md).

## AWS

```mermaid
flowchart LR
  client[API clients] --> apigw[API Gateway<br/>HTTP API]
  scheduler[EventBridge Scheduler<br/>every 60 s]

  subgraph vpc[VPC]
    subgraph private[Private subnets]
      api[API Lambda]
      sync[Sync Lambda]
      worker[Print worker Lambda]
      proxy[RDS Proxy<br/>production only]
      db[(RDS Postgres)]
    end
    nat[NAT gateway]
  end

  sqs[SQS print-jobs]
  dlq[SQS dead-letter queue]
  vendor[Vendor API]
  secrets[Secrets Manager]
  cw[CloudWatch<br/>logs + alarms]

  apigw --> api
  scheduler --> sync
  api -- enqueue --> sqs
  sqs --> worker
  sqs -. unexpected crashes .-> dlq
  api --> proxy
  sync --> proxy
  worker --> proxy
  proxy --> db
  sync --> nat
  worker --> nat
  nat --> vendor
  secrets -. DB password .-> proxy
  dlq -. alarm .-> cw
```

| Component | Responsibility |
|---|---|
| API Lambda | Hono app: list printers and labels, update metadata, accept print jobs |
| Sync Lambda | Fetch printers and labels from the vendor and combine them with our data in one transaction |
| Print worker Lambda | Send queued jobs to the vendor, sort errors into retryable or final, update job status |
| SQS `print-jobs` | Buffers print jobs and drives retries and backoff |
| RDS Postgres | Printers, labels, metadata, print jobs, sync state |
| RDS Proxy | Pools connections from many Lambdas (production only) |
| NAT gateway | Lets the Lambdas in the VPC reach the vendor |

## Local

```mermaid
flowchart LR
  client[curl / tests] --> http

  subgraph node[Local Node process]
    http[Hono server]
    timer[setInterval sync]
    poll[SQS receive loop]
  end

  http --> pg[(Postgres)]
  http --> mq[ElasticMQ]
  timer --> pg
  timer --> fv[Fake vendor]
  poll --> mq
  poll --> pg
  poll --> fv
```

Postgres and ElasticMQ run in `docker-compose`. The Lambdas and the local process call the same modules; only the triggers differ.
