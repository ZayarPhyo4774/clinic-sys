import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.accounts.models import User
from apps.appointments.tests.test_scheduling import (
    auth,
    book,
    cover,
    grant,
    make_doctor,
    make_patient,
    upcoming_slots,
)
from apps.audit.models import AuditEvent
from apps.clinics.models import Branch
from apps.encounters.tests.test_encounters import begin_consultation, start
from apps.pharmacy.models import MedicineBatch, StockTransaction
from apps.prescriptions.models import Prescription, PrescriptionItem
from testing import PASSWORD

VISIT = (
    "appointments.view",
    "appointments.create",
    "appointments.update",
    "appointments.cancel",
    "encounters.view",
    "encounters.create",
    "encounters.update",
)
PHARMACY = VISIT + ("pharmacy.view", "pharmacy.manage", "prescriptions.view", "prescriptions.create")


@pytest.fixture
def counter(api_client, clinic, branch, user):
    grant(user, *PHARMACY)
    auth(api_client, user)
    return SimpleNamespace(api=api_client, clinic=clinic, branch=branch, user=user, other_branch=None)


def _today():
    return timezone.now().date()


def _medicine(api, code="amox", name="Amoxicillin Secret", reorder=0, category=None):
    if category is None:
        created = api.post(
            "/api/v1/medicine-categories/",
            {"name": "Antibiotics", "code": f"cat-{code}"},
            format="json",
        )
        assert created.status_code == 201, created.data
        category = created.data["id"]
    medicine = api.post(
        "/api/v1/medicines/",
        {
            "category": str(category),
            "name": name,
            "code": code,
            "form": "tablet",
            "strength": "500mg",
            "unit": "tablet",
            "reorder_level": reorder,
        },
        format="json",
    )
    assert medicine.status_code == 201, medicine.data
    return medicine.data


def _batch(api, branch, medicine_id, number="B-1", quantity=5, days=400, supplier=None):
    payload = {
        "branch": str(branch.id),
        "medicine": str(medicine_id),
        "batch_number": number,
        "expiry_date": (_today() + timedelta(days=days)).isoformat(),
        "initial_quantity": quantity,
    }
    if supplier is not None:
        payload["supplier"] = str(supplier)
    created = api.post("/api/v1/medicine-batches/", payload, format="json")
    assert created.status_code == 201, created.data
    return created.data


def _open_encounter(api, branch, clinic):
    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    patient = make_patient(branch, number=f"{uuid.uuid4().int % 900000 + 100000}", name="Lina Chart")
    slot = upcoming_slots(clinic, count=1)[0]
    appointment_id = begin_consultation(api, branch, patient, doctor, slot)
    opened = start(api, appointment_id)
    assert opened.status_code == 201, opened.data
    return opened.data["id"], patient, doctor, appointment_id


def _prescribe(api, encounter_id, medicine_id, quantity=4, dosage="ZebraDose 9"):
    created = api.post("/api/v1/prescriptions/", {"encounter": str(encounter_id)}, format="json")
    assert created.status_code == 201, created.data
    item = api.post(
        f"/api/v1/prescriptions/{created.data['id']}/items/",
        {"medicine": str(medicine_id), "quantity": quantity, "dosage": dosage, "frequency": "daily"},
        format="json",
    )
    assert item.status_code == 201, item.data
    return created.data, item.data


@pytest.mark.django_db
def test_catalog_stock_in_and_adjustment_are_atomic(counter):
    api = counter.api
    category = api.post("/api/v1/medicine-categories/", {"name": "Antibiotics", "code": "abx"}, format="json")
    assert category.status_code == 201, category.data
    duplicate = api.post("/api/v1/medicine-categories/", {"name": "Again", "code": "ABX"}, format="json")
    assert duplicate.status_code == 400

    supplier = api.post("/api/v1/suppliers/", {"name": "North Supply", "code": "north-supply"}, format="json")
    assert supplier.status_code == 201, supplier.data
    medicine = _medicine(api, category=category.data["id"])
    assert medicine["available_quantity"] == 0
    assert str(medicine["category"]) == str(category.data["id"])

    batch = _batch(api, counter.branch, medicine["id"], supplier=supplier.data["id"])
    assert batch["quantity_on_hand"] == 5
    listed = api.get("/api/v1/stock-transactions/", {"batch": batch["id"]})
    assert listed.status_code == 200
    assert listed.data["count"] == 1
    assert listed.data["results"][0]["kind"] == "stock_in"
    assert listed.data["results"][0]["quantity"] == 5
    assert listed.data["results"][0]["medicine_name"] == medicine["name"]
    assert listed.data["results"][0]["medicine_name"] != medicine["code"]

    received = api.post(
        "/api/v1/stock-transactions/",
        {"batch": batch["id"], "kind": "stock_in", "quantity": 3},
        format="json",
    )
    assert received.status_code == 201, received.data
    assert received.data["quantity_on_hand"] == 8
    assert received.data["direction"] == "in"

    adjusted = api.post(
        "/api/v1/stock-transactions/",
        {"batch": batch["id"], "kind": "adjustment", "direction": "out", "quantity": 2, "reason": "damaged"},
        format="json",
    )
    assert adjusted.status_code == 201, adjusted.data
    assert adjusted.data["quantity_on_hand"] == 6

    before = StockTransaction.objects.count()
    refused = api.post(
        "/api/v1/stock-transactions/",
        {"batch": batch["id"], "kind": "adjustment", "direction": "out", "quantity": 50, "reason": "damaged"},
        format="json",
    )
    assert refused.status_code == 400
    assert "Not enough stock." in str(refused.data)
    assert StockTransaction.objects.count() == before
    assert MedicineBatch.objects.get(pk=batch["id"]).quantity_on_hand == 6

    missing_reason = api.post(
        "/api/v1/stock-transactions/",
        {"batch": batch["id"], "kind": "adjustment", "direction": "out", "quantity": 1},
        format="json",
    )
    assert missing_reason.status_code == 400
    direct = api.post(
        "/api/v1/stock-transactions/",
        {"batch": batch["id"], "kind": "dispense", "quantity": 1},
        format="json",
    )
    assert direct.status_code == 400
    assert MedicineBatch.objects.get(pk=batch["id"]).quantity_on_hand == 6

    stored = MedicineBatch.objects.get(pk=batch["id"])
    stored.quantity_on_hand = 99
    with pytest.raises(ValidationError):
        stored.save()
    with pytest.raises(ValidationError):
        MedicineBatch.objects.filter(pk=batch["id"]).update(quantity_on_hand=1)
    with pytest.raises(ValidationError):
        StockTransaction.objects.all().delete()
    assert MedicineBatch.objects.get(pk=batch["id"]).quantity_on_hand == 6


@pytest.mark.django_db
def test_expiry_tracking_and_low_stock(counter, other_branch):
    api = counter.api
    medicine = _medicine(api, code="para", name="Paracetamol Plain", reorder=10)
    batch = _batch(api, counter.branch, medicine["id"], number="SOON", quantity=5, days=5)
    later = _batch(api, counter.branch, medicine["id"], number="LATER", quantity=1, days=40)
    south = _batch(api, other_branch, medicine["id"], number="SOUTH-1", quantity=7, days=40)
    today = _today()

    soon = api.get("/api/v1/medicine-batches/", {"expiring_before": (today + timedelta(days=5)).isoformat()})
    assert soon.status_code == 200
    soon_ids = {row["id"] for row in soon.data["results"]}
    assert batch["id"] in soon_ids
    assert later["id"] not in soon_ids

    fresh = api.get("/api/v1/medicine-batches/", {"expired": "false"})
    assert batch["id"] in {row["id"] for row in fresh.data["results"]}
    past = api.post(
        "/api/v1/medicine-batches/",
        {
            "branch": str(counter.branch.id),
            "medicine": str(medicine["id"]),
            "batch_number": "OLD",
            "expiry_date": (today - timedelta(days=1)).isoformat(),
            "initial_quantity": 1,
        },
        format="json",
    )
    assert past.status_code == 400

    MedicineBatch.objects.filter(pk=batch["id"]).update(expiry_date=today - timedelta(days=1))
    expired = api.get("/api/v1/medicine-batches/", {"expired": "true"})
    assert batch["id"] in {row["id"] for row in expired.data["results"]}
    assert later["id"] not in {row["id"] for row in expired.data["results"]}

    low = api.get("/api/v1/medicines/", {"low_stock": "true"})
    assert medicine["id"] in {row["id"] for row in low.data["results"]}
    detail = api.get(f"/api/v1/medicines/{medicine['id']}/")
    assert detail.data["available_quantity"] == 8

    south_view = api.get(f"/api/v1/medicines/{medicine['id']}/", HTTP_X_BRANCH_ID=str(other_branch.id))
    assert south_view.data["available_quantity"] == 7
    north_view = api.get(f"/api/v1/medicines/{medicine['id']}/", HTTP_X_BRANCH_ID=str(counter.branch.id))
    assert north_view.data["available_quantity"] == 1

    topped = api.post(
        "/api/v1/stock-transactions/",
        {"batch": later["id"], "kind": "stock_in", "quantity": 20},
        format="json",
    )
    assert topped.status_code == 201, topped.data
    stocked = api.get("/api/v1/medicines/", {"low_stock": "true"})
    assert medicine["id"] not in {row["id"] for row in stocked.data["results"]}
    still = api.get("/api/v1/medicines/", {"low_stock": "false"})
    assert medicine["id"] in {row["id"] for row in still.data["results"]}

    inactive = api.patch(f"/api/v1/medicines/{medicine['id']}/", {"is_active": False}, format="json")
    assert inactive.status_code == 200
    blocked = api.post(
        "/api/v1/stock-transactions/",
        {"batch": later["id"], "kind": "stock_in", "quantity": 1},
        format="json",
    )
    assert blocked.status_code == 400
    assert "Medicine is not active." in str(blocked.data)
    assert MedicineBatch.objects.get(pk=later["id"]).quantity_on_hand == 21

    api.patch(f"/api/v1/medicines/{medicine['id']}/", {"is_active": True}, format="json")
    api.patch(f"/api/v1/medicine-batches/{later['id']}/", {"is_active": False}, format="json")
    blocked_batch = api.post(
        "/api/v1/stock-transactions/",
        {"batch": later["id"], "kind": "stock_in", "quantity": 1},
        format="json",
    )
    assert blocked_batch.status_code == 400
    written_off = api.post(
        "/api/v1/stock-transactions/",
        {"batch": later["id"], "kind": "adjustment", "direction": "out", "quantity": 1, "reason": "expired"},
        format="json",
    )
    assert written_off.status_code == 201, written_off.data
    assert written_off.data["quantity_on_hand"] == 20
    assert south["batch_number"] == "SOUTH-1"


@pytest.mark.django_db
def test_dispensing_deducts_stock_and_stops_at_the_limits(counter):
    api = counter.api
    medicine = _medicine(api, reorder=0)
    batch = _batch(api, counter.branch, medicine["id"], quantity=5)
    encounter_id, patient, _doctor, appointment_id = _open_encounter(api, counter.branch, counter.clinic)

    too_early = api.post("/api/v1/prescriptions/", {"encounter": str(appointment_id)}, format="json")
    assert too_early.status_code == 400

    prescription, item = _prescribe(api, encounter_id, medicine["id"], quantity=4)
    assert prescription["status"] == "active"
    assert str(prescription["patient"]) == str(patient.id)
    assert str(prescription["branch"]) == str(counter.branch.id)
    assert item["quantity_dispensed"] == 0

    searched = api.get("/api/v1/prescriptions/", {"search": "ZebraDose"})
    assert searched.data["count"] == 0
    by_number = api.get("/api/v1/prescriptions/", {"search": patient.patient_number})
    assert by_number.data["count"] == 1
    assert "ZebraDose" not in str(by_number.data)

    over_script = api.post(
        f"/api/v1/prescriptions/{prescription['id']}/items/{item['id']}/dispense/",
        {"batch": batch["id"], "quantity": 5},
        format="json",
    )
    assert over_script.status_code == 400
    assert "remaining prescription" in str(over_script.data)
    assert MedicineBatch.objects.get(pk=batch["id"]).quantity_on_hand == 5
    assert PrescriptionItem.objects.get(pk=item["id"]).quantity_dispensed == 0
    assert StockTransaction.objects.filter(kind=StockTransaction.Kind.DISPENSE).count() == 0

    api.patch(f"/api/v1/medicine-batches/{batch['id']}/", {"is_active": False}, format="json")
    inactive_batch = api.post(
        f"/api/v1/prescriptions/{prescription['id']}/items/{item['id']}/dispense/",
        {"batch": batch["id"], "quantity": 1},
        format="json",
    )
    assert inactive_batch.status_code == 400
    assert "Batch is not active." in str(inactive_batch.data)
    api.patch(f"/api/v1/medicine-batches/{batch['id']}/", {"is_active": True}, format="json")
    api.patch(f"/api/v1/medicines/{medicine['id']}/", {"is_active": False}, format="json")
    inactive_medicine = api.post(
        f"/api/v1/prescriptions/{prescription['id']}/items/{item['id']}/dispense/",
        {"batch": batch["id"], "quantity": 1},
        format="json",
    )
    assert inactive_medicine.status_code == 400
    assert "Medicine is not active." in str(inactive_medicine.data)
    api.patch(f"/api/v1/medicines/{medicine['id']}/", {"is_active": True}, format="json")
    assert MedicineBatch.objects.get(pk=batch["id"]).quantity_on_hand == 5

    partial = api.post(
        f"/api/v1/prescriptions/{prescription['id']}/items/{item['id']}/dispense/",
        {"batch": batch["id"], "quantity": 1},
        format="json",
    )
    assert partial.status_code == 200, partial.data
    assert partial.data["quantity_dispensed"] == 1
    assert partial.data["quantity_on_hand"] == 4
    assert partial.data["prescription_status"] == "partially_dispensed"
    ledger = StockTransaction.objects.get(pk=partial.data["transaction_id"])
    assert str(ledger.prescription_item_id) == str(item["id"])
    assert ledger.kind == StockTransaction.Kind.DISPENSE

    cancel = api.post(f"/api/v1/prescriptions/{prescription['id']}/cancel/")
    assert cancel.status_code == 400
    assert Prescription.objects.get(pk=prescription["id"]).status == "partially_dispensed"

    finished = api.post(
        f"/api/v1/prescriptions/{prescription['id']}/items/{item['id']}/dispense/",
        {"batch": batch["id"], "quantity": 3},
        format="json",
    )
    assert finished.status_code == 200, finished.data
    assert finished.data["quantity_on_hand"] == 1
    assert finished.data["prescription_status"] == "dispensed"

    extra_item = api.post(
        f"/api/v1/prescriptions/{prescription['id']}/items/",
        {"medicine": str(medicine["id"]), "quantity": 2, "dosage": "ZebraDose 9"},
        format="json",
    )
    assert extra_item.status_code == 400

    second, second_item = _prescribe(api, encounter_id, medicine["id"], quantity=2)
    before = StockTransaction.objects.count()
    too_many = api.post(
        f"/api/v1/prescriptions/{second['id']}/items/{second_item['id']}/dispense/",
        {"batch": batch["id"], "quantity": 2},
        format="json",
    )
    assert too_many.status_code == 400
    assert "Not enough stock." in str(too_many.data)
    assert MedicineBatch.objects.get(pk=batch["id"]).quantity_on_hand == 1
    assert PrescriptionItem.objects.get(pk=second_item["id"]).quantity_dispensed == 0
    assert StockTransaction.objects.count() == before
    assert Prescription.objects.get(pk=second["id"]).status == "active"

    covered = api.get("/api/v1/medicines/", {"low_stock": "true"})
    assert medicine["id"] not in {row["id"] for row in covered.data["results"]}
    MedicineBatch.objects.filter(pk=batch["id"]).update(expiry_date=_today() - timedelta(days=1))
    third, third_item = _prescribe(api, encounter_id, medicine["id"], quantity=1)
    expired = api.post(
        f"/api/v1/prescriptions/{third['id']}/items/{third_item['id']}/dispense/",
        {"batch": batch["id"], "quantity": 1},
        format="json",
    )
    assert expired.status_code == 400
    assert "expired" in str(expired.data)
    assert MedicineBatch.objects.get(pk=batch["id"]).quantity_on_hand == 1
    low = api.get("/api/v1/medicines/", {"low_stock": "true"})
    assert medicine["id"] in {row["id"] for row in low.data["results"]}

    completed = api.post(f"/api/v1/encounters/{encounter_id}/complete/")
    assert completed.status_code == 200, completed.data
    after_complete = api.post("/api/v1/prescriptions/", {"encounter": str(encounter_id)}, format="json")
    assert after_complete.status_code == 400

    stored = PrescriptionItem.objects.get(pk=item["id"])
    stored.dosage = "changed"
    with pytest.raises(ValidationError):
        stored.save()
    with pytest.raises(ValidationError):
        PrescriptionItem.objects.all().delete()
    with pytest.raises(ValidationError):
        Prescription.objects.all().delete()

    events = AuditEvent.objects.filter(action__startswith="pharmacy.") | AuditEvent.objects.filter(
        action__startswith="prescriptions."
    )
    blob = " ".join(str(row.metadata) for row in events)
    assert "Amoxicillin" not in blob
    assert "ZebraDose" not in blob
    assert events.exists()
    assert all(set(row.metadata) == {"result"} for row in events)


@pytest.mark.django_db
def test_pharmacy_permissions_and_clinic_branch_isolation(api_client, clinic, other_clinic, branch, other_branch, user):
    grant(user, *PHARMACY)
    auth(api_client, user)
    medicine = _medicine(api_client, name="Amoxicillin Secret")
    batch = _batch(api_client, branch, medicine["id"], number="NORTH-1", quantity=10)
    _batch(api_client, other_branch, medicine["id"], number="SOUTH-1", quantity=4)
    encounter_id, _patient, _doctor, _appointment = _open_encounter(api_client, branch, clinic)
    prescription, item = _prescribe(api_client, encounter_id, medicine["id"], quantity=4)

    viewer = User.objects.create_user(
        email="viewer@example.com", password=PASSWORD, full_name="Vera View", clinic=clinic
    )
    grant(viewer, "pharmacy.view", "prescriptions.view", branch=branch)
    view_api = auth(api_client, viewer)
    assert view_api.get("/api/v1/medicines/").status_code == 403
    north = view_api.get("/api/v1/medicine-batches/", HTTP_X_BRANCH_ID=str(branch.id))
    assert north.status_code == 200
    numbers = {row["batch_number"] for row in north.data["results"]}
    assert numbers == {"NORTH-1"}
    assert view_api.get("/api/v1/medicine-batches/", HTTP_X_BRANCH_ID=str(other_branch.id)).status_code == 403
    assert view_api.post("/api/v1/medicines/", {"name": "Nope"}, format="json").status_code == 403
    denied = view_api.post(
        f"/api/v1/prescriptions/{prescription['id']}/items/{item['id']}/dispense/",
        {"batch": batch["id"], "quantity": 1},
        HTTP_X_BRANCH_ID=str(branch.id),
        format="json",
    )
    assert denied.status_code == 403

    manager = User.objects.create_user(
        email="manager@example.com", password=PASSWORD, full_name="Mina Manage", clinic=clinic
    )
    grant(manager, "pharmacy.manage")
    manage_api = auth(api_client, manager)
    assert manage_api.get("/api/v1/medicines/").status_code == 403
    assert manage_api.get("/api/v1/prescriptions/").status_code == 403
    received = manage_api.post(
        "/api/v1/stock-transactions/",
        {"batch": batch["id"], "kind": "stock_in", "quantity": 2},
        format="json",
    )
    assert received.status_code == 201, received.data
    dispensed = manage_api.post(
        f"/api/v1/prescriptions/{prescription['id']}/items/{item['id']}/dispense/",
        {"batch": batch["id"], "quantity": 1},
        format="json",
    )
    assert dispensed.status_code == 200, dispensed.data
    assert Prescription.objects.get(pk=prescription["id"]).status == "partially_dispensed"

    reader = User.objects.create_user(
        email="reader@example.com", password=PASSWORD, full_name="Rae Read", clinic=clinic
    )
    grant(reader, "prescriptions.view")
    read_api = auth(api_client, reader)
    assert read_api.get("/api/v1/prescriptions/").status_code == 200
    assert read_api.post("/api/v1/prescriptions/", {"encounter": str(encounter_id)}, format="json").status_code == 403
    assert read_api.post(f"/api/v1/prescriptions/{prescription['id']}/cancel/").status_code == 403
    assert (
        read_api.post(
            f"/api/v1/prescriptions/{prescription['id']}/items/{item['id']}/dispense/",
            {"batch": batch["id"], "quantity": 1},
            format="json",
        ).status_code
        == 403
    )

    writer = User.objects.create_user(
        email="writer@example.com", password=PASSWORD, full_name="Wes Write", clinic=clinic
    )
    grant(writer, "prescriptions.create")
    write_api = auth(api_client, writer)
    assert write_api.get("/api/v1/prescriptions/").status_code == 403
    created = write_api.post("/api/v1/prescriptions/", {"encounter": str(encounter_id)}, format="json")
    assert created.status_code == 201, created.data
    added = write_api.post(
        f"/api/v1/prescriptions/{created.data['id']}/items/",
        {"medicine": str(medicine["id"]), "quantity": 1, "dosage": "ZebraDose 9"},
        format="json",
    )
    assert added.status_code == 201, added.data
    assert (
        write_api.post(
            f"/api/v1/prescriptions/{created.data['id']}/items/{added.data['id']}/dispense/",
            {"batch": batch["id"], "quantity": 1},
            format="json",
        ).status_code
        == 403
    )
    cancelled = write_api.post(f"/api/v1/prescriptions/{created.data['id']}/cancel/")
    assert cancelled.status_code == 200, cancelled.data
    assert cancelled.data["status"] == "cancelled"

    still = auth(api_client, user).post(f"/api/v1/prescriptions/{prescription['id']}/cancel/")
    assert still.status_code == 400
    assert Prescription.objects.get(pk=prescription["id"]).status == "partially_dispensed"

    foreign_branch = Branch.objects.create(clinic=other_clinic, name="East", code="east")
    foreign = User.objects.create_user(
        email="foreign@example.com", password=PASSWORD, full_name="Faye Foreign", clinic=other_clinic
    )
    grant(foreign, *PHARMACY)
    foreign_api = auth(api_client, foreign)
    assert foreign_api.get("/api/v1/medicines/").data["count"] == 0
    hidden = foreign_api.get(f"/api/v1/medicines/{medicine['id']}/")
    assert hidden.status_code == 404
    assert "Amoxicillin" not in str(hidden.data)
    hidden_rx = foreign_api.get(f"/api/v1/prescriptions/{prescription['id']}/")
    assert hidden_rx.status_code == 404
    assert "ZebraDose" not in str(hidden_rx.data)
    assert "Lina" not in str(hidden_rx.data)
    assert foreign_branch.code == "east"

    anonymous = type(api_client)()
    assert anonymous.get("/api/v1/medicines/").status_code == 401
    assert anonymous.get("/api/v1/prescriptions/").status_code == 401
