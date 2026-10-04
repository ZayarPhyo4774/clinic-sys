# RBAC

Authorization is enforced in the backend. Hiding a screen in a future client does not grant access.

## Models

- `Permission` stores a stable code such as `patients.view`.
- `Role` belongs to one clinic and holds permissions.
- `UserRole` assigns one role to one user. An empty branch means all branches of that clinic. A set branch limits the role to that branch.

Assignment fails when the role or branch belongs to a different clinic from the user.

## How a request is checked

1. JWT authentication identifies the user.
2. `X-Branch-Id`, when present, must refer to an active branch in the user's clinic.
3. A view may set `required_permission`. The code must be present on a matching `UserRole`.
4. A missing permission returns `403` with code `permission_denied`.
5. An unauthenticated request returns `401`.

Superusers bypass branch and permission checks. They are an operator escape hatch, not a clinic role.

Django admin permissions are separate and are not the application permission catalog.

## Solo clinic role

The operator-installed **Solo Practitioner** role (`solo-practitioner`) combines reception, clinical, pharmacy dispense, and billing permissions for a single-doctor clinic. It does not grant `users.manage` or `roles.manage`. Assign it to the doctor's staff login after provisioning the clinic.

## Admin surfaces

There are three admin layers:

- **Operator console** (`/operator` in the web app, `/api/v1/operator/*` on the API) is for Django superusers only. It provisions clinics, branches, the permission catalog, roles, staff logins, and assignments across tenants. It uses its own layout, separate from the clinic workspace sidebar.
- **Clinic admin** (`/users`, `/roles`, and related screens; `/api/v1/admin/*`) is for staff with `users.manage` or `roles.manage` inside one clinic. It cannot create clinics or install the permission catalog.
- **Django admin** (`/admin/` on the API host) is a developer/support tool and is not part of application RBAC.

## Organization permissions

These codes are enforced on the organization API:

- `clinics.view` reads clinics. `clinics.manage` updates the caller's clinic. Creating a clinic additionally requires a superuser.
- `branches.view` and `branches.manage`
- `departments.view` and `departments.manage`
- `staff.view` and `staff.manage` also cover doctor profiles and nurse profiles

A manage code does not imply the matching view code. Grant both when a role should read and write.

Reads of another clinic return `404`. Writes that reference a user, branch, or department outside the caller's clinic return `400`. `DELETE` returns `405` for a caller who has the manage code.

Branch-scoped role assignments apply only when `X-Branch-Id` selects that branch. Clinic-wide assignments apply with or without the header.

## Patient permissions

These codes are enforced on the patient API. They are not seeded. A role receives them when an administrator assigns them.

- `patients.view` lists and reads patients, profiles, contacts, addresses, allergies, medical history, and document metadata
- `patients.create` registers a patient and may add contacts, addresses, allergies, history, and document metadata
- `patients.update` changes demographics, contacts, addresses, and document metadata, and may add allergies or history corrections
- `patients.delete` deactivates a patient

`patients.create` and `patients.update` do not imply `patients.view`. A caller without `patients.view` cannot list or open a chart, even if they can register or deactivate.

Reads of a patient in another clinic return `404`. A patient at another branch is also `404` when `X-Branch-Id` selects a different branch. A branch-scoped role without that header has no patient permission. `DELETE` does not remove the row.

## Scheduling permissions

These codes are enforced on doctor schedules, appointments, and queue entries. They are not seeded.

- `appointments.view` lists and reads schedules, appointments, and queue entries
- `appointments.create` books an appointment
- `appointments.update` edits schedules, confirms, reschedules, checks in, marks a no-show, creates a queue entry, and calls, starts, completes, skips, or requeues that entry
- `appointments.cancel` cancels an appointment and its open queue entry

`appointments.create` and `appointments.update` do not imply `appointments.view`. A caller without `appointments.view` cannot list the day, even if they can book or cancel.

Reads of another clinic return `404`. A visit at another branch is also `404` when `X-Branch-Id` selects a different branch. There is no separate queue permission. `DELETE` is not available on these routes.

## Encounter permissions

These codes are enforced on encounters and their clinical facts. They are not seeded.

- `encounters.view` lists encounters, opens one chart, and reads its history
- `encounters.create` starts an encounter and adds vitals, symptoms, diagnoses, notes, treatment plans, follow-ups, and corrections
- `encounters.update` completes an encounter

`encounters.create` and `encounters.update` do not imply `encounters.view`. Completing an encounter does not grant permission to add or correct clinical facts. Corrections are new rows, not edits.

Reads of another clinic return `404`. An encounter at another branch is also `404` when `X-Branch-Id` selects a different branch. `DELETE` is not available.

## Pharmacy permissions

These codes are enforced on the medicine catalog, batches, stock ledger, and dispensing. They are not seeded.

- `pharmacy.view` reads categories, medicines, suppliers, batches, stock transactions, and low stock
- `pharmacy.manage` creates and updates the catalog, receives stock, adjusts stock, and dispenses

`pharmacy.manage` does not imply `pharmacy.view` or `prescriptions.view`.

Reads of another clinic return `404`. A batch at another branch is also `404` when `X-Branch-Id` selects a different branch. A branch-scoped role without that header has no pharmacy permission. `DELETE` is not available.

## Prescription permissions

These codes are enforced on prescriptions and prescription items. They are not seeded.

- `prescriptions.view` reads prescriptions and items
- `prescriptions.create` creates a prescription, adds items, and cancels a prescription that has not been dispensed

`prescriptions.create` does not imply `prescriptions.view` or permission to dispense. Dispensing requires `pharmacy.manage`.

Reads of another clinic return `404`. A prescription at another branch is also `404` when `X-Branch-Id` selects a different branch. `DELETE` is not available.

## Laboratory permissions

These codes are enforced on the test master, lab orders, items, and results. They are not seeded.

- `laboratory.view` reads tests, orders, items, and results
- `laboratory.manage` maintains the test master, creates orders, adds tests, collects the sample, starts processing, enters and verifies results, completes or cancels an order, and generates report metadata

`laboratory.manage` does not imply `laboratory.view`.

Reads of another clinic return `404`. An order at another branch is also `404` when `X-Branch-Id` selects a different branch. A branch-scoped role without that header has no laboratory permission. `DELETE` is not available.

## Admin permission codes

These codes are installed by the operator console and enforced on the admin and reporting APIs:

- `users.manage` — clinic user management
- `roles.manage` — clinic role and assignment management
- `reports.view` — clinic reports
- `audit.view` — audit log access
- `notifications.view` — notifications inbox

Clinic-admin permissions apply across the whole organization. A branch-scoped role assignment still grants these codes without requiring `X-Branch-Id`. Audit logs list every event in the caller's clinic; use the optional `branch` query parameter to narrow the list.

Billing codes (`billing.view`, `billing.create`, `billing.payment`) are also installed by the operator console when module access is installed.

## Default development roles

The operator console can now install default roles per clinic from the **Module access** section.
The installer is idempotent: existing role codes are kept and skipped unless a future update flow explicitly asks to overwrite them.
The same action supports a re-sync mode that overwrites existing default role names and permission sets.
A preview action shows per-role create/update/skip outcomes and permission-level diffs before applying changes.

Default role set:

- Clinic Admin
- Branch Manager
- Receptionist
- Doctor
- Nurse
- Pharmacist
- Lab Technician
- Cashier
- Auditor
