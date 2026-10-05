"""Permission codes the operator portal can install.

These match the codes enforced by the API. Creating the rows lets a superuser
see the clinic menu, and lets a role grant the same codes to staff.
"""

MODULE_PERMISSIONS = (
    ("clinics.view", "Read clinics"),
    ("clinics.manage", "Update the clinic"),
    ("branches.view", "Read branches"),
    ("branches.manage", "Update branches"),
    ("departments.view", "Read departments"),
    ("departments.manage", "Update departments"),
    ("staff.view", "Read staff"),
    ("staff.manage", "Update staff"),
    ("patients.view", "Read patients"),
    ("patients.create", "Register patients"),
    ("patients.update", "Update patients"),
    ("patients.delete", "Deactivate patients"),
    ("appointments.view", "Read appointments and the queue"),
    ("appointments.create", "Book appointments"),
    ("appointments.update", "Check in, queue, and update visits"),
    ("appointments.cancel", "Cancel appointments"),
    ("encounters.view", "Read consultations"),
    ("encounters.create", "Record consultation facts"),
    ("encounters.update", "Complete a consultation"),
    ("vitals.record", "Record vital signs during triage"),
    ("triage.start", "Start triage for a queued patient"),
    ("prescriptions.view", "Read prescriptions"),
    ("prescriptions.create", "Write prescriptions"),
    ("pharmacy.view", "Read the pharmacy"),
    ("pharmacy.manage", "Manage stock and dispense"),
    ("laboratory.view", "Read laboratory orders"),
    ("laboratory.manage", "Manage laboratory orders"),
    ("billing.view", "Read invoices"),
    ("billing.create", "Create and issue invoices"),
    ("billing.payment", "Record payments"),
    ("reports.view", "Open reports"),
    ("users.manage", "Open the users screen"),
    ("roles.manage", "Open the roles screen"),
    ("audit.view", "Open audit logs"),
    ("notifications.view", "Open notifications"),
)
