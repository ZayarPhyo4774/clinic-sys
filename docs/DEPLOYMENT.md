# Deployment

Phase 1 runs locally with Docker Compose. For a solo-clinic production deploy, see [SOLO_CLINIC_GO_LIVE.md](./SOLO_CLINIC_GO_LIVE.md) and `infra/docker-compose.prod.yml`.

## Services

- `postgres` — PostgreSQL 16
- `redis` — Redis 7
- `backend` — Django, Gunicorn, port 8000
- `celery` — Celery worker using Redis as broker and result backend
- `nginx` — reverse proxy on port 8080

The backend container applies migrations on startup. Celery does not, so two processes cannot create the same tables at once.

## Configure

From the repository root:

```bash
cp .env.example .env
```

Replace `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD`. Do not commit `.env`.

`POSTGRES_HOST=localhost` and `REDIS_URL=redis://localhost:6379/0` are for tools on the host. Compose points the backend and Celery containers at the `postgres` and `redis` services.

## Start

```bash
docker compose -f infra/docker-compose.yml up --build
```

Health checks:

- http://localhost:8000/api/v1/health/
- http://localhost:8080/api/v1/health/

## Tests

```bash
docker compose -f infra/docker-compose.yml run --rm --entrypoint pytest backend
```

Create migrations after model changes:

```bash
docker compose -f infra/docker-compose.yml run --rm --entrypoint python backend manage.py makemigrations
```

Stop the stack with `docker compose -f infra/docker-compose.yml down`. Adding `-v` deletes the database volume.

## Production (solo clinic)

```bash
cp .env.production.example .env
# Place TLS certs in infra/certs/fullchain.pem and infra/certs/privkey.pem
docker compose -f infra/docker-compose.prod.yml up --build -d
```

Daily backups:

```bash
chmod +x infra/scripts/backup-db.sh
./infra/scripts/backup-db.sh
```

The production stack adds a Next.js web container, nginx TLS termination, Redis password auth, and `DJANGO_DEBUG=False`. See [SOLO_CLINIC_GO_LIVE.md](./SOLO_CLINIC_GO_LIVE.md) for the full runbook.

## Logging

Application logs go to stdout. A filter redacts passwords, bearer tokens, and URL passwords. Database SQL is not logged at info level. Do not write patient names, clinical text, or contact details to logs. Audit metadata drops known secret keys; callers must still keep clinical text out of metadata.

## Local assumptions

- `DJANGO_DEBUG=True` is for local use. Turn it off for any shared environment so error pages cannot reveal settings.
- The image includes pytest so the same container can run the test suite.
- The process runs as root inside the image. That will be tightened in the hardening phase.
