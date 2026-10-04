# Clinic System

Multi-clinic, multi-branch clinic management system. The Django API is the authority for tenancy, permissions, and clinical records. A Next.js web app and an Expo mobile app sit in front of it.

## Layout

- `backend` — Django, PostgreSQL, Redis, Celery
- `web` — Next.js clinic workspace
- `mobile` — Expo app with offline sync
- `infra` — Docker Compose for local and solo-clinic production
- `docs` — API, data model, RBAC, security, and go-live notes

## Local start

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up --build
```

Replace `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD` in `.env`. Do not commit `.env`.

Health check: http://localhost:8000/api/v1/health/

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for tests, production, and backups.
