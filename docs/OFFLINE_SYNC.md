# Offline Sync

The Django API remains the authority for authorization, tenancy, clinical facts, queue position, stock, and financial history. Clients keep a local copy so assigned work can be opened without a connection, and they send only the writes listed below. The server does not store an idempotency ledger. A lost response can therefore be sent again. The clients avoid that when they already hold the server id for an operation.

Signing out clears the local cache, the outbox, and local clinical copies. The device id stays.

## Web

`web/src/offline/` uses IndexedDB (`clinicsys`).

Stores:

- `device` — one device id for the browser
- `cache` — the last successful response for a user, branch, and request
- `outbox` — mutation operations

Outbox fields: `operationId`, `fingerprint`, `deviceId`, `userId`, `name`, `entityType`, `entityId`, `operationType` (`create`, `update`, `cancel`, `correct`), `method`, `path`, `body`, `createdAt`, `status` (`pending`, `in_flight`, `synced`, `conflict`, `failed`), `retryCount`, `nextAttemptAt`, `error`.

`operationId` is a UUID. The same user, method, path, and body does not create a second active row. Replay sends `Idempotency-Key`. The API does not persist that header.

The shell shows **Online**, **Offline**, **Syncing**, **Synced**, or **Failed**. Network failures retry up to five times. The wait is 30 seconds, then doubles, and stops growing at five minutes. A `409` is a conflict and is not retried automatically. A `400`, `403`, or `404` is not retried automatically. A `401` waits until the next sign-in.

Cached reads: patients, appointments, queue, consultations, prescriptions, medicines, lab orders, branches, and clinics. List pages show the last successful response when the API cannot be reached. The last account payload is saved so those screens can reopen. It is not a new permission. Detail pages still require a connection.

There is no service worker. The app shell and bundles must load while online at least once.

Supported offline writes on web (`OFFLINE_MUTATIONS` in `web/src/offline/sync/policy.ts`):

| Name | What sync sends |
| --- | --- |
| `vitals.record` | `POST /encounters/{id}/vitals/` |
| `consultation.note` | `POST /encounters/{id}/notes/` with `{ "body" }` |

Prescription submit offline (`prescriptions.submit`) is **mobile only**.

The web worker replays the outbox to those REST URLs with `Idempotency-Key`. It does not call `POST /api/v1/sync/push/`. A lost response can still be sent again because the direct REST endpoints do not use the sync ledger.

These actions need a connection on web:

- Patient registration, appointment booking, queue changes
- Prescription submit, dispensing, stock changes
- Lab result entry, billing, clinical corrections

## Mobile

`mobile/src/offline/` uses SQLite (`clinicsys.db`) through `expo-sqlite`.

```
offline/database
offline/repositories
offline/outbox
offline/sync
offline/connectivity
offline/conflict
```

Tables:

- `device_identity` — one device id for this install
- `cache_entries` — saved responses, including patients referenced by today's work
- `local_records` — vital readings, consultation notes, and prescription drafts kept on the device
- `outbox` — one row per mutation, with a unique `operation_id`

Each outbox row also stores `fingerprint`, `device_id`, `user_id`, `name`, `entity_type`, `entity_id`, `operation_type`, `method`, `path`, `body`, `created_at`, `status`, `retry_count`, `next_attempt_at`, `server_entity_id`, and `error`.

`user_id` is the signed-in account id. `device_id` is created once and reused.

### Connectivity

`expo-network` updates a shared online flag. The home screen, vital signs, consultation, and prescriptions show one status:

- **Online** — the device is connected and a sync pass has not finished yet
- **Offline** — the device reports no connection
- **Syncing** — a pass is running, or an operation is still pending, including one waiting for its next attempt
- **Synced** — the last pass finished and nothing is waiting or failed
- **Failed** — an operation was rejected, exhausted retries, or is in conflict. **Retry** sends failed rows again. A conflict that already has a server id is left in place

The pass also runs when the app returns to the foreground, when the network returns, and every 30 seconds while online. Passes run one at a time.

### Supported offline reads

These are stored after the server returns them. The same request can be shown from that copy when the API cannot be reached. The list says it is a saved copy.

- Patients on today's appointments and the current queue. Opening that work also stores each patient the account is allowed to read, up to 50 ids. The patient screen lists those saved patients.
- Today's appointments
- Queue
- Consultations (encounter list)
- Prescriptions already issued
- Medicine id, name, and code, used to fill a prescription draft. Stock quantity is not stored.

The last account payload, and the staff page when it was loaded, are saved so the workspace can reopen. The next online `/auth/me/` is authoritative.

Laboratory orders, laboratory results, booking, dispensing, and billing are not available offline.

### Supported offline writes

Each write receives a new `operation_id` unless the same user, name, method, path, and body is already pending, in flight, failed, or in conflict. That existing row is reused. A second identical vital reading is allowed only after the first one is synced, because that is a new reading rather than a duplicate send.

| Name | What is stored | What sync sends |
| --- | --- | --- |
| `vitals.record` | A new vital-sign reading for an encounter | `POST /encounters/{id}/vitals/` |
| `consultation.note` | A new consultation note | `POST /encounters/{id}/notes/` with `{ "body" }` |
| Prescription draft | Local only, status `draft`, until submit | Nothing |
| `prescriptions.submit` | The draft moves into the outbox | `POST /prescriptions/` with the encounter, then `POST /prescriptions/{id}/items/` |

Vitals and notes are new rows. The device does not send `supersedes`, and it does not edit a stored clinical row. A prescription draft does not change an issued prescription. Submit creates a new prescription for an open encounter. The server assigns patient, doctor, branch, clinic, and status.

These actions need a connection and are not written to the outbox:

- Patient registration. The server assigns the patient number.
- Appointment booking. The server assigns the visit time.
- Queue call, start, complete, skip, and requeue. The server assigns the queue position and status.
- Corrections of an existing clinical record.
- Dispensing and stock changes.
- Lab result entry and verification.
- Billing.

### Synchronization flow

1. The screen writes a `local_records` row and an `outbox` row in one step. The local row keeps the user's payload. A draft that has not been submitted has no outbox row.
2. If the device is offline, the row stays `pending` and the screen says it was saved on this device.
3. When the device is online, the worker marks the row `in_flight` and sends it with `Idempotency-Key` set to `operation_id`. A prescription item uses its own `itemOperationId`.
4. A successful response is compared with the payload that was sent. Numeric measurements match by value. Text matches after trimming. Empty and null match each other.
5. If the response matches, the row becomes `synced`. The local payload is kept. The server id is stored so a later pass does not send that create again.
6. If the response differs, or the API returns `409`, the row becomes `conflict`. The user's payload stays in `local_records`. The server body is stored beside it in `server_payload`. The client does not `PUT` or `PATCH` the server record and does not send a correction.
7. If the prescription itself was created before the item failed, `server_entity_id` is saved before the item request. The next attempt continues with the item and does not create a second prescription.
8. A network failure or an HTTP `500` increments `retry_count`, sets `next_attempt_at`, and leaves the row `pending`. The wait starts at 30 seconds and doubles after each failure, up to five minutes. After five attempts the row is `failed`.
9. HTTP `400`, `403`, and `404` become `failed` immediately. The local copy remains so the rejection is visible.
10. HTTP `401` leaves the row `pending` and stops the pass until the user signs in again.
11. **Retry** resets `failed` rows, and `conflict` rows that have no server id, back to `pending` with `retry_count` 0. A conflict that already created a server record stays `conflict` so it is not written a second time.
12. An outbox name that is not in the allowlist is marked `failed` and is not sent.

The server stores each accepted operation and will not apply the same `operation_id` again after it is synced. A lost response can be pushed again. The acknowledgement is the original result.

### Server

`POST /api/v1/sync/push/` accepts up to 50 operations. Each operation is stored and applied in its own transaction. One rejection does not undo the operations that succeeded in the same batch.

Every stored operation has `operation_id`, `device_id`, `user_id`, `clinic_id`, `branch_id`, `entity_type`, `entity_id`, `operation` (`create`, `update`, `cancel`, `correct`), `payload`, `created_at`, `status` (`pending`, `synced`, `failed`, `conflict`), `retry_count`, and `last_error`.

The push applies only new rows:

- `encounters.VitalSign` `create` records a vital sign. The caller needs `encounters.create`.
- `encounters.ClinicalNote` `create` records a consultation note. The caller needs `encounters.create`.
- `prescriptions.Prescription` `create` records a prescription and its item. The caller needs `prescriptions.create`. The payload includes `encounter`, `medicine`, `quantity`, and `dosage`.

`update`, `cancel`, and `correct` are stored as `conflict` and do not change the clinical row. A second push of a synced `operation_id` returns `duplicate: true` and the original `server_entity_id`. The same `operation_id` with a different payload returns `conflict` and leaves the acknowledged payload in place. A `failed` operation can be pushed again. `retry_count` is the number of failed attempts. The successful retry does not create a second clinical row.

`GET /api/v1/sync/pull/?cursor=` returns later changes for the signed-in clinic. `X-Branch-Id` limits the feed to that branch. The caller only receives entity types they can view.

`GET /api/v1/sync/status/?device_id=` returns counts for that device, the latest cursor, `last_error`, and the recent operations.

Audit events for these outcomes use metadata `{"result": "synced"}`, `failed`, `conflict`, or `duplicate`. The event stores the device id. It does not store the payload.

The phone and browser workers still send the allowlisted writes to the encounter and prescription URLs. Those URLs do not use this ledger. A client that pushes through `/api/v1/sync/push/` gets the idempotent acknowledgement above.
