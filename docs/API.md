# Endesha Salama — ERP / HRM API (v1)

Endesha Salama is a Kiswahili-first HSSE training system for East Africa.
It is open source: one deployment serves one organisation (create your own
Cloudflare Worker + D1 database; see README "Put it online"). Other ERPs and
HRM systems — Odoo, ERPNext, SAP, or an in-house HR system — connect through
this versioned REST API. Do not integrate against `/admin/api/*`; that is the
human admin portal API and can change without notice.

Machine-readable contract: [server/openapi.json](../server/openapi.json).

## Authentication

Create a key in the admin portal (`/admin` → ERP/HRM API keys, Admin role),
or with the bootstrap `ADMIN_TOKEN`:

```sh
curl -X POST https://<host>/admin/api/api-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Odoo production","scopes":"read,write"}'
```

The key (`es_live_…`) is shown once; only its SHA-256 hash is stored.
Send it on every `/api/v1` call as `X-API-Key: es_live_…` or
`Authorization: Bearer es_live_…`.

| Scope | Allows |
|---|---|
| `read` | all `GET` endpoints |
| `write` | `POST`/`PATCH`/`DELETE` (employees, assignments, completions) |
| `admin` | everything, including managing webhooks via the API |

Revoke a key in the portal or with `POST /admin/api/api-keys/revoke`.
A revoked key fails with `401` immediately.

## Conventions

- Base path: `/api/v1`. All bodies are JSON. Errors are `{"error":"…"}` with
  HTTP 400 (bad input), 401 (no/bad key), 403 (missing scope), 404, 409
  (identity conflict), 429 (rate limited).
- Lists return `{"data":[…],"limit":100,"offset":0,"total":123}`.
  Page with `?limit=` (1–500) and `?offset=`.
- Identity: a person is keyed by `odoo_login`, `odoo_employee_id`, or a
  generic pair `external_system` + `external_id` (e.g. `"erpnext"` + the
  employee ID in that system). Sending the same identity again updates the
  person; it never creates a duplicate or a new learner code.
- `country` is a 2-letter code (`TZ` default; also `KE`, `UG`, `RW`, `BI`,
  `SS`, `CD`, `SO`). `language` is `sw` (default, Kiswahili first) or `en`.
- Training status: `pending`, `due_soon` (due within 30 days), `overdue`,
  `current`. Each assignment refreshes `refresh_months` (default 6) after
  the last completion.

## Endpoints

| Method and path | Scope | Purpose |
|---|---|---|
| `GET /api/v1/health` | none | Liveness: `{"ok":true,"version":1}` |
| `GET /api/v1/modules` | read | Modules, tracks and work submodules |
| `GET /api/v1/employees?country=&department=&site=&language=&active=&q=&limit=&offset=` | read | List people |
| `POST /api/v1/employees` | write | Create/update 1 person (object) or many (`{"rows":[…]}`); new people return a learner `code` once |
| `GET /api/v1/employees/:id` | read | One person with assignment status |
| `PATCH /api/v1/employees/:id` | write | Update name/email/department/site/country/language/external ID/active |
| `GET /api/v1/assignments?employee_id=&module=&status=&country=` | read | Assignment status rows |
| `POST /api/v1/assignments` | write | Assign: `{"employee_ids":[…],"module":"fire","due_date":"2026-12-31","refresh_months":6}` |
| `DELETE /api/v1/assignments` | write | Unassign (`employee_id` + `module` as query or JSON body) |
| `GET /api/v1/completions?employee_id=&module=&since=&until=` | read | Completion records |
| `POST /api/v1/completions` | write | Record a completion (see below) |
| `GET /api/v1/status` | read | Counts by status, by module, by country |
| `GET /api/v1/quiz-results?employee_id=&module=&since=` | read | Per-question answers for HSSE review |
| `POST /api/v1/quiz-results` | write | Record answers (`{employee ref, results:[{module, step, correct, at}]}` or one answer) |
| `GET/POST /api/v1/webhooks`, `DELETE /api/v1/webhooks/:id` | admin | Manage webhooks |

### Record a completion

```sh
curl -X POST https://<host>/api/v1/completions \
  -H "X-API-Key: es_live_…" -H 'Content-Type: application/json' \
  -d '{"external_system":"erpnext","external_id":"KE-001","module":"fire","completed_at":"2026-11-04T08:00:00.000Z"}'
```

Identify the person by `employee_id`, `external_system`+`external_id`,
`odoo_employee_id`, or `odoo_login`. Re-sending the same
(employee, module, completed_at) is idempotent (`"recorded":false`).

## Webhooks

Register in the portal (Admin) or via `POST /api/v1/webhooks` (admin scope).
On each event the system POSTs JSON to your HTTPS URL (HTTP only for
localhost during development):

```json
{"event":"completion.created","at":"2026-11-04T08:00:00.000Z","data":{"employee_id":12,"module":"fire","completed_at":"…","source":"api"}}
```

Events: `completion.created`, `assignment.created` (or `*` for all).
Verify `X-Endesha-Signature: sha256=<HMAC-SHA256(secret, raw body)>` with the
`whsec_…` secret shown once at creation. Deliveries are recorded in the
portal (webhook deliveries / audit log); a failing endpoint is marked
`failed` and never blocks the training record.

## Learner (staff) API — not for ERP integration

Phones use `GET /api/me` and `POST /api/complete` with the personal
`X-Staff-Code` header. ERP systems must use `/api/v1` with an API key instead.

## Odoo

Odoo needs no special connector: export employees (or call this API from an
Odoo automation) with `odoo_login` / `odoo_employee_id`, or map Odoo's
employee ID to `external_system:"odoo"`. Production Odoo at Masika Ventures
stays read-only unless the separate Odoo infrastructure approvals allow a
sync.
