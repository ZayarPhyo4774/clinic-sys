# Security review

Reviewed on 1 October 2026 against the running Clinic Management System: Django API, Next.js web app, and Expo mobile app. This is a code review of authentication, authorization, tenancy, input handling, logging, offline storage, and the synchronization ledger. It is not a penetration test of a deployed network.

No critical issue was confirmed. Two high-risk implementation holes were fixed in this pass. Other high-risk items need a larger change than a local patch; each one is explained below and was left in place.

## Fixed in this pass

- Login and token refresh are rate limited. The limit uses the TCP address and, for login, the submitted email. It does not trust `X-Forwarded-For`, so a caller cannot open a new limit by changing that header. Limits are 10 login attempts per address and email per minute, and 30 refresh attempts per address per minute. Counters are stored in Redis so both Gunicorn workers share them.
- Nginx now sets `X-Forwarded-For` to the address that connected to the proxy. A client-supplied forwarding list is not passed through.
- Sync create accepts only the fields that record a new vital, note, or prescription. A payload that includes `supersedes`, a status, or any other extra field is stored as a conflict and does not write a clinical row. Update, cancel, and correct were already refused.
- When `DJANGO_DEBUG` is false, the process refuses to start if `DJANGO_SECRET_KEY` is a placeholder or shorter than 32 characters, or if `POSTGRES_PASSWORD` is a placeholder.

## CRITICAL

None confirmed.

Unauthenticated calls to clinical and sync routes return 401. Cross-clinic object access is implemented as 404 through clinic-scoped querysets. The only raw SQL in application code is the health check `SELECT 1`. No file-serving path, XSS sink (`dangerouslySetInnerHTML` or `innerHTML`), or authentication bypass was found.

## HIGH

### Domain writes are not idempotent

`POST /api/v1/sync/push/` stores `operation_id` and will not apply the same operation twice. Encounter, prescription, pharmacy, laboratory, and queue routes do not store `Idempotency-Key`. The phone worker still posts vitals, notes, and prescriptions to those routes. If the server saves the row and the response is lost, the retry creates a second clinical row.

This was not rerouted in this pass. Pointing the phone worker at `/sync/push/` changes the offline protocol: every outbox row needs clinic and branch identifiers, and the client has to apply the per-operation result instead of a normal create response. That is a client and server behavior change, not a local patch. Until that change, treat a retried domain POST as a possible duplicate.

### Clinical data on the device is not encrypted

The web app caches patient, appointment, queue, encounter, prescription, and medicine pages in IndexedDB. The phone stores assigned patient charts, vitals, consultation notes, and prescription drafts in SQLite. Sign-out deletes that data. A copied browser profile or a stolen phone that is still signed in can be read without a key.

This was not encrypted in this pass. Useful encryption needs a key the user holds (a device PIN or biometric unwrap) and, on the phone, an encrypted SQLite build. A key stored next to the database would not protect a copied device.

### Web session tokens are readable by script

The web app stores the access token and refresh token in `sessionStorage` (`web/src/lib/auth/storage.ts`). The `cs_session` cookie is only a route flag with the value `1`. It is not the credential. There is no HTML injection sink in the web or mobile source, so this is not currently exploitable. Any future script that runs on the web origin can copy both tokens. The phone keeps the same tokens in the platform secure store.

Moving the web tokens to `HttpOnly` cookies is an authentication redesign: the Next.js proxy, refresh rotation, and CSRF protection would all change. It was not done here.

### The local stack is not a production deployment

`docs/DEPLOYMENT.md` already says TLS, backups, and a non-root image are later work. The current Compose file publishes the API on port 8000 and Nginx on port 8080, speaks HTTP only, and runs the API process as root. `.env.example` ships `DJANGO_DEBUG=True` and placeholder secrets. Debug mode exposes error detail. A placeholder signing key would let someone forge JWTs.

The boot check above stops the placeholder-secret case only when debug is off. Debug stays on for the local example, and ports stay published so a phone on the LAN can reach the API. Do not put this Compose file on a shared network. Do not enable `SECURE_SSL_REDIRECT` until Nginx terminates TLS; that redirect would break the current HTTP stack.

## MEDIUM

### Refresh tokens are not revoked on sign-out

Access tokens last 15 minutes. Refresh tokens last 7 days, rotate on use, and the previous refresh token is blacklisted. Sign-out on the web and phone deletes the tokens from the device and does not call the server. A refresh token copied before sign-out keeps working until it expires or is rotated. There is no logout endpoint.

### Password policy is the Django default

Passwords are hashed with Django's default hasher (PBKDF2). Validators reject short, common, numeric, and user-similar passwords. The minimum length is 8. Inactive users cannot obtain a token. There is no password-reset flow and no second factor.

### One database role owns the schema

The API connects as `POSTGRES_USER`, which is the database owner created by the Postgres image. That role can change schema and read every table. Redis has no password and is reachable by every container on the Compose network. Neither port is published to the host. A dedicated application role and a Redis password are a deployment change, not an application patch.

### Document records store an unconstrained storage key

Patient documents are metadata only. The API does not accept a file body and does not serve file bytes. `storage_key` is a free string. If a later feature opens that string as a filesystem path, `..` and absolute paths become path traversal. Constrain the key before any file is stored or fetched.

### Sync and account views allow any signed-in user past the permission class

Clinical viewsets deny the request when the action is missing from `permission_map`. Sync push, pull, and status, and `GET /auth/me/`, use `BranchScopedPermission` with no required code, so any authenticated user in the clinic may call them. Push still checks `encounters.create` or `prescriptions.create` before it writes. Pull returns a change only when the caller has the matching view permission. A user with no clinical permission can still create failed ledger rows for their own clinic and branch.

### The change feed and the database contain clinical text

A successful sync stores a snapshot on `SyncChange`, including a note body or vital measurements. Pull returns that snapshot to users in the same clinic and branch who have the view permission. That matches the normal encounter API. Audit rows for sync store only `{"result": "synced"|"failed"|"conflict"|"duplicate"}`. The console log filter redacts passwords, bearer tokens, and URL passwords. It does not redact names, notes, or measurements, so application logs must not print request bodies or clinical fields.

### Superuser bypass

`is_superuser` skips the branch and permission checks on the API. That account is an operator escape hatch. A superuser with no clinic can see across clinics. Do not use a superuser as a clinic login.

### Admin and health are on the same origin as the API

Django admin is mounted at `/admin/` and uses the session cookie, CSRF middleware, and the same password hash. The health check is public and reports whether Postgres and Redis answered. That is useful for Compose and discloses dependency status to anyone who can reach the port.

### Offline cache is an authorization snapshot, not a new decision

A cached `/auth/me` payload lets the web or phone reopen screens while offline. The next online `/auth/me` is authoritative. The server does not trust the device's permission list. Queue moves, booking, dispense, lab verification, and billing stay online-only.

## LOW

- CORS is an explicit origin list and credentials are disabled. The web app calls the API through the Next.js rewrite, same origin as the browser.
- CSRF middleware is enabled. API clients send `Authorization: Bearer`, which the browser does not attach automatically. Cookie CSRF matters for Django admin, which has the middleware.
- React and React Native escape text by default. No raw HTML sink was found in `web/src` or `mobile/src`.
- Search and filters go through the ORM. The health check is a fixed `SELECT 1`.
- Login failure and success are audited as `auth.login_failed` and `auth.login` with metadata `{"result": ...}` only. The password is not written to the audit row.
- `cs_session` is not `HttpOnly` or `Secure`. It carries no token. `SameSite=Lax` is set.
- The sync `device_id` is a client string. Status is limited to the signed-in user. Pull shows the originating device id to users who may already view that record.
- Client `created_at` on a sync operation is stored for the ledger. Clinical `recorded_at` is still set by the server. Times more than five minutes in the future are rejected.
- Two different `operation_id` values with the same vital measurements create two readings. That is intentional. Idempotency is the operation id, not the clinical content.
- There is no malware scanning because the API does not accept file bytes.

## Controls that held

| Area | Result |
| --- | --- |
| Authentication | Email login, JWT access 15 minutes, rotating refresh, blacklist after rotation, inactive users rejected |
| Authorization | Backend permission codes. Hiding a screen in the UI is not the control |
| Clinic isolation | Users belong to one clinic. Querysets are scoped with `apply_clinic_scope`. A foreign clinic object is a 404 |
| Branch isolation | `X-Branch-Id` must be an active branch of the user's clinic. A foreign or inactive branch is 403. A bad UUID is 400 |
| Object permissions | Detail routes use the same scoped queryset as the list. Manage or create does not grant view |
| Sync identity | The operation user must be the signed-in user. Another user's `operation_id` is not applied and is not revealed |
| Sync permission | Create checks the permission for the operation's branch before the clinical write |
| Audit | Business writes record a result code. Known secret keys are dropped from metadata |
| Secrets in the repo | Settings read the signing key and database password from the environment. `.env` is not committed by the example |

## What this review did not change

Encrypted device storage, HttpOnly cookie sessions, TLS, a non-root image, a low-privilege database role, and routing phone retries through `/sync/push/` are left as follow-up. Each one changes deployment or the offline protocol. The fixes above are the ones that close a concrete hole without that redesign.
