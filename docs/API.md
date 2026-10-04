# API

Base path: `/api/<version>/`. The only allowed version is `v1`.

Successful responses use the endpoint's own JSON body. Errors use:

```json
{"code": "validation_error", "detail": "Validation failed.", "fields": {"email": ["This field is required."]}}
```

Authenticated requests send `Authorization: Bearer <access_token>`.

An optional `X-Branch-Id` header selects the branch context. It must be a UUID for a branch in the caller's clinic. A branch outside that clinic returns `403`. A malformed value returns `400`.

Default permission is authenticated. Public endpoints are listed below.

## GET /api/v1/health/

Public. Checks PostgreSQL with `SELECT 1` and Redis with `PING`.

`200`

```json
{"status": "ok", "database": "ok", "redis": "ok"}
```

`503` when either dependency is unavailable. The body uses `"status": "unavailable"`.

## POST /api/v1/auth/token/

Public. Body: `email`, `password`.

`200` returns `access` and `refresh`. A successful login writes an `auth.login` audit event. A bad password writes `auth.login_failed` without the submitted email or password.

## POST /api/v1/auth/token/refresh/

Public. Body: `refresh`.

Refresh tokens rotate. The previous refresh token is blacklisted and cannot be reused.

## GET /api/v1/auth/me/

Authenticated. Returns `id`, `email`, `full_name`, `clinic_id`, and `permissions`.

`permissions` are the application codes for the selected branch. With no branch header, only clinic-wide role assignments are included. Superusers receive every permission code.

## Organization

These routes require authentication and a permission. Lists are paginated:

```json
{"count": 1, "next": null, "previous": null, "results": []}
```

`page` selects the page. `page_size` defaults to 20 and cannot exceed 100. `search` matches the fields named below. `ordering` accepts the documented fields, with a leading `-` for descending order.

A caller who belongs to a clinic only sees that clinic. An object in another clinic returns `404`. A superuser with no clinic can list and create clinics; that account is the operator escape hatch, not a clinic role.

`DELETE` is not available and returns `405`. There is no hard delete.

Query `is_active=true` or `is_active=false` filters records that have an active flag. For doctor and nurse profiles it filters the related staff record. Any other value returns `400`.

When `X-Branch-Id` is set, branch, department, staff, and profile lists are limited to that branch. A `branch` query that names a different branch returns `400`.

### Clinics

Permission: `clinics.view` to read, `clinics.manage` to update. `POST` also requires a superuser.

- `GET /api/v1/clinics/`
- `POST /api/v1/clinics/`
- `GET /api/v1/clinics/{id}/`
- `PUT /api/v1/clinics/{id}/`
- `PATCH /api/v1/clinics/{id}/`

Search: `name`, `code`. Ordering: `name`, `created_at`.

Writable fields: `name`, `code`, `timezone`, `currency`, `locale`, `is_active`. `code` is stored lowercase. `currency` is stored as three uppercase letters. `timezone` must be an IANA name. `created_by` is set by the server.

### Branches

Permission: `branches.view`, `branches.manage`.

- `GET /api/v1/branches/`
- `POST /api/v1/branches/`
- `GET /api/v1/branches/{id}/`
- `PUT /api/v1/branches/{id}/`
- `PATCH /api/v1/branches/{id}/`

Search: `name`, `code`. Ordering: `name`, `created_at`.

Writable fields: `name`, `code`, `is_active`. `clinic` and `created_by` are set by the server from the caller. The caller must belong to a clinic.

### Departments

Permission: `departments.view`, `departments.manage`.

- `GET /api/v1/departments/`
- `POST /api/v1/departments/`
- `GET /api/v1/departments/{id}/`
- `PUT /api/v1/departments/{id}/`
- `PATCH /api/v1/departments/{id}/`

Search: `name`, `code`. Ordering: `name`, `created_at`. Extra filter: `branch`.

Writable fields: `branch`, `name`, `code`, `is_active`. `clinic` is taken from the branch. The branch must belong to the caller's clinic and must be active when the department is created.

### Staff

Permission: `staff.view`, `staff.manage`.

- `GET /api/v1/staff/`
- `POST /api/v1/staff/`
- `GET /api/v1/staff/{id}/`
- `PUT /api/v1/staff/{id}/`
- `PATCH /api/v1/staff/{id}/`

Search: user name, user email, `job_title`. Ordering: `created_at`, `staff_type`. Extra filters: `branch`, `department`, `staff_type` (`doctor`, `nurse`, `other`).

Writable fields: `user`, `branch`, `department`, `staff_type`, `job_title`, `is_active`. `user` cannot be changed after create. The user and department must belong to the same clinic and branch. Responses include `user_email` and `user_full_name`.

### Doctor profiles

Permission: `staff.view`, `staff.manage`.

- `GET /api/v1/doctor-profiles/`
- `POST /api/v1/doctor-profiles/`
- `GET /api/v1/doctor-profiles/{id}/`
- `PUT /api/v1/doctor-profiles/{id}/`
- `PATCH /api/v1/doctor-profiles/{id}/`

Search: `license_number`, `specialty`, staff name. Ordering: `specialty`, `created_at`. Extra filters: `branch`, `specialty`.

Writable fields: `staff`, `license_number`, `specialty`. `staff` must be a doctor in the caller's clinic, cannot be changed after create, and cannot already have a nurse profile. License numbers are unique inside a clinic.

### Nurse profiles

Permission: `staff.view`, `staff.manage`.

- `GET /api/v1/nurse-profiles/`
- `POST /api/v1/nurse-profiles/`
- `GET /api/v1/nurse-profiles/{id}/`
- `PUT /api/v1/nurse-profiles/{id}/`
- `PATCH /api/v1/nurse-profiles/{id}/`

Search: `license_number`, `grade`, staff name. Ordering: `license_number`, `created_at`. Extra filter: `branch`.

Writable fields: `staff`, `license_number`, `grade`. `staff` must be a nurse in the caller's clinic and cannot be changed after create.

## Patients

These routes require authentication and a patient permission. Lists use the same pagination, `search`, and `ordering` rules as the organization API.

A caller who belongs to a clinic only sees that clinic's patients. Another clinic's patient returns `404` on the patient and on every nested route. When `X-Branch-Id` is set, every patient route is limited to that branch. A `branch` query that names a different branch returns `400`.

`patient_number` is assigned by the server as a per-clinic sequence, zero-padded to at least six digits. The client cannot send it. Inactive patients stay readable. `DELETE /api/v1/patients/{id}/` deactivates the patient, increments `version`, and returns the patient. It does not delete the row.

Demographic updates require the current `version`. A mismatch returns `409` with code `conflict`.

Search covers `patient_number` and `full_name` only. It does not search allergy, history, contact, or document text. Ordering: `patient_number`, `full_name`, `created_at`. Extra filters: `is_active`, `sex`, `branch`, `date_of_birth` (`YYYY-MM-DD`).

Creates and updates write an audit event whose metadata is only `{"result": "created"}`, `{"result": "updated"}`, or `{"result": "deactivated"}`.

### Patient registration and chart

- `GET /api/v1/patients/` requires `patients.view`
- `POST /api/v1/patients/` requires `patients.create`
- `GET /api/v1/patients/{id}/` requires `patients.view`
- `PUT` and `PATCH /api/v1/patients/{id}/` require `patients.update`
- `DELETE /api/v1/patients/{id}/` requires `patients.delete`
- `GET /api/v1/patients/{id}/profile/` requires `patients.view`

Writable fields on create: `branch`, `full_name`, `date_of_birth`, `sex`. `branch` may be omitted when `X-Branch-Id` is set. The branch must be active and in the caller's clinic. `date_of_birth` cannot be in the future.

Writable fields on update: `branch`, `full_name`, `date_of_birth`, `sex`, `is_active`, and required `version`.

The profile response contains `patient`, `contacts`, `addresses`, `allergies`, `medical_history`, and `documents`.

### Contacts and addresses

List and retrieve require `patients.view`. Create requires `patients.create` or `patients.update`. Update requires `patients.update`.

- `GET` and `POST /api/v1/patients/{id}/contacts/`
- `GET`, `PUT`, and `PATCH /api/v1/patients/{id}/contacts/{contact_id}/`
- `GET` and `POST /api/v1/patients/{id}/addresses/`
- `GET`, `PUT`, and `PATCH /api/v1/patients/{id}/addresses/{address_id}/`

Contact fields: `kind` (`phone`, `email`, `emergency`), `name`, `value`, `is_primary`. Emergency contacts require `name`. Address fields: `line1`, `line2`, `city`, `region`, `postal_code`, `country`, `is_primary`. `line1` and `city` are required. Several rows may be primary.

### Allergies and medical history

List, retrieve, and create only. There is no update and no delete. Create requires `patients.create` or `patients.update`. Read requires `patients.view`.

- `GET` and `POST /api/v1/patients/{id}/allergies/`
- `GET /api/v1/patients/{id}/allergies/{allergy_id}/`
- `GET` and `POST /api/v1/patients/{id}/medical-history/`
- `GET /api/v1/patients/{id}/medical-history/{history_id}/`

Allergy fields: `substance`, `reaction`, `severity`, optional `supersedes`. History fields: `title`, `details`, optional `onset_date`, optional `supersedes`. `status` is read-only and starts as `active`.

To correct a row, `POST` a new row with `supersedes` set to the active row's id. The new row is stored first. The earlier row's `status` becomes `corrected`. Its substance, reaction, title, and details stay as they were.

### Document metadata

List and retrieve require `patients.view`. Create requires `patients.create` or `patients.update`. Update requires `patients.update`. This API stores metadata only. It does not accept a file upload.

- `GET` and `POST /api/v1/patients/{id}/documents/`
- `GET`, `PUT`, and `PATCH /api/v1/patients/{id}/documents/{document_id}/`

Fields: `title`, `document_type` (`identity`, `consent`, `referral`, `other`), `file_name`, `content_type`, `byte_size`, `storage_key`.

## Scheduling

These routes require authentication and an appointment permission. Lists use the same pagination, `search`, and `ordering` rules as the organization API.

A caller who belongs to a clinic only sees that clinic. Another clinic's schedule, appointment, or queue entry returns `404`. When `X-Branch-Id` is set, every scheduling route is limited to that branch. A `branch` query that names a different branch returns `400`.

Creates and status changes write an audit event whose metadata is only `{"result": "created"}`, `{"result": "updated"}`, `{"result": "rescheduled"}`, `{"result": "confirmed"}`, `{"result": "checked_in"}`, `{"result": "cancelled"}`, `{"result": "no_show"}`, `{"result": "called"}`, `{"result": "started"}`, `{"result": "completed"}`, `{"result": "skipped"}`, or `{"result": "requeued"}`. Patient names, visit reasons, and clinical text are not copied into metadata or application logs.

`DELETE` is not available. An invalid status change returns `400` with field `status`, and neither the appointment nor the queue entry is changed.

Booking and rescheduling lock the doctor and the patient, then reject a time that overlaps another blocking appointment. The database also rejects that overlap if two requests pass the check together.

### Doctor schedules

Permission: `appointments.view` to read, `appointments.update` to create or update.

- `GET /api/v1/doctor-schedules/`
- `POST /api/v1/doctor-schedules/`
- `GET /api/v1/doctor-schedules/{id}/`
- `PUT /api/v1/doctor-schedules/{id}/`
- `PATCH /api/v1/doctor-schedules/{id}/`

Search: license number, specialty. Ordering: `weekday`, `start_time`, `created_at`. Extra filters: `branch`, `doctor`, `weekday` (`0` through `6`), `is_active`.

Writable on create: `branch`, `doctor`, `weekday`, `start_time`, `end_time`, `slot_minutes`, `effective_from`, `effective_until`, `is_active`. `branch` may be omitted when `X-Branch-Id` is set. The doctor must be active at that branch. `weekday` is `0` for Monday through `6` for Sunday. The slot must divide the window.

Doctor, branch, and weekday cannot change. The window cannot change while a non-terminal appointment uses the schedule. Deactivate an unused schedule with `is_active`.

### Appointments

- `GET /api/v1/appointments/` requires `appointments.view`
- `POST /api/v1/appointments/` requires `appointments.create`
- `GET /api/v1/appointments/{id}/` requires `appointments.view`
- `POST /api/v1/appointments/{id}/confirm/` requires `appointments.update`
- `POST /api/v1/appointments/{id}/reschedule/` requires `appointments.update`
- `POST /api/v1/appointments/{id}/check-in/` requires `appointments.update`
- `POST /api/v1/appointments/{id}/no-show/` requires `appointments.update`
- `POST /api/v1/appointments/{id}/queue/` requires `appointments.update` and returns `201` with the queue entry
- `POST /api/v1/appointments/{id}/cancel/` requires `appointments.cancel`

Search: patient number and patient name. Ordering: `starts_at`, `status`, `created_at`. Extra filters: `branch`, `doctor`, `patient`, `status`, `date` (`YYYY-MM-DD` in the clinic timezone).

Writable on create: `branch`, `patient`, `doctor`, `starts_at`, `ends_at`, `visit_reason`. The server chooses `schedule` and sets `status` to `scheduled`. The patient must be an active patient in the caller's clinic. The doctor must be active at the appointment branch. `starts_at` must be in the future and must be one slot aligned to that doctor's schedule. `visit_reason` cannot change later.

Reschedule body: `starts_at`, `ends_at`. It is accepted only for `scheduled` and `confirmed`, and the status stays the same.

Status changes follow the appointment machine in the entity document. Check-in is allowed for `scheduled` or `confirmed`. Queue creation is allowed for `checked_in` and moves the appointment to `in_queue`. Cancel from `scheduled`, `confirmed`, `checked_in`, or `in_queue` also cancels a `waiting`, `called`, or `skipped` queue entry. `no_show` is allowed from `scheduled` or `confirmed`. `cancelled` and `no_show` free the time for another booking.

### Queue

Permission: `appointments.view` to read. The actions below require `appointments.update`.

- `GET /api/v1/queue-entries/`
- `GET /api/v1/queue-entries/{id}/`
- `POST /api/v1/queue-entries/{id}/call/`
- `POST /api/v1/queue-entries/{id}/start/`
- `POST /api/v1/queue-entries/{id}/complete/`
- `POST /api/v1/queue-entries/{id}/skip/`
- `POST /api/v1/queue-entries/{id}/requeue/`

Search: patient number and patient name. Ordering: `position`, `service_date`, `created_at`. Extra filters: `branch`, `doctor`, `status`, `date`.

`call` moves `waiting` to `called`. It is rejected when that doctor already has a `called` or `in_service` entry for the same branch and service date. `start` moves `called` to `in_service` and the appointment to `in_consultation`. `complete` moves `in_service` to `completed` and the appointment to `completed`. `skip` moves `waiting` or `called` to `skipped` and leaves the appointment `in_queue`. `requeue` moves `skipped` back to `waiting` at the next position.

## Encounters

These routes require authentication and an encounter permission. Lists use the same pagination, `search`, and `ordering` rules as the organization API.

A caller who belongs to a clinic only sees that clinic. Another clinic's encounter returns `404` on the encounter and on every nested route. When `X-Branch-Id` is set, every encounter route is limited to that branch.

Search matches the patient number and patient name. It does not search vitals, symptoms, diagnoses, notes, plans, or follow-up text. Ordering: `started_at`, `created_at`. Extra filters: `branch`, `patient`, `doctor`, `status`, `date` (`YYYY-MM-DD` in the clinic timezone).

Each clinical row stores the user, timestamp, patient, doctor, clinic, and branch. Creates and corrections write an audit event whose metadata is only `{"result": "started"}`, `{"result": "completed"}`, `{"result": "created"}`, or `{"result": "corrected"}`. Measurements and clinical text are not copied into metadata or application logs.

`DELETE` is not available. There is no update of clinical text. A correction is a new row.

### Chart

- `GET /api/v1/encounters/` requires `encounters.view`
- `POST /api/v1/encounters/` requires `encounters.create`
- `GET /api/v1/encounters/{id}/` requires `encounters.view`
- `GET /api/v1/encounters/{id}/history/` requires `encounters.view`
- `POST /api/v1/encounters/{id}/complete/` requires `encounters.update`

Create body: `appointment`. The appointment must already be `in_consultation`, and it can have only one encounter. The server copies patient, doctor, clinic, and branch, sets `started_by` from the caller, and sets `started_at`.

`complete` moves `open` to `completed` and sets `completed_by` and `completed_at`. A second completion is rejected. Completing the encounter does not delete its facts.

The history response contains `encounter`, `vitals`, `symptoms`, `diagnoses`, `notes`, `treatment_plans`, and `follow_ups`. The encounter list itself does not include that text.

`GET /api/v1/encounters/?patient={id}` is the patient's encounter history.

### Clinical facts

List and retrieve require `encounters.view`. Create, including a correction, requires `encounters.create`. There is no update and no delete.

- `GET` and `POST /api/v1/encounters/{id}/vitals/`
- `GET /api/v1/encounters/{id}/vitals/{vital_id}/`
- `GET` and `POST /api/v1/encounters/{id}/symptoms/`
- `GET /api/v1/encounters/{id}/symptoms/{symptom_id}/`
- `GET` and `POST /api/v1/encounters/{id}/diagnoses/`
- `GET /api/v1/encounters/{id}/diagnoses/{diagnosis_id}/`
- `GET` and `POST /api/v1/encounters/{id}/notes/`
- `GET /api/v1/encounters/{id}/notes/{note_id}/`
- `GET` and `POST /api/v1/encounters/{id}/treatment-plans/`
- `GET /api/v1/encounters/{id}/treatment-plans/{plan_id}/`
- `GET` and `POST /api/v1/encounters/{id}/follow-ups/`
- `GET /api/v1/encounters/{id}/follow-ups/{follow_up_id}/`

Vital fields: `temperature`, `pulse`, `respiratory_rate`, `systolic`, `diastolic`, `spo2`, `weight_kg`, `height_cm`. At least one measurement is required. Blood pressure needs both numbers, with systolic higher than diastolic.

Symptom field: `description`. Diagnosis fields: `code`, `description`. Note field: `body`. Treatment plan fields: `title`, `details`. Follow-up fields: `follow_up_on`, `note`. `follow_up_on` cannot be before today in the clinic timezone.

Every response also includes `encounter`, `clinic`, `branch`, `patient`, `doctor`, `status`, `recorded_at`, and `recorded_by`. `status` starts as `active`.

To correct a row, `POST` a new row with `supersedes` set to the active row's id. The new row is stored first. The earlier row becomes `corrected` and keeps its original text or measurements. A brand-new fact is accepted only while the encounter is `open`. A correction is also accepted after the encounter is `completed`.

## Pharmacy

These routes require authentication and a pharmacy permission. Lists use the same pagination, `search`, and `ordering` rules as the organization API. `DELETE` is not available.

`pharmacy.view` reads categories, medicines, suppliers, batches, and stock transactions. `pharmacy.manage` creates and updates the catalog, receives stock, adjusts stock, and dispenses. `pharmacy.manage` does not imply `pharmacy.view`.

A caller who belongs to a clinic only sees that clinic. Another clinic's row returns `404`. Categories, medicines, and suppliers are clinic-wide. Batches and stock transactions are also limited to `X-Branch-Id` when that header is set. A batch at another branch is `404` for that header.

Catalog writes set `clinic` from the caller. Codes are stored lowercase and cannot change. Writes that reference a category, medicine, supplier, or batch outside the caller's clinic return `400`.

Creates and updates write an audit event whose metadata is only `{"result": "created"}`, `{"result": "updated"}`, `{"result": "stock_in"}`, `{"result": "adjusted"}`, or `{"result": "dispensed"}`. Medicine names, batch numbers, and quantities are not copied into metadata.

### Catalog

- `GET` and `POST /api/v1/medicine-categories/`
- `GET`, `PUT`, and `PATCH /api/v1/medicine-categories/{id}/`
- `GET` and `POST /api/v1/medicines/`
- `GET`, `PUT`, and `PATCH /api/v1/medicines/{id}/`
- `GET` and `POST /api/v1/suppliers/`
- `GET`, `PUT`, and `PATCH /api/v1/suppliers/{id}/`

Search: `name` and `code`. Ordering: `name`, `created_at`. Medicine list filters: `category`, `is_active`, `low_stock`.

A medicine response includes `available_quantity`: the on-hand sum of active batches that have not expired. With `X-Branch-Id`, the sum is that branch only. `low_stock=true` keeps medicines whose available quantity is less than or equal to `reorder_level`. `low_stock=false` does not filter. A reorder level of zero marks only a zero available quantity as low.

Medicine fields: `category`, `name`, `code`, `form`, `strength`, `unit`, `reorder_level`, `is_active`. Forms are `tablet`, `capsule`, `syrup`, `injection`, `cream`, and `other`. Units are `tablet`, `capsule`, `ml`, `vial`, `tube`, and `piece`. A new medicine needs an active category in the same clinic. An inactive medicine cannot be received or dispensed.

Supplier fields: `name`, `code`, `is_active`.

### Batches and stock

- `GET` and `POST /api/v1/medicine-batches/`
- `GET`, `PUT`, and `PATCH /api/v1/medicine-batches/{id}/`
- `GET` and `POST /api/v1/stock-transactions/`
- `GET /api/v1/stock-transactions/{id}/`

Batch search: `batch_number`. Ordering: `expiry_date`, `created_at`. Filters: `branch`, `medicine`, `is_active`, `expired`, `expiring_before`. `expired=true` means the expiry date is before today in the clinic timezone. `expired=false` means today or later. `expiring_before` is `YYYY-MM-DD` and includes that date.

Create body: `branch`, `medicine`, optional `supplier`, `batch_number`, `expiry_date`, optional `initial_quantity`. `branch` may come from `X-Branch-Id`. The branch must be active and in the clinic, and it must match the header when both are present. The expiry date cannot be in the past. `initial_quantity` above zero creates the batch and a `stock_in` ledger row in one transaction. The response `quantity_on_hand` is the balance after that row. A later update may change only `is_active`.

Stock transaction filters: `kind`, `batch`, `medicine`. Ordering: `recorded_at`.

`POST /api/v1/stock-transactions/` accepts `stock_in` and `adjustment` only. Body: `batch`, `kind`, `quantity`, and for an adjustment `direction` (`in` or `out`) and `reason` (`damaged`, `expired`, `count_correction`, or `other`). Stock-in forces direction `in`. The batch row is locked, the balance is changed, and the ledger row is inserted in one transaction. The response includes `quantity_on_hand`. A quantity that would make the balance negative returns `400` and leaves the balance and the ledger unchanged.

An inactive batch, an inactive medicine, or an expired batch cannot be stocked in. An expired batch cannot receive an adjustment in. An adjustment out is still accepted for an inactive or expired batch. Dispensing is not accepted on this route.

## Prescriptions

These routes require authentication. Lists use the same pagination, `search`, and `ordering` rules as the organization API. `DELETE` is not available.

`prescriptions.view` reads prescriptions and items. `prescriptions.create` creates a prescription, adds items, and cancels a prescription that has not been dispensed. `pharmacy.manage` dispenses an item. None of these codes implies another. A caller who can dispense does not need `prescriptions.view`.

A caller who belongs to a clinic only sees that clinic. Another clinic's prescription returns `404`, including on item and dispense routes. When `X-Branch-Id` is set, every prescription route is limited to that branch.

Search matches the patient number and patient name. It does not search dosage or frequency. Ordering: `created_at`, `status`. Extra filters: `branch`, `patient`, `doctor`, `status`, `encounter`.

Creates write an audit event whose metadata is only `{"result": "created"}`, `{"result": "cancelled"}`, or `{"result": "dispensed"}`. Dosage, medicine names, and quantities are not copied into metadata.

- `GET /api/v1/prescriptions/` requires `prescriptions.view`
- `POST /api/v1/prescriptions/` requires `prescriptions.create`
- `GET /api/v1/prescriptions/{id}/` requires `prescriptions.view`
- `POST /api/v1/prescriptions/{id}/cancel/` requires `prescriptions.create`
- `GET` and `POST /api/v1/prescriptions/{id}/items/`
- `GET /api/v1/prescriptions/{id}/items/{item_id}/`
- `POST /api/v1/prescriptions/{id}/items/{item_id}/dispense/` requires `pharmacy.manage`

Create body: `encounter`. The encounter must be `open` and visible to the caller. The server copies patient, doctor, clinic, and branch, sets `created_by`, and sets `status` to `active`. A completed encounter is rejected. An encounter may have more than one prescription.

Item body: `medicine`, `quantity`, `dosage`, optional `frequency`, optional `duration_days`. The medicine must be active and in the same clinic. Items can be added while the prescription is `active` or `partially_dispensed`. Item details cannot be edited afterward.

`cancel` is accepted only while the prescription is `active` and nothing has been dispensed. After any dispense the status stays `partially_dispensed` or `dispensed`.

Dispense body: `batch`, `quantity`. The batch must be the same medicine at the prescription's branch, active, and unexpired. Quantity cannot exceed the remaining prescribed quantity or the batch on-hand quantity. The prescription, the item, and the batch are locked, in that order, and the balance, the dispensed quantity, and the `dispense` ledger row are written in one transaction. A rejected dispense changes none of them. The response contains `transaction_id`, `quantity_dispensed`, `prescription_status`, and `quantity_on_hand`. The prescription becomes `partially_dispensed` or `dispensed` from those quantities.

## Laboratory

These routes require authentication and a laboratory permission. Lists use the same pagination, `search`, and `ordering` rules as the organization API. `DELETE` is not available.

`laboratory.view` reads the test master, orders, items, and results. `laboratory.manage` maintains the test master and moves an order through collection, processing, result entry, verification, completion, cancellation, and report metadata. `laboratory.manage` does not imply `laboratory.view`.

A caller who belongs to a clinic only sees that clinic. Another clinic's row returns `404`. The test master is clinic-wide. Orders, items, and results are also limited to `X-Branch-Id` when that header is set.

Catalog writes set `clinic` from the caller. Codes are stored lowercase and cannot change. Order writes copy patient, doctor, clinic, and branch from an open encounter. Result values, reference numbers, and test names are not copied into audit metadata. Metadata is only `{"result": "created"}`, `{"result": "updated"}`, `{"result": "sample_collected"}`, `{"result": "processing"}`, `{"result": "corrected"}`, `{"result": "verified"}`, `{"result": "completed"}`, `{"result": "cancelled"}`, or `{"result": "reported"}`.

### Test master

- `GET` and `POST /api/v1/lab-tests/`
- `GET`, `PUT`, and `PATCH /api/v1/lab-tests/{id}/`

Search: `name` and `code`. Ordering: `name`, `created_at`. Filter: `is_active`.

Fields: `name`, `code`, `specimen`, `unit`, `reference_low`, `reference_high`, `reference_text`, `is_active`. Specimen is `blood`, `urine`, `swab`, `stool`, or `other`. When both numeric bounds are sent, low must be less than high. An inactive test cannot be added to an order.

### Orders

- `GET /api/v1/lab-orders/` requires `laboratory.view`
- `POST /api/v1/lab-orders/` requires `laboratory.manage`
- `GET /api/v1/lab-orders/{id}/` requires `laboratory.view`
- `POST /api/v1/lab-orders/{id}/collect/`
- `POST /api/v1/lab-orders/{id}/process/`
- `POST /api/v1/lab-orders/{id}/complete/`
- `POST /api/v1/lab-orders/{id}/cancel/`
- `POST /api/v1/lab-orders/{id}/report/`

The five actions require `laboratory.manage`.

Search matches the patient number and patient name. It does not search test names or result values. Ordering: `created_at`, `status`. Extra filters: `branch`, `patient`, `doctor`, `status`, `encounter`.

Create body: `encounter`. The encounter must be `open`. The server sets `status` to `ordered`. Status values are `ordered`, `sample_collected`, `processing`, `completed`, and `cancelled`.

`collect` moves `ordered` to `sample_collected` after at least one test is on the order. `process` moves `sample_collected` to `processing`. `complete` moves `processing` to `completed` only when every test has one verified active result. `cancel` is accepted from `ordered`, `sample_collected`, or `processing` until a result exists. `report` is accepted once, after `completed`, and sets `reported_at` and `reported_by`. The order response does not include result values.

### Items and results

List and retrieve require `laboratory.view`. Create and verify require `laboratory.manage`.

- `GET` and `POST /api/v1/lab-orders/{id}/items/`
- `GET /api/v1/lab-orders/{id}/items/{item_id}/`
- `GET` and `POST /api/v1/lab-orders/{id}/items/{item_id}/results/`
- `GET /api/v1/lab-orders/{id}/items/{item_id}/results/{result_id}/`
- `POST /api/v1/lab-orders/{id}/items/{item_id}/results/{result_id}/verify/`

Item body: `lab_test`. The test must be active, in the same clinic, and not already on the order. Items can be added while the order is `ordered` or `sample_collected`.

Result body: `value`, and `supersedes` when correcting the active result. The server copies `unit`, `reference_low`, `reference_high`, and `reference_text` from the test master. A numeric value is `low`, `high`, or `normal` against those bounds. A non-numeric value leaves `interpretation` blank. The first result is accepted only while the order is `processing`.

A correction stores a new unverified row and marks the earlier row `corrected`. The earlier value and range stay as entered. `verify` sets `verified_at` and `verified_by` on the active result and does not change the value. A second verification is rejected. Results cannot be entered or verified after the order is `completed` or `cancelled`.

## Not implemented

Billing, notification, and sync endpoints.
