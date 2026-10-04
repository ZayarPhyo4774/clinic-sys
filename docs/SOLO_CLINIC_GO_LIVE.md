# Solo clinic go-live runbook

Use this guide to launch ClinicSys for a **single doctor, single branch, cash-billing clinic**.

## What you get

- One login with the **Solo Practitioner** role (register → queue → consult → dispense → bill)
- Production Docker stack with TLS, Redis password, and database backups
- No insurance, notifications, or file uploads (add later)

## Phase 1 — Local verification (1 day)

1. Start the dev stack:

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up --build
```

2. Open the operator console as a superuser: `http://localhost:3000/operator`

3. Provision the clinic:

| Step | Action |
|------|--------|
| 1 | Create clinic (name, code, timezone, currency) |
| 2 | Create **one branch** |
| 3 | Install permission catalog |
| 4 | Install default roles (includes **Solo Practitioner**) |
| 5 | Create staff user (doctor email + password) |
| 6 | Create doctor profile + schedule |
| 7 | Assign **Solo Practitioner** role to the doctor (branch-scoped or clinic-wide) |

4. Sign in as the doctor (not superuser) and walk through a test patient:

```
Register patient → Book appointment → Check in → Queue → Start encounter
→ Add note → Prescription → Dispense → Invoice → Issue → Payment
```

5. Confirm the dashboard counts and daily report look correct.

## Phase 2 — Production deploy (2–3 days)

### 1. Prepare the server

- Ubuntu/Debian VPS or a clinic LAN server
- Docker + Docker Compose installed
- Domain pointing to the server (e.g. `clinic.example.com`)
- Firewall: allow 80/tcp and 443/tcp only

### 2. Configure environment

```bash
cp .env.production.example .env
# Edit .env: secrets, DJANGO_ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS
```

Requirements when `DJANGO_DEBUG=False`:

- `DJANGO_SECRET_KEY` — at least 32 characters, unique
- `POSTGRES_PASSWORD` — not a placeholder
- `REDIS_PASSWORD` — strong password (used by Compose)

### 3. TLS certificates

Place certificates on the host:

```
infra/certs/fullchain.pem
infra/certs/privkey.pem
```

Let's Encrypt (example):

```bash
mkdir -p infra/certs infra/certbot/www
# Use certbot on the host or a one-off container to obtain certs,
# then copy fullchain.pem and privkey.pem into infra/certs/
```

After nginx is serving HTTPS and health checks pass, set in `.env`:

```
DJANGO_SECURE_SSL_REDIRECT=True
```

Restart the backend container.

### 4. Start production stack

```bash
docker compose -f infra/docker-compose.prod.yml up --build -d
```

Verify:

- `https://clinic.example.com` — web app loads
- `https://clinic.example.com/api/v1/health/` — `{"status":"ok",...}`

### 5. Schedule backups

```bash
chmod +x infra/scripts/backup-db.sh
# Daily at 2am (crontab -e):
0 2 * * * /path/to/clinicsys/infra/scripts/backup-db.sh
```

Test a restore once on a staging machine before relying on backups.

## Phase 3 — Solo doctor daily workflow

| Step | Screen | Action |
|------|--------|--------|
| 1 | Dashboard | Confirm branch selected in sidebar |
| 2 | Patients | Register walk-in or open existing chart |
| 3 | Appointments | Book slot, **Check in**, **Add to queue** |
| 4 | Queue | **Call** → **Start** when patient enters |
| 5 | Appointment detail | **Start encounter** |
| 6 | Consultation | Vitals, notes, diagnosis, Rx/lab as needed |
| 7 | Prescriptions / Pharmacy | Dispense from stock batch |
| 8 | Billing | Create invoice from encounter → **Issue** → **Payment** |
| 9 | Queue | **Complete** when patient leaves |
| 10 | Consultation | **Complete encounter** |
| 11 | Reports | End-of-day summary |

**Tip:** Complete both the queue entry and the encounter before the next patient to avoid status drift.

## Solo Practitioner permissions

Installed automatically with default roles. Covers:

- Patients: view, create, update
- Appointments + queue: full scheduling flow
- Encounters: full chart
- Prescriptions + pharmacy dispense
- Laboratory orders (if in-house)
- Billing: create, issue, payment
- Reports + notifications inbox

Does **not** include user/role admin — use a separate clinic-admin account for staff changes.

## Go-live checklist

### Before first real patient

- [ ] Production `.env` secrets set (no placeholders)
- [ ] TLS working on public URL
- [ ] Solo Practitioner role assigned to doctor
- [ ] Doctor schedule configured
- [ ] Pharmacy stock loaded (if dispensing)
- [ ] Payment method (Cash) configured
- [ ] Full test visit completed on production URL
- [ ] Backup script tested
- [ ] Superuser credentials stored offline (operator only, not daily use)

### First two weeks

- [ ] Limit to 10–20 patients/day
- [ ] Reconcile cash drawer with billing report daily
- [ ] Review audit logs weekly

## When you hire staff

| Hire | Role to assign |
|------|----------------|
| Receptionist | `receptionist` |
| Nurse | `nurse` |
| Pharmacist | `pharmacist` |
| Cashier | `cashier` |

Doctor keeps **Solo Practitioner** or switch to **Doctor** if front desk takes scheduling.

## Known limits (plan ahead)

| Gap | Workaround |
|-----|------------|
| No password reset UI | Operator resets password in console |
| Visit state not unified | Manually complete queue + encounter |
| No file uploads | Store documents outside system |
| No SMS/email alerts | Verbal queue management |
| Tokens in browser storage | Use a dedicated clinic computer |

## Support commands

```bash
# Logs
docker compose -f infra/docker-compose.prod.yml logs -f backend web nginx

# Run backend tests
docker compose -f infra/docker-compose.prod.yml run --rm --entrypoint pytest backend

# Manual backup
./infra/scripts/backup-db.sh

# Stop stack (keeps database volume)
docker compose -f infra/docker-compose.prod.yml down
```

## Related docs

- [RBAC.md](./RBAC.md) — permission model
- [DEPLOYMENT.md](./DEPLOYMENT.md) — local dev stack
- [SECURITY.md](./SECURITY.md) — security review and follow-ups
