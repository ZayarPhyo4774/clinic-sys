import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.appointments.tests.test_scheduling import auth, cover, grant, make_doctor, upcoming_slots
from apps.audit.models import AuditEvent
from apps.billing.models import Invoice, Payment
from apps.encounters.models import Encounter, VitalSign
from apps.encounters.tests.test_encounters import start
from apps.pharmacy.models import MedicineBatch
from apps.pharmacy.tests.test_pharmacy import _batch, _medicine, _prescribe
from apps.synchronization.models import SyncOperation

VISIT = (
    "patients.view",
    "patients.create",
    "appointments.view",
    "appointments.create",
    "appointments.update",
    "encounters.view",
    "encounters.create",
    "prescriptions.view",
    "prescriptions.create",
    "pharmacy.view",
    "pharmacy.manage",
    "billing.view",
    "billing.create",
    "billing.payment",
)


def walk_visit(api, clinic, branch, user, *, pay=True, interrupt_sync=False):
    grant(user, *VISIT)
    auth(api, user)
    header = {"HTTP_X_BRANCH_ID": str(branch.id)}

    registered = api.post(
        "/api/v1/patients/",
        {"full_name": "Lina Chart", "date_of_birth": "1990-04-12", "sex": "female"},
        format="json",
        **header,
    )
    assert registered.status_code == 201, registered.data
    assert registered.data["patient_number"]
    patient_id = registered.data["id"]

    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    slot = upcoming_slots(clinic, count=1)[0]
    cover(api, doctor, branch, [slot])
    booked = api.post(
        "/api/v1/appointments/",
        {
            "branch": str(branch.id),
            "patient": patient_id,
            "doctor": str(doctor.id),
            "starts_at": slot[0].isoformat(),
            "ends_at": slot[1].isoformat(),
            "visit_reason": "Sore throat",
        },
        format="json",
        **header,
    )
    assert booked.status_code == 201, booked.data
    appointment_id = booked.data["id"]

    checked = api.post(f"/api/v1/appointments/{appointment_id}/check-in/", **header)
    assert checked.status_code == 200, checked.data
    assert checked.data["status"] == "checked_in"

    queued = api.post(f"/api/v1/appointments/{appointment_id}/queue/", **header)
    assert queued.status_code == 201, queued.data
    entry_id = queued.data["id"]
    assert api.post(f"/api/v1/queue-entries/{entry_id}/call/", **header).status_code == 200
    started_queue = api.post(f"/api/v1/queue-entries/{entry_id}/start/", **header)
    assert started_queue.status_code == 200, started_queue.data

    opened = start(api, appointment_id)
    assert opened.status_code == 201, opened.data
    encounter_id = opened.data["id"]
    assert opened.data["status"] == "open"
    note = api.post(
        f"/api/v1/encounters/{encounter_id}/notes/",
        {"body": "Sore throat since yesterday."},
        format="json",
        **header,
    )
    assert note.status_code == 201, note.data

    if interrupt_sync:
        operation = {
            "operation_id": str(uuid.uuid4()),
            "device_id": "device-visit",
            "user_id": str(user.id),
            "clinic_id": str(clinic.id),
            "branch_id": str(branch.id),
            "entity_type": "encounters.VitalSign",
            "entity_id": None,
            "operation": "create",
            "payload": {"encounter": encounter_id, "temperature": "37.2", "pulse": 80},
            "created_at": (timezone.now() - timedelta(minutes=2)).isoformat(),
        }
        first = api.post("/api/v1/sync/push/", {"operations": [operation]}, format="json", **header)
        assert first.status_code == 200, first.data
        assert first.data["results"][0]["status"] == "synced"
        # The device never saw that acknowledgement and sends the same operation again.
        second = api.post("/api/v1/sync/push/", {"operations": [operation]}, format="json", **header)
        assert second.status_code == 200, second.data
        assert second.data["results"][0]["duplicate"] is True
        assert VitalSign.objects.filter(encounter_id=encounter_id).count() == 1
        assert SyncOperation.objects.filter(operation_id=operation["operation_id"]).count() == 1

    medicine = _medicine(api, code=f"amox{uuid.uuid4().hex[:4]}")
    batch = _batch(api, branch, medicine["id"], quantity=10)
    prescription, item = _prescribe(api, encounter_id, medicine["id"], quantity=2, dosage="One tablet")
    dispensed = api.post(
        f"/api/v1/prescriptions/{prescription['id']}/items/{item['id']}/dispense/",
        {"batch": batch["id"], "quantity": 2},
        format="json",
        **header,
    )
    assert dispensed.status_code == 200, dispensed.data
    assert dispensed.data["prescription_status"] == "dispensed"
    assert MedicineBatch.objects.get(pk=batch["id"]).quantity_on_hand == 8

    method = api.post(
        "/api/v1/payment-methods/",
        {"name": "Cash", "code": f"cash-{uuid.uuid4().hex[:6]}"},
        format="json",
        **header,
    )
    assert method.status_code == 201, method.data
    invoice = api.post("/api/v1/invoices/", {"encounter": encounter_id}, format="json", **header)
    assert invoice.status_code == 201, invoice.data
    assert invoice.data["status"] == "draft"
    assert invoice.data["invoice_number"]
    invoice_id = invoice.data["id"]

    consultation = api.post(
        f"/api/v1/invoices/{invoice_id}/items/",
        {"kind": "consultation", "quantity": 1, "unit_price": "25.00"},
        format="json",
        **header,
    )
    assert consultation.status_code == 201, consultation.data
    pharmacy = api.post(
        f"/api/v1/invoices/{invoice_id}/items/",
        {
            "kind": "pharmacy",
            "prescription_item": item["id"],
            "quantity": 2,
            "unit_price": "10.00",
        },
        format="json",
        **header,
    )
    assert pharmacy.status_code == 201, pharmacy.data

    issued = api.post(f"/api/v1/invoices/{invoice_id}/issue/", **header)
    assert issued.status_code == 200, issued.data
    assert issued.data["status"] == "issued"
    assert issued.data["total"] == "45.00"
    assert issued.data["balance"] == "45.00"

    payment = None
    if pay:
        payment = api.post(
            f"/api/v1/invoices/{invoice_id}/payments/",
            {"method": method.data["id"], "amount": "45.00"},
            format="json",
            **header,
        )
        assert payment.status_code == 201, payment.data
        assert payment.data["amount"] == "45.00"
        paid = api.get(f"/api/v1/invoices/{invoice_id}/", **header)
        assert paid.status_code == 200, paid.data
        assert paid.data["status"] == "paid"
        assert paid.data["balance"] == "0.00"
        assert Payment.objects.filter(invoice_id=invoice_id).count() == 1
        event = AuditEvent.objects.get(action="billing.payment_recorded", entity_id=payment.data["id"])
        assert event.metadata == {"result": "recorded"}

    assert Encounter.objects.get(pk=encounter_id).patient_id is not None
    assert Invoice.objects.get(pk=invoice_id).patient_id == Encounter.objects.get(pk=encounter_id).patient_id
    return {
        "patient_id": patient_id,
        "appointment_id": appointment_id,
        "encounter_id": encounter_id,
        "invoice_id": invoice_id,
        "method_id": method.data["id"],
        "payment_id": None if payment is None else payment.data["id"],
    }


@pytest.mark.django_db
def test_visit_runs_from_registration_through_payment(api_client, clinic, branch, user):
    visit = walk_visit(api_client, clinic, branch, user)
    assert visit["payment_id"]
    assert Invoice.objects.get(pk=visit["invoice_id"]).status == "paid"


@pytest.mark.django_db
def test_same_visit_survives_a_lost_sync_acknowledgement(api_client, clinic, branch, user):
    visit = walk_visit(api_client, clinic, branch, user, interrupt_sync=True)
    assert visit["payment_id"]
    assert VitalSign.objects.filter(encounter_id=visit["encounter_id"]).count() == 1
    assert Invoice.objects.get(pk=visit["invoice_id"]).status == "paid"
