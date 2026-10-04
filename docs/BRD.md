# Business Requirements

## Purpose

Clinic System is a multi-clinic, multi-branch clinic management system. The backend is the authority for business rules, tenancy, and permissions. Web and mobile clients will be added later.

## Phase 1 scope

This phase delivers the backend foundation only:

- Django project, environment configuration, and Docker Compose
- PostgreSQL, Redis, and Celery wiring
- Custom user, clinic, branch, role, permission, and user-role models
- JWT authentication
- Audit event storage
- Versioned API shell and health check

Clinical workflows beyond patients, schedules, appointments, the queue, the encounter chart, prescriptions, pharmacy stock, and laboratory orders are not implemented. The apps `billing`, `notifications`, and `synchronization` have no domain models yet.

## Later phases

Billing, notifications, reports, offline sync, and the web and mobile clients.

## Assumptions

- A clinic is the organization boundary. A branch is a site inside one clinic.
- Users belong to at most one clinic. A superuser may have no clinic and bypasses application RBAC.
- Application permissions are the custom `accounts.Permission` codes. Django's built-in `auth.Permission` is only there because Django admin needs it.
- Email is the login identifier and is stored in lowercase.
- Clinic defaults are timezone `UTC`, currency `USD`, and locale `en`. Each clinic can override them. No country-specific compliance pack is included.
- No development seed data is loaded.
