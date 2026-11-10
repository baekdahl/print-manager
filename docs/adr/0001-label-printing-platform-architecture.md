# 1. Label printing platform architecture

Status: proposed

## Context

Internal users need to print labels on many kinds of printers from anywhere. A third-party vendor already offers a single print API for different printer models, but it only exposes names, models and label versions. Users also need to attach their own metadata to printers and labels, and use one REST API for all of it.

Our API must let users:

- list printers, including vendor data and our metadata
- update printer metadata (nickname, current location, serial number)
- list labels, including vendor data and our metadata
- update label metadata (nickname, isPrimary)
- submit a print job

Another team adds and removes printers and labels at the vendor. Our API must stay consistent with the vendor, or at least become consistent over time.

Out of scope:

- Adding or removing printers and labels at the vendor. Another team owns this.
- Designing or rendering labels.
- Tracking whether a label physically printed. The vendor does not expose this.
- Authentication, both for users of our API and with the vendor.

### Vendor API

| Endpoint        | Returns / accepts            | Notes                     |
| --------------- | ---------------------------- | ------------------------- |
| `GET /Printers` | `[{name, model}]`            | no id, no pagination      |
| `GET /Labels`   | `[{id, name, version}]`      | no pagination             |
| `POST /Print`   | `{printerName, labelId}`     | 201 / 400 / 500, no job id |

## Decision

We can't reach the stakeholders, so each open question gets an explicit assumption and a choice that follows from it.

| #  | Question | Assumption | Choice |
| -- | -------- | ---------- | ------ |
| 1  | How do we identify a printer? | `name` is unique and stable at the vendor. A rename looks like a delete plus an add. Names work fine as ids in our URLs. | Use `name` as the printer's key, both in our database and in URLs (`/printers/{name}`, URL-encoded). |
| 2  | How do we identify a label? | `id` is unique and stable. A new version of a label gets a new `id` but keeps the same `name`. | Use `id` as the label's key, both in our database and in URLs (`/labels/{id}`). |
| 3  | Who owns which data? | The vendor owns whether a printer or label exists, plus its vendor fields. We own the metadata. | Vendor fields are read-only in our API and only updated by sync. Users can only edit our metadata fields. API responses combine both. |
| 4  | How do we learn about changes at the vendor? | The vendor has no webhooks or change feed. | Poll the vendor periodically (e.g. every 60 s) and reconcile into our own store. See below for why. |
| 5  | How out of date may list data be? | Users browse lists mostly to choose what to print, and the vendor validates every print anyway. Data up to a minute old is fine. | Sync interval of 60 s. List responses include `lastSyncedAt` in their envelope (#21) so clients can see how fresh the data is. |
| 6  | What happens when a printer or label disappears at the vendor? | It might come back, e.g. if the other team removed it by mistake. | Soft delete: hide it from lists but keep its metadata, and restore it if it reappears. |
| 7  | Someone updates metadata on a printer we haven't synced yet. | Users don't know the vendor and only find printers and labels through our API, so they can't refer to one we haven't synced. | Return 404. No on-demand refresh. |
| 8  | What does `isPrimary` mean? | It marks which version of a label (same `name`) users should pick. | At most one primary per label `name` among labels that aren't removed. Setting a new one clears the old one. When the primary is removed at the vendor, the `name` has no primary until a user picks one. A removed label that reappears comes back as not primary. A new version is never primary by default. |
| 9  | Is metadata a fixed schema or free-form? | The listed fields cover the needs. | Typed, fixed fields, updated with `PATCH`. |
| 10 | Concurrent metadata edits? | Rare. `PATCH` only changes the fields that are sent, so a conflict needs two users editing the same field at the same time. | Last write wins. Optimistic concurrency (`ETag` / `If-Match`) can be added later without breaking clients. |
| 11 | Is submitting a print job synchronous? | The vendor can be slow or fail temporarily, and clients shouldn't have to wait for it. | No. Accept the job with `202` and a job id, put it on a queue, and have a worker send it to the vendor. |
| 12 | Which vendor errors do we retry? | A 500 means nothing printed. A failed connection attempt means the request never reached the vendor. Both are safe to retry. | Retry 500s and failed connection attempts (refused, DNS failure, no connection within 3 s) with exponential backoff, up to a maximum number of attempts. |
| 13 | Which vendor errors are final? | Retrying a 400 won't help. After a response timeout the vendor may already have printed, and a duplicate label is worse than a missing one. | Mark the job `failed` on a 400, on a response timeout (no response within 10 s), or when retries run out. |
| 14 | Duplicate print submissions? | Submitting a job only puts it on our queue, so the request is fast and rarely fails. A client retries only when it loses our response. | No idempotency key for now. `Idempotency-Key` on `POST /print-jobs` can be added later without breaking clients. |
| 15 | Do we validate print jobs before sending them? | The vendor's 400 gives no reason. | Check that the printer and label exist in our store and aren't removed. Otherwise reject with `422`. The vendor still has the final say. |
| 16 | What does print job status mean? | A vendor 201 means the vendor accepted the job, not that it printed. | Statuses: `queued`, `submitted`, `failed`. |
| 17 | How do users authenticate with our API, and how do we authenticate with the vendor? | Out of scope for this case. | Out of scope for this case. |
| 18 | Scale? | Hundreds of printers, thousands of labels, tens of print jobs per minute. | One small service with managed or serverless components. No sharding. |
| 19 | What are the vendor's rate limits? | Unknown, but modest. | Poll conservatively and send all vendor calls through one client. |
| 20 | Cloud and stack? | See [ADR 0002](0002-aws-serverless-with-local-node.md). | AWS Lambda, RDS Postgres and SQS, written in TypeScript. |
| 21 | How do responses separate vendor data from our metadata? | Clients need to see what they can edit. | Vendor fields at the top level, our fields under `metadata`. Lists use the envelope `{ items, lastSyncedAt }`. |
| 22 | Do lists paginate? | Thousands of items fit comfortably in one response. | No pagination for now. |
| 23 | Are removed printers and labels visible? | Users have no use for something they can't print to. | No. They're left out of lists, `GET` and `PATCH` return `404`, and print jobs that reference them get `422`. |
| 24 | What does `PATCH` mean? | Clients edit one or two fields at a time. | The body is a partial `metadata` object. A missing field means no change, `null` clears the field, and unknown fields (including vendor fields) get `400`. |

### #4: Periodic sync instead of calling the vendor on every request

Alternative: call `GET /Printers` and `GET /Labels` on every list request and merge the results with our metadata store.

That approach is simpler and always shows fresh data. We still choose periodic sync because:

- **Availability:** when the vendor is down or slow, listing and editing metadata keep working.
- **Vendor load:** each sync costs a fixed number of vendor calls, however many users we have. Rate limits are unknown (#19).
- **Latency:** reads come from our own store and don't include a round trip to the vendor.
- **Querying:** filtering, sorting and pagination work on the combined data. The vendor supports none of these.
- **Detecting changes:** comparing each sync with the previous state shows us additions and removals, which is what enables soft delete (#6). We could later emit events for them.

Cost: data can be up to one sync interval old, and there is a sync worker to run. This is acceptable because:

- users only find printers and labels through our API, so they never expect one we haven't synced (#7)
- a print job is still checked by the vendor, which has the final say (#15)

## Consequences

- Polling delay: a printer removed at the vendor still appears in lists until the next sync.
- If vendor names are not actually stable (assumption 1), metadata ends up attached to the wrong printer.
- Response timeouts (#13): the vendor gives no print job id, so after a timeout we can't tell whether the job printed. We mark it `failed` even though it might have printed.
- Last write wins (#10): when two users edit the same field at the same time, one edit is silently lost.
- No idempotency key (#14): a client that loses our `202` response and retries creates a duplicate print.
