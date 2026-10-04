import uuid
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.tests.test_scheduling import auth, grant, make_doctor, make_patient, upcoming_slots
from apps.audit.models import AuditEvent
from apps.clinics.models import Branch
from apps.encounters.tests.test_encounters import begin_consultation, start
from apps.laboratory.models import LabOrder, LabOrderItem, LabResult, LabTest
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
LAB = VISIT + ("laboratory.view", "laboratory.manage")


def _open_encounter(api, branch, clinic, number):
    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    patient = make_patient(branch, number=number, name="Lina Chart")
    slot = upcoming_slots(clinic, count=1)[0]
    appointment_id = begin_consultation(api, branch, patient, doctor, slot)
    opened = start(api, appointment_id)
    assert opened.status_code == 201, opened.data
    return opened.data["id"], patient, appointment_id


def _test(api, code, name, low, high):
    created = api.post(
        "/api/v1/lab-tests/",
        {
            "name": name,
            "code": code,
            "specimen": "blood",
            "unit": "10^9/L",
            "reference_low": low,
            "reference_high": high,
            "reference_text": "Adult range",
        },
        format="json",
    )
    assert created.status_code == 201, created.data
    return created.data


@pytest.mark.django_db
def test_lab_results_keep_their_range_until_verified_and_reported(api_client, clinic, branch, user):
    grant(user, *LAB)
    auth(api_client, user)
    api = api_client
    leukocytes = _test(api, "wbc", "Leukocytes Private", "4.0", "11.0")
    duplicate = api.post(
        "/api/v1/lab-tests/",
        {"name": "Again", "code": "WBC", "specimen": "blood"},
        format="json",
    )
    assert duplicate.status_code == 400
    backwards = api.post(
        "/api/v1/lab-tests/",
        {"name": "Backwards", "code": "rev", "specimen": "blood", "reference_low": "12", "reference_high": "4"},
        format="json",
    )
    assert backwards.status_code == 400
    renamed = api.patch(f"/api/v1/lab-tests/{leukocytes['id']}/", {"code": "changed"}, format="json")
    assert renamed.status_code == 200
    assert renamed.data["code"] == "wbc"
    stored_test = LabTest.objects.get(pk=leukocytes["id"])
    stored_test.code = "changed"
    with pytest.raises(ValidationError):
        stored_test.save()

    glucose = _test(api, "glu", "Glucose Private", "70.0", "99.0")
    inactive = _test(api, "crp", "Marker Private", "0.0", "5.0")
    assert api.patch(f"/api/v1/lab-tests/{inactive['id']}/", {"is_active": False}, format="json").status_code == 200

    encounter_id, patient, appointment_id = _open_encounter(api, branch, clinic, "100001")
    too_early = api.post("/api/v1/lab-orders/", {"encounter": str(appointment_id)}, format="json")
    assert too_early.status_code == 400
    order = api.post("/api/v1/lab-orders/", {"encounter": str(encounter_id)}, format="json")
    assert order.status_code == 201, order.data
    assert order.data["status"] == "ordered"
    assert str(order.data["patient"]) == str(patient.id)
    assert str(order.data["branch"]) == str(branch.id)
    order_id = order.data["id"]

    empty = api.post(f"/api/v1/lab-orders/{order_id}/collect/")
    assert empty.status_code == 400
    assert LabOrder.objects.get(pk=order_id).status == "ordered"

    white = api.post(
        f"/api/v1/lab-orders/{order_id}/items/",
        {"lab_test": leukocytes["id"]},
        format="json",
    )
    assert white.status_code == 201, white.data
    sugar = api.post(f"/api/v1/lab-orders/{order_id}/items/", {"lab_test": glucose["id"]}, format="json")
    assert sugar.status_code == 201, sugar.data
    assert api.post(f"/api/v1/lab-orders/{order_id}/items/", {"lab_test": leukocytes["id"]}, format="json").status_code == 400
    assert api.post(f"/api/v1/lab-orders/{order_id}/items/", {"lab_test": inactive["id"]}, format="json").status_code == 400

    skipped = api.post(f"/api/v1/lab-orders/{order_id}/process/")
    assert skipped.status_code == 400
    assert LabOrder.objects.get(pk=order_id).status == "ordered"
    collected = api.post(f"/api/v1/lab-orders/{order_id}/collect/")
    assert collected.status_code == 200, collected.data
    assert collected.data["status"] == "sample_collected"
    early = api.post(
        f"/api/v1/lab-orders/{order_id}/items/{white.data['id']}/results/",
        {"value": "3.25"},
        format="json",
    )
    assert early.status_code == 400
    processing = api.post(f"/api/v1/lab-orders/{order_id}/process/")
    assert processing.status_code == 200, processing.data
    assert processing.data["status"] == "processing"

    low = api.post(
        f"/api/v1/lab-orders/{order_id}/items/{white.data['id']}/results/",
        {"value": "3.25"},
        format="json",
    )
    assert low.status_code == 201, low.data
    assert low.data["interpretation"] == "low"
    assert low.data["unit"] == "10^9/L"
    assert low.data["reference_text"] == "Adult range"
    assert Decimal(low.data["reference_low"]) == Decimal("4.000")
    assert Decimal(low.data["reference_high"]) == Decimal("11.000")
    assert low.data["status"] == "active"
    assert low.data["verified_at"] is None

    assert api.patch(f"/api/v1/lab-tests/{leukocytes['id']}/", {"reference_high": "20.0"}, format="json").status_code == 200
    assert LabResult.objects.get(pk=low.data["id"]).reference_high == Decimal("11.000")

    assert api.post(f"/api/v1/lab-orders/{order_id}/complete/").status_code == 400
    assert api.post(f"/api/v1/lab-orders/{order_id}/report/").status_code == 400
    verified = api.post(f"/api/v1/lab-orders/{order_id}/items/{white.data['id']}/results/{low.data['id']}/verify/")
    assert verified.status_code == 200, verified.data
    assert str(verified.data["verified_by"]) == str(user.id)
    assert api.post(f"/api/v1/lab-orders/{order_id}/items/{white.data['id']}/results/{low.data['id']}/verify/").status_code == 400
    assert api.post(f"/api/v1/lab-orders/{order_id}/complete/").status_code == 400
    assert LabOrder.objects.get(pk=order_id).status == "processing"

    high = api.post(
        f"/api/v1/lab-orders/{order_id}/items/{sugar.data['id']}/results/",
        {"value": "140.5"},
        format="json",
    )
    assert high.status_code == 201, high.data
    assert high.data["interpretation"] == "high"

    corrected = api.post(
        f"/api/v1/lab-orders/{order_id}/items/{white.data['id']}/results/",
        {"value": "7.0", "supersedes": low.data["id"]},
        format="json",
    )
    assert corrected.status_code == 201, corrected.data
    assert corrected.data["interpretation"] == "normal"
    assert corrected.data["status"] == "active"
    original = LabResult.objects.get(pk=low.data["id"])
    assert original.value == "3.25"
    assert original.status == "corrected"
    assert original.interpretation == "low"
    changed = LabResult.objects.get(pk=original.pk)
    changed.value = "changed"
    with pytest.raises(ValidationError):
        changed.save()
    assert LabResult.objects.get(pk=original.pk).value == "3.25"

    assert api.post(f"/api/v1/lab-orders/{order_id}/complete/").status_code == 400
    assert api.post(
        f"/api/v1/lab-orders/{order_id}/items/{white.data['id']}/results/{corrected.data['id']}/verify/"
    ).status_code == 200
    assert api.post(
        f"/api/v1/lab-orders/{order_id}/items/{sugar.data['id']}/results/{high.data['id']}/verify/"
    ).status_code == 200
    completed = api.post(f"/api/v1/lab-orders/{order_id}/complete/")
    assert completed.status_code == 200, completed.data
    assert completed.data["status"] == "completed"
    assert api.post(
        f"/api/v1/lab-orders/{order_id}/items/{sugar.data['id']}/results/",
        {"value": "80"},
        format="json",
    ).status_code == 400

    report = api.post(f"/api/v1/lab-orders/{order_id}/report/")
    assert report.status_code == 200, report.data
    assert report.data["reported_at"]
    assert str(report.data["reported_by"]) == str(user.id)
    assert "140.5" not in str(report.data)
    again = api.post(f"/api/v1/lab-orders/{order_id}/report/")
    assert again.status_code == 400
    assert LabOrder.objects.get(pk=order_id).reported_at is not None
    assert api.post(f"/api/v1/lab-orders/{order_id}/cancel/").status_code == 400

    hidden = api.get("/api/v1/lab-orders/", {"search": "140.5"})
    assert hidden.data["count"] == 0
    found = api.get("/api/v1/lab-orders/", {"search": patient.patient_number})
    assert found.data["count"] >= 1
    assert "140.5" not in str(found.data)
    assert "Leukocytes" not in str(found.data)

    spare = api.post("/api/v1/lab-orders/", {"encounter": str(encounter_id)}, format="json")
    assert spare.status_code == 201, spare.data
    assert api.post(f"/api/v1/lab-orders/{spare.data['id']}/process/").status_code == 400
    spare_item = api.post(
        f"/api/v1/lab-orders/{spare.data['id']}/items/",
        {"lab_test": glucose["id"]},
        format="json",
    )
    assert spare_item.status_code == 201, spare_item.data
    cancelled = api.post(f"/api/v1/lab-orders/{spare.data['id']}/cancel/")
    assert cancelled.status_code == 200, cancelled.data
    assert cancelled.data["status"] == "cancelled"

    held = api.post("/api/v1/lab-orders/", {"encounter": str(encounter_id)}, format="json")
    held_item = api.post(f"/api/v1/lab-orders/{held.data['id']}/items/", {"lab_test": glucose["id"]}, format="json")
    assert api.post(f"/api/v1/lab-orders/{held.data['id']}/collect/").status_code == 200
    assert api.post(f"/api/v1/lab-orders/{held.data['id']}/process/").status_code == 200
    assert api.post(
        f"/api/v1/lab-orders/{held.data['id']}/items/{held_item.data['id']}/results/",
        {"value": "80"},
        format="json",
    ).status_code == 201
    refused = api.post(f"/api/v1/lab-orders/{held.data['id']}/cancel/")
    assert refused.status_code == 400
    assert LabOrder.objects.get(pk=held.data["id"]).status == "processing"

    assert api.post(f"/api/v1/encounters/{encounter_id}/complete/").status_code == 200
    assert api.post("/api/v1/lab-orders/", {"encounter": str(encounter_id)}, format="json").status_code == 400

    with pytest.raises(ValidationError):
        LabOrder.objects.all().delete()
    with pytest.raises(ValidationError):
        LabOrderItem.objects.all().delete()
    with pytest.raises(ValidationError):
        LabResult.objects.all().delete()

    events = AuditEvent.objects.filter(action__startswith="laboratory.")
    blob = " ".join(str(row.metadata) for row in events)
    assert "Leukocytes" not in blob
    assert "140.5" not in blob
    assert "3.25" not in blob
    assert events.filter(action="laboratory.result_recorded").exists()
    assert events.filter(action="laboratory.result_verified").exists()
    assert events.filter(action="laboratory.report_generated").exists()
    assert all(set(row.metadata) == {"result"} for row in events)


@pytest.mark.django_db
def test_laboratory_permissions_and_clinic_branch_isolation(api_client, clinic, other_clinic, branch, other_branch, user):
    grant(user, *LAB)
    auth(api_client, user)
    catalog = _test(api_client, "wbc", "Leukocytes Private", "4.0", "11.0")
    north_encounter, _patient, _appointment = _open_encounter(api_client, branch, clinic, "100001")
    south_encounter, _south_patient, _south_appointment = _open_encounter(api_client, other_branch, clinic, "100002")
    north = api_client.post("/api/v1/lab-orders/", {"encounter": north_encounter}, format="json")
    south = api_client.post("/api/v1/lab-orders/", {"encounter": south_encounter}, format="json")
    assert north.status_code == 201, north.data
    assert south.status_code == 201, south.data
    item = api_client.post(f"/api/v1/lab-orders/{north.data['id']}/items/", {"lab_test": catalog["id"]}, format="json")
    assert item.status_code == 201, item.data
    spare = api_client.post("/api/v1/lab-orders/", {"encounter": north_encounter}, format="json")
    spare_item = api_client.post(
        f"/api/v1/lab-orders/{spare.data['id']}/items/",
        {"lab_test": catalog["id"]},
        format="json",
    )
    assert spare_item.status_code == 201
    assert api_client.post(f"/api/v1/lab-orders/{north.data['id']}/collect/").status_code == 200
    assert api_client.post(f"/api/v1/lab-orders/{north.data['id']}/process/").status_code == 200

    viewer = User.objects.create_user(
        email="viewer@example.com", password=PASSWORD, full_name="Vera View", clinic=clinic
    )
    grant(viewer, "laboratory.view", branch=branch)
    view_api = auth(api_client, viewer)
    assert view_api.get("/api/v1/lab-orders/").status_code == 403
    assert view_api.get("/api/v1/lab-orders/", HTTP_X_BRANCH_ID=str(other_branch.id)).status_code == 403
    listed = view_api.get("/api/v1/lab-orders/", HTTP_X_BRANCH_ID=str(branch.id))
    assert listed.status_code == 200
    ids = {row["id"] for row in listed.data["results"]}
    assert north.data["id"] in ids
    assert south.data["id"] not in ids
    hidden_south = view_api.get(f"/api/v1/lab-orders/{south.data['id']}/", HTTP_X_BRANCH_ID=str(branch.id))
    assert hidden_south.status_code == 404
    assert "Leukocytes" not in str(hidden_south.data)
    tests = view_api.get("/api/v1/lab-tests/", HTTP_X_BRANCH_ID=str(branch.id))
    assert tests.status_code == 200
    assert catalog["id"] in {row["id"] for row in tests.data["results"]}
    assert view_api.post("/api/v1/lab-tests/", {"name": "Nope", "code": "nope"}, format="json").status_code == 403
    assert view_api.post(
        f"/api/v1/lab-orders/{north.data['id']}/items/{item.data['id']}/results/",
        {"value": "6.5"},
        HTTP_X_BRANCH_ID=str(branch.id),
        format="json",
    ).status_code == 403
    assert view_api.post(f"/api/v1/lab-orders/{spare.data['id']}/cancel/", HTTP_X_BRANCH_ID=str(branch.id)).status_code == 403

    manager = User.objects.create_user(
        email="manager@example.com", password=PASSWORD, full_name="Mina Manage", clinic=clinic
    )
    grant(manager, "laboratory.manage")
    manage_api = auth(api_client, manager)
    assert manage_api.get("/api/v1/lab-tests/").status_code == 403
    assert manage_api.get("/api/v1/lab-orders/").status_code == 403
    created = manage_api.post(
        "/api/v1/lab-tests/",
        {"name": "Managed Test", "code": "mgr", "specimen": "urine"},
        format="json",
    )
    assert created.status_code == 201, created.data
    entered = manage_api.post(
        f"/api/v1/lab-orders/{north.data['id']}/items/{item.data['id']}/results/",
        {"value": "6.50"},
        format="json",
    )
    assert entered.status_code == 201, entered.data
    assert entered.data["interpretation"] == "normal"
    verified = manage_api.post(
        f"/api/v1/lab-orders/{north.data['id']}/items/{item.data['id']}/results/{entered.data['id']}/verify/"
    )
    assert verified.status_code == 200, verified.data
    cancelled = manage_api.post(f"/api/v1/lab-orders/{spare.data['id']}/cancel/")
    assert cancelled.status_code == 200, cancelled.data
    assert cancelled.data["status"] == "cancelled"

    foreign_branch = Branch.objects.create(clinic=other_clinic, name="East", code="east")
    foreign = User.objects.create_user(
        email="foreign@example.com", password=PASSWORD, full_name="Faye Foreign", clinic=other_clinic
    )
    grant(foreign, *LAB)
    foreign_api = auth(api_client, foreign)
    assert foreign_api.get("/api/v1/lab-tests/").data["count"] == 0
    hidden_test = foreign_api.get(f"/api/v1/lab-tests/{catalog['id']}/")
    assert hidden_test.status_code == 404
    assert "Leukocytes" not in str(hidden_test.data)
    hidden_order = foreign_api.get(f"/api/v1/lab-orders/{north.data['id']}/")
    assert hidden_order.status_code == 404
    assert "Lina" not in str(hidden_order.data)
    hidden_result = foreign_api.get(
        f"/api/v1/lab-orders/{north.data['id']}/items/{item.data['id']}/results/{entered.data['id']}/"
    )
    assert hidden_result.status_code == 404
    assert "6.50" not in str(hidden_result.data)
    assert foreign_branch.code == "east"

    anonymous = APIClient()
    assert anonymous.get("/api/v1/lab-tests/").status_code == 401
    assert anonymous.get("/api/v1/lab-orders/").status_code == 401
