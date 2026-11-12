# API

Decisions behind this API are in [ADR 0001](adr/0001-label-printing-platform-architecture.md). The OpenAPI spec is generated from the Zod schemas in code and served at `/openapi.json`, with Swagger UI at `/docs`.

## Routes

| Route | Success | Errors |
|---|---|---|
| `GET /printers` | `200` | |
| `GET /printers/{name}` | `200` | `404` |
| `PATCH /printers/{name}` | `200` + updated printer | `400`, `404` |
| `GET /labels` | `200` | |
| `GET /labels/{id}` | `200` | `404` |
| `PATCH /labels/{id}` | `200` + updated label | `400`, `404` |
| `POST /print-jobs` | `202` + `Location` header | `400`, `422`, `503` |
| `GET /print-jobs/{id}` | `200` | `404` |

Printer names are URL-encoded in paths. Removed printers and labels are left out of lists and return `404`.

## Resources

### Printer

```json
{
  "name": "ZD420-HALL-B",
  "model": "ZD420",
  "metadata": {
    "nickname": "Hall B left",
    "location": "Building 2, Hall B",
    "serialNumber": "52J193300123"
  }
}
```

### Label

```json
{
  "id": "lbl_123",
  "name": "shipping-4x6",
  "version": "3",
  "metadata": {
    "nickname": "Shipping",
    "isPrimary": true
  }
}
```

Metadata fields are `null` until a user sets them. `isPrimary` defaults to `false`.

### Lists

Lists are plain JSON arrays of the resource. No pagination.

### Print job

Request:

```json
{ "printerName": "ZD420-HALL-B", "labelId": "lbl_123" }
```

Response:

```json
{
  "id": "0b6c...",
  "printerName": "ZD420-HALL-B",
  "labelId": "lbl_123",
  "status": "queued",
  "attempts": 0,
  "lastError": null,
  "createdAt": "2026-11-10T12:00:00Z",
  "updatedAt": "2026-11-10T12:00:00Z"
}
```

| Status | Meaning |
|---|---|
| `queued` | Accepted by us, waiting to be sent to the vendor or being retried. |
| `submitted` | The vendor returned `201`. That doesn't mean the label has physically printed. |
| `failed` | The vendor returned `400`, the response timed out, retries ran out, or the queue send failed. |

`422` means the printer or label doesn't exist or has been removed. `503` means the job couldn't be put on the queue.

## Updating metadata

`PATCH` takes a partial `metadata` object:

```json
{ "nickname": "Hall B left", "location": null }
```

- A missing field means no change.
- `null` clears the field.
- Unknown fields, including vendor fields like `model`, get `400`.
- `isPrimary` takes only `true` or `false`. `null` gets `400`.
- Setting `isPrimary: true` on a label clears it on the other labels with the same `name`.
- Concurrent edits: the last write wins. One exception: two requests at the same time that set `isPrimary: true` on versions of the same label can make one of them fail with `500`. The database still ends up with one primary.

## Errors

Errors use [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Invalid request body",
  "errors": [{ "path": ["metadata", "model"], "message": "Unrecognized key" }]
}
```
