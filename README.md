# Print manager

A REST API for printing labels remotely. It sits in front of a third-party print vendor: it syncs that vendor's printers and labels, adds our own metadata to them, and submits print jobs asynchronously with retries.

## Docs

- [API](docs/api.md)
- [Architecture](docs/architecture.md)
- [ADR 0001: Label printing platform architecture](docs/adr/0001-label-printing-platform-architecture.md)
- [ADR 0002: AWS serverless, runnable as plain Node locally](docs/adr/0002-aws-serverless-with-local-node.md)

## Build plan

- [ ] Repo skeleton, `docker-compose`, Drizzle schema and migrations
- [ ] Fake vendor
- [ ] `VendorClient` and sync, with the soft delete and `isPrimary` rules
- [ ] API routes for printers and labels
- [ ] Print jobs: the endpoint, the worker, retries and error classification
- [ ] Local runner and integration tests
- [ ] Appendices: Terraform, CI, diagram polish
