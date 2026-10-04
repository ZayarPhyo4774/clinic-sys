# Entity Relationship

Phase 1 stores identity, authorization, and audit. Phase 2 stores clinic organization. Phase 3 stores patients. Phase 4 stores doctor schedules, appointments, and the branch queue. Phase 5 stores the clinical encounter. Phase 6 stores the medicine catalog, stock ledger, and prescriptions. Phase 7 stores the laboratory catalog, orders, and results. Later clinical entities are not modeled yet.

## Clinic

Organization boundary.

- `id` UUID
- `name`
- `code` unique, stored lowercase
- `timezone` default `UTC`
- `currency` default `USD`, stored uppercase
- `locale` default `en`
- `is_active`
- `created_at`, `updated_at`
- `created_by` optional user

Creating a clinic is limited to a superuser. A clinic user with `clinics.manage` can update only their own clinic.

## Branch

Site inside one clinic.

- `id` UUID
- `clinic` required
- `name`
- `code` unique per clinic, stored lowercase
- `is_active`
- `created_at`, `updated_at`
- `created_by` optional user

A branch cannot be created for an inactive clinic. The API sets `clinic` from the caller. Callers cannot move a branch to another clinic.

## Department

Unit inside one branch.

- `id` UUID
- `clinic` required, always the branch's clinic
- `branch` required
- `name`
- `code` unique per branch, stored lowercase
- `is_active`
- `created_at`, `updated_at`
- `created_by` optional user

## Staff

Employment of one user at one branch.

- `id` UUID
- `user` required, and that user must belong to the same clinic
- `clinic` required, taken from the branch
- `branch` required
- `department` optional, and must belong to the same branch
- `staff_type` `doctor`, `nurse`, or `other`
- `job_title` optional
- `is_active`
- `created_at`, `updated_at`
- `created_by` optional user

The combination of user, branch, and department is unique. One user can work at more than one branch.

## DoctorProfile

One profile for one doctor staff record.

- `id` UUID
- `staff` required, one-to-one, and `staff_type` must be `doctor`
- `license_number` unique per clinic
- `specialty`
- `created_at`, `updated_at`
- `created_by` optional user

## NurseProfile

One profile for one nurse staff record.

- `id` UUID
- `staff` required, one-to-one, and `staff_type` must be `nurse`
- `license_number` unique per clinic
- `grade` optional
- `created_at`, `updated_at`
- `created_by` optional user

A staff member has at most one of these profiles. Changing `staff_type` is rejected while a profile of the previous type exists.

## User

Custom user. `AUTH_USER_MODEL = accounts.User`.

- `id` UUID
- `email` unique, stored lowercase
- `full_name`
- `clinic` optional, so a superuser can exist before a clinic is assigned
- `is_active`, `is_staff`, `is_superuser`
- `date_joined`, `last_login`
- password hash managed by Django

## Permission

Application permission code, not Django's `auth.Permission`.

- `id` UUID
- `code` unique, dotted lowercase such as `patients.view`
- `description`

## Role

- `id` UUID
- `clinic` required
- `name`
- `code` unique per clinic
- `permissions` many-to-many

## UserRole

- `id` UUID
- `user` required
- `role` required
- `branch` optional
- `created_at`

A null branch means the role applies to every branch of the user's clinic. The role clinic must match the user clinic. The branch, when set, must belong to that same clinic. The combination of user, role, and branch is unique.

## AuditEvent

Append-only. Rows cannot be updated or deleted through the model API.

- `id` UUID
- `actor` optional user
- `action`
- `entity_type`
- `entity_id` optional UUID
- `clinic` optional
- `branch` optional
- `device_id`
- `metadata` JSON, with secret keys stripped on save
- `ip_address`
- `created_at`

Organization creates and updates write an audit event. Metadata is `{"result": "created"}` or `{"result": "updated"}` and does not copy names or license numbers.

Patient writes also write an audit event. Metadata is only `{"result": "created"}`, `{"result": "updated"}`, or `{"result": "deactivated"}`. Names, dates of birth, contact values, addresses, allergy text, history text, and document keys are not copied into metadata or application logs.

## PatientNumberSequence

One row per clinic. `last_value` is the last allocated patient number. The API formats it as at least six digits, zero-padded, and stores it on the patient. Clients cannot choose the number.

## Patient

Demographics for one person at one clinic.

- `id` UUID
- `clinic` required
- `branch` required, and must belong to that clinic
- `patient_number` unique per clinic, assigned by the server
- `full_name`
- `date_of_birth`, not in the future
- `sex` `female`, `male`, `other`, or `unknown`
- `is_active`
- `version` starts at 1 and increases on each demographic change and on deactivation
- `created_at`, `updated_at`
- `created_by` optional user

A demographic update must send the current `version`. A stale version is rejected. `DELETE` sets `is_active` to false and increments `version`. The row is not removed. `Patient.delete()` and queryset deletes are rejected.

## PatientContact

- `id` UUID
- `patient`, `clinic`, `branch`
- `kind` `phone`, `email`, or `emergency`
- `name` required for emergency contacts
- `value` required
- `is_primary`
- `created_at`, `updated_at`
- `created_by` optional user

More than one contact may be marked primary. The server does not clear the others.

## PatientAddress

- `id` UUID
- `patient`, `clinic`, `branch`
- `line1`, `line2`, `city`, `region`, `postal_code`, `country`
- `line1` and `city` are required
- `is_primary`
- `created_at`, `updated_at`
- `created_by` optional user

`country` is free text. More than one address may be marked primary.

## PatientAllergy

Append-only clinical record.

- `id` UUID
- `patient`, `clinic`, `branch`
- `substance`, `reaction`, `severity` (`mild`, `moderate`, `severe`, `unknown`)
- `status` `active` or `corrected`
- `supersedes` optional earlier allergy for the same patient
- `recorded_at`
- `created_at`, `updated_at`
- `created_by` optional user

Substance, reaction, severity, patient, clinic, and branch cannot change after insert. A correction is a new row whose `supersedes` points at the active row. That earlier row then becomes `corrected`. Deletes are rejected.

## PatientMedicalHistory

Append-only clinical record.

- `id` UUID
- `patient`, `clinic`, `branch`
- `title`, `details`, `onset_date` optional and not in the future
- `status` `active` or `corrected`
- `supersedes` optional earlier history row for the same patient
- `recorded_at`
- `created_at`, `updated_at`
- `created_by` optional user

Title, details, onset date, patient, clinic, and branch cannot change after insert. Corrections follow the same rule as allergies. Deletes are rejected.

## PatientDocument

Metadata for a file. The file bytes are not stored in this phase.

- `id` UUID
- `patient`, `clinic`, `branch`
- `title`, `document_type` (`identity`, `consent`, `referral`, `other`)
- `file_name`, `content_type`, `byte_size` optional, `storage_key`
- `created_at`, `updated_at`
- `created_by` optional user

## DoctorSchedule

Weekly availability for one doctor at one branch.

- `id` UUID
- `clinic` taken from the branch
- `branch` required, and the doctor's staff record must be at that branch
- `doctor` required `DoctorProfile`
- `weekday` `0` Monday through `6` Sunday
- `start_time`, `end_time` on the same day, end after start
- `slot_minutes` from 5 to 240, and it must divide the window
- `effective_from`, `effective_until` optional
- `is_active`
- `created_at`, `updated_at`
- `created_by` optional user

Active schedules for the same doctor cannot overlap on the same weekday while their effective dates overlap. Doctor, branch, and weekday cannot change. The window cannot change while a non-terminal appointment still uses the schedule.

## Appointment

One visit for one patient with one doctor.

- `id` UUID
- `clinic`, `branch`
- `patient` required, in the same clinic. The patient's registration branch may differ.
- `doctor` required, active at this branch when the visit is booked or rescheduled
- `schedule` required, chosen by the server from a matching active window
- `starts_at`, `ends_at`
- `status` `scheduled`, `confirmed`, `checked_in`, `in_queue`, `in_consultation`, `completed`, `cancelled`, or `no_show`
- `visit_reason` optional, and it cannot change after create
- `created_at`, `updated_at`
- `created_by` optional user

A new row starts as `scheduled`. The start must be in the future and must be one aligned slot inside the doctor's schedule. Blocking statuses cannot overlap for the same doctor or the same patient. `cancelled` and `no_show` do not block the time. PostgreSQL exclusion constraints enforce that overlap rule inside the transaction.

Allowed status changes:

- `scheduled` to `confirmed`, `checked_in`, `cancelled`, or `no_show`
- `confirmed` to `checked_in`, `cancelled`, or `no_show`
- `checked_in` to `in_queue` or `cancelled`
- `in_queue` to `in_consultation` or `cancelled`
- `in_consultation` to `completed`

Rescheduling changes the time only while the status is `scheduled` or `confirmed`. Patient, doctor, branch, and visit reason cannot change. Rows cannot be deleted.

## QueueEntry

One queue row for one appointment, at the appointment's branch and doctor, on the appointment's local service date.

- `id` UUID
- `appointment` required, one-to-one
- `clinic`, `branch`, `patient`, `doctor` copied from the appointment
- `service_date`
- `position` unique per branch, doctor, and service date
- `status` `waiting`, `called`, `in_service`, `completed`, `skipped`, or `cancelled`
- `called_at`, `started_at`, `completed_at` optional
- `created_at`, `updated_at`
- `created_by` optional user

A new row starts as `waiting` and only while the appointment is `checked_in`. Creating it moves the appointment to `in_queue`.

Allowed status changes:

- `waiting` to `called`, `skipped`, or `cancelled`
- `called` to `in_service`, `skipped`, or `cancelled`
- `in_service` to `completed`
- `skipped` to `waiting`

Calling is rejected when that doctor already has a `called` or `in_service` entry on the same branch and service date. Starting consultation moves the queue to `in_service` and the appointment to `in_consultation`. Completing consultation moves both to `completed`. Skipping leaves the appointment `in_queue`. Requeue returns a skipped entry to `waiting` at the next position. Cancelling the appointment cancels an open queue entry in the same transaction. Rows cannot be deleted.

Schedule, appointment, and queue writes lock the doctor row before changing the visit, so those updates are serialized per doctor.

## Encounter

The clinical chart for one appointment that is already `in_consultation`.

- `id` UUID
- `appointment` required, one-to-one
- `clinic`, `branch`, `patient`, `doctor` copied from the appointment
- `status` `open` or `completed`
- `started_at`, `started_by` the user who opened the chart
- `completed_at`, `completed_by` set when the chart is completed
- `created_at`, `updated_at`

A new encounter starts `open`. `open` can become `completed`. It cannot return to `open`. Appointment, patient, doctor, clinic, branch, and the starting user cannot change. Rows cannot be deleted.

## VitalSign, Symptom, Diagnosis, ClinicalNote, TreatmentPlan, FollowUp

Append-only facts on one encounter. Each row stores:

- `encounter`, `clinic`, `branch`, `patient`, `doctor`
- `recorded_at`, `recorded_by`
- `status` `active` or `corrected`
- `supersedes` optional earlier row of the same kind
- `created_at`, `updated_at`

Vital measurements are `temperature`, `pulse`, `respiratory_rate`, `systolic`, `diastolic`, `spo2`, `weight_kg`, and `height_cm`. At least one is required. Symptoms, diagnoses, notes, treatment plans, and follow-up dates keep their own text. A follow-up date cannot be in the past.

New facts can be added only while the encounter is `open`. A correction is a new row with `supersedes`, including after the encounter is `completed`. The earlier row stays unchanged and becomes `corrected`. Values cannot be edited in place. Rows cannot be deleted.

## MedicineCategory

Catalog group for one clinic.

- `id` UUID
- `clinic` required
- `name`
- `code` unique per clinic, stored lowercase, immutable
- `is_active`
- `created_at`, `updated_at`
- `created_by` optional user

## Medicine

Dispensable product in one clinic.

- `id` UUID
- `clinic` copied from the category
- `category` required, same clinic
- `name`
- `code` unique per clinic, stored lowercase, immutable
- `form` `tablet`, `capsule`, `syrup`, `injection`, `cream`, or `other`
- `strength`
- `unit` `tablet`, `capsule`, `ml`, `vial`, `tube`, or `piece`
- `reorder_level` zero or greater
- `is_active`
- `created_at`, `updated_at`
- `created_by` optional user

Available quantity is not stored. It is the sum of `quantity_on_hand` on active batches whose expiry date is today or later in the clinic timezone. When `X-Branch-Id` is set, that sum uses only that branch. An inactive medicine cannot be stocked in or dispensed.

## Supplier

Clinic-scoped source of a batch. No contact details are stored.

- `id` UUID
- `clinic` required
- `name`
- `code` unique per clinic, stored lowercase, immutable
- `is_active`
- `created_at`, `updated_at`
- `created_by` optional user

## MedicineBatch

Stock of one medicine at one branch.

- `id` UUID
- `clinic` copied from the branch
- `branch` required
- `medicine` required, same clinic
- `supplier` optional, same clinic
- `batch_number` unique for that medicine at that branch
- `expiry_date` required, and not in the past when the batch is created
- `quantity_on_hand` cached balance, zero or greater
- `is_active`
- `created_at`, `updated_at`
- `created_by` optional user

Medicine, branch, batch number, expiry date, and supplier cannot change after create. `quantity_on_hand` changes only in the same transaction as a stock ledger row. A new batch starts at zero and an optional opening quantity is a stock-in row. An inactive or expired batch cannot be stocked in or dispensed. An adjustment out can still write it off.

## StockTransaction

Append-only stock ledger. Rows cannot be updated or deleted.

- `id` UUID
- `clinic`, `branch`, `medicine` copied from the batch
- `batch` required
- `kind` `stock_in`, `adjustment`, or `dispense`
- `direction` `in` or `out`
- `quantity` at least 1
- `reason` required for an adjustment: `damaged`, `expired`, `count_correction`, or `other`
- `prescription_item` required for `dispense`, empty otherwise
- `recorded_at`, `recorded_by`

Stock-in always moves `in`. Dispense always moves `out` and is created only by the prescription dispense action. The balance is updated and the ledger row is inserted under a row lock. If the balance would go below zero, neither change is kept.

## Prescription

Medication order for one open encounter. A completed encounter cannot receive a new prescription. More than one prescription may belong to the same encounter.

- `id` UUID
- `encounter` required
- `clinic`, `branch`, `patient`, `doctor` copied from the encounter
- `status` `active`, `partially_dispensed`, `dispensed`, or `cancelled`
- `created_at`, `updated_at`
- `created_by` optional user

A new prescription starts `active`. `active` can become `partially_dispensed`, `dispensed`, or `cancelled`. `partially_dispensed` can become `dispensed`. Cancel is allowed only from `active` while every item still has `quantity_dispensed` of zero. Attribution cannot change. Rows cannot be deleted.

## PrescriptionItem

One medicine line on a prescription.

- `id` UUID
- `prescription` required
- `clinic`, `branch`, `patient`, `doctor` copied from the prescription
- `medicine` required, active, same clinic
- `quantity` at least 1
- `quantity_dispensed` starts at zero and cannot exceed `quantity`
- `dosage` required
- `frequency` optional
- `duration_days` optional
- `created_at`, `updated_at`
- `created_by` optional user

Items can be added while the prescription is `active` or `partially_dispensed`. Medicine, quantity, dosage, frequency, and duration cannot change. `quantity_dispensed` increases only when a dispense ledger row is written. The prescription becomes `dispensed` when every item is fully dispensed, and `partially_dispensed` when any quantity has been dispensed and some remains. The same medicine may appear on more than one line.

Dispensing locks the prescription, then the item, then the batch. It rejects a batch at another branch, a batch for another medicine, an inactive or expired batch, a quantity above the remaining prescription, or a quantity above `quantity_on_hand`. A rejected dispense leaves the balance, the dispensed quantity, and the ledger unchanged.

## LabTest

Test master for one clinic.

- `id` UUID
- `clinic` required
- `name`
- `code` unique per clinic, stored lowercase, immutable
- `specimen` `blood`, `urine`, `swab`, `stool`, or `other`
- `unit` optional
- `reference_low` and `reference_high` optional decimals; when both are set, low is less than high
- `reference_text` optional
- `is_active`
- `created_at`, `updated_at`
- `created_by` optional user

Changing the master later does not change ranges already copied onto a result. An inactive test cannot be added to a new order.

## LabOrder

Laboratory request for one open encounter. A completed encounter cannot receive a new order. An encounter may have more than one order.

- `id` UUID
- `encounter` required
- `clinic`, `branch`, `patient`, `doctor` copied from the encounter
- `status` `ordered`, `sample_collected`, `processing`, `completed`, or `cancelled`
- `reported_at`, `reported_by` set once when a report is generated
- `created_at`, `updated_at`
- `created_by` optional user

`ordered` can become `sample_collected` or `cancelled`. `sample_collected` can become `processing` or `cancelled`. `processing` can become `completed` or `cancelled`. Completed and cancelled orders stay there. Sample collection needs at least one test. Completion needs a verified active result for every test. Cancellation is rejected once any result exists. Report metadata is written only after completion and cannot be rewritten. Rows cannot be deleted.

## LabOrderItem

One test on an order.

- `id` UUID
- `order` required
- `clinic`, `branch`, `patient`, `doctor` copied from the order
- `lab_test` required, active, same clinic, unique on that order
- `created_at`, `updated_at`
- `created_by` optional user

Tests can be added while the order is `ordered` or `sample_collected`. The chosen test cannot change. Rows cannot be deleted.

## LabResult

Append-only value for one order item. The measured value is not edited in place.

- `id` UUID
- `order_item` required
- `clinic`, `branch`, `patient`, `doctor` copied from the item
- `value`
- `unit`, `reference_low`, `reference_high`, `reference_text` copied from the test master at entry
- `interpretation` `low`, `high`, `normal`, or blank when the value is not numeric or the master has no numeric bound
- `status` `active` or `corrected`
- `supersedes` optional earlier result for the same item
- `recorded_at`, `recorded_by`
- `verified_at`, `verified_by` set once by the verify action
- `created_at`, `updated_at`

A first result is accepted only while the order is `processing`. A correction is a new row. The earlier row stays unchanged and becomes `corrected`. The new row starts unverified and becomes the active result. Verification is accepted only for the active result while the order is still `processing`. A verified value still cannot be edited. Rows cannot be deleted.

## Not modeled yet

Invoice, payment, notification, sync receipt, and change log.

Organization records are not hard-deleted. Deactivate them with `is_active` where that field exists. Patients are deactivated the same way. Allergy and medical history rows are corrected, not deleted. Appointments and queue entries are cancelled through their status machines, not deleted. Encounter facts are corrected, not overwritten or deleted. The stock ledger is append-only, and the on-hand quantity is a cached balance updated only with a ledger row. Expired stock is excluded from available quantity. Prescriptions and prescription items are not hard-deleted. Lab orders, items, and results are not hard-deleted.
