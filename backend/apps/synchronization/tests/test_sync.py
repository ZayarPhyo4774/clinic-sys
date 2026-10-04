import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.appointments.tests.test_scheduling import auth, grant, make_doctor, make_patient, upcoming_slots
from apps.audit.models import AuditEvent
from apps.encounters.models import ClinicalNote, VitalSign
from apps.encounters.tests.test_encounters import begin_consultation, start
from apps.synchronization.models import SyncOperation
from testing import PASSWORD


@pytest.fixture
def visit(api_client, clinic, branch, user):
    grant(
        user,
        "appointments.view",
        "appointments.create",
        "appointments.update",
        "appointments.cancel",
        "encounters.view",
        "encounters.create",
    )
    auth(api_client, user)
    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    patient = make_patient(branch, name="Lina Chart")
    slot = upcoming_slots(clinic, count=1)[0]
    appointment_id = begin_consultation(api_client, branch, patient, doctor, slot)
    opened = start(api_client, appointment_id)
    assert opened.status_code == 201, opened.data
    return {
        "api": api_client,
        "clinic": clinic,
        "branch": branch,
        "user": user,
        "encounter_id": opened.data["id"],
    }


def _operation(visit, *, device_id="device-a", operation="create", payload=None, operation_id=None, created_at=None):
    return {
        "operation_id": str(operation_id or uuid.uuid4()),
        "device_id": device_id,
        "user_id": str(visit["user"].id),
        "clinic_id": str(visit["clinic"].id),
        "branch_id": str(visit["branch"].id),
        "entity_type": "encounters.VitalSign",
        "entity_id": None,
        "operation": operation,
        "payload": payload
        if payload is not None
        else {"encounter": visit["encounter_id"], "temperature": "37.2", "pulse": 80},
        "created_at": (created_at or timezone.now()).isoformat(),
    }


def _push(api, visit, operations):
    return api.post(
        "/api/v1/sync/push/",
        {"operations": operations},
        format="json",
        HTTP_X_BRANCH_ID=str(visit["branch"].id),
    )


@pytest.mark.django_db
def test_successful_sync_acknowledges_one_vital(visit):
    operation = _operation(visit)
    response = _push(visit["api"], visit, [operation])
    assert response.status_code == 200, response.data
    result = response.data["results"][0]
    assert result["status"] == "synced"
    assert result["duplicate"] is False
    assert result["retry_count"] == 0
    assert result["last_error"] == ""
    assert result["acknowledged_at"]
    assert result["server_entity_id"]
    vital = VitalSign.objects.get(pk=result["server_entity_id"])
    assert vital.temperature == Decimal("37.2")
    assert VitalSign.objects.filter(encounter_id=visit["encounter_id"]).count() == 1

    audit = AuditEvent.objects.get(action="synchronization.operation_synced")
    assert audit.metadata == {"result": "synced"}
    assert audit.device_id == "device-a"
    assert list(audit.metadata) == ["result"]

    status = visit["api"].get("/api/v1/sync/status/", {"device_id": "device-a"})
    assert status.status_code == 200, status.data
    assert status.data["counts"]["synced"] == 1
    assert status.data["counts"]["failed"] == 0
    assert status.data["cursor"] >= 1

    pulled = visit["api"].get("/api/v1/sync/pull/", {"cursor": 0}, HTTP_X_BRANCH_ID=str(visit["branch"].id))
    assert pulled.status_code == 200, pulled.data
    assert pulled.data["changes"][0]["operation_id"] == operation["operation_id"]
    assert pulled.data["changes"][0]["status"] == "synced"
    assert pulled.data["changes"][0]["entity_id"] == result["server_entity_id"]
    assert pulled.data["next_cursor"] >= pulled.data["changes"][0]["cursor"]


@pytest.mark.django_db
def test_duplicate_operation_is_not_applied_twice(visit):
    operation = _operation(visit)
    first = _push(visit["api"], visit, [operation])
    second = _push(visit["api"], visit, [operation])
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.data["results"][0]["status"] == "synced"
    assert second.data["results"][0]["duplicate"] is True
    assert second.data["results"][0]["server_entity_id"] == first.data["results"][0]["server_entity_id"]
    assert VitalSign.objects.filter(encounter_id=visit["encounter_id"]).count() == 1
    assert SyncOperation.objects.get(operation_id=operation["operation_id"]).retry_count == 0
    duplicate_audit = AuditEvent.objects.get(action="synchronization.operation_duplicate")
    assert duplicate_audit.metadata == {"result": "duplicate"}


@pytest.mark.django_db
def test_failed_operation_does_not_roll_back_the_rest_of_the_batch(visit):
    bad = _operation(visit, payload={"encounter": visit["encounter_id"]})
    good = _operation(visit, device_id="device-a")
    response = _push(visit["api"], visit, [bad, good])
    assert response.status_code == 200, response.data
    assert response.data["results"][0]["status"] == "failed"
    assert response.data["results"][0]["retry_count"] == 1
    assert "measurement" in response.data["results"][0]["last_error"]
    assert response.data["results"][1]["status"] == "synced"
    assert VitalSign.objects.filter(encounter_id=visit["encounter_id"]).count() == 1
    failed = SyncOperation.objects.get(operation_id=bad["operation_id"])
    assert failed.status == "failed"
    assert AuditEvent.objects.get(action="synchronization.operation_failed").metadata == {"result": "failed"}


@pytest.mark.django_db
def test_retry_applies_a_failed_operation_once(visit, clinic):
    nurse = User.objects.create_user(
        email="retry-nurse@example.com",
        password=PASSWORD,
        full_name="Retry Nurse",
        clinic=clinic,
    )
    client = APIClient()
    auth(client, nurse)
    operation = _operation(visit)
    operation["user_id"] = str(nurse.id)
    operation["device_id"] = "device-retry"
    first = _push(client, visit, [operation])
    assert first.status_code == 200, first.data
    assert first.data["results"][0]["status"] == "failed"
    assert first.data["results"][0]["retry_count"] == 1
    assert "permission" in first.data["results"][0]["last_error"]
    assert VitalSign.objects.filter(encounter_id=visit["encounter_id"]).count() == 0

    grant(nurse, "encounters.create", "encounters.view")
    second = _push(client, visit, [operation])
    assert second.status_code == 200, second.data
    assert second.data["results"][0]["status"] == "synced"
    assert second.data["results"][0]["duplicate"] is False
    assert second.data["results"][0]["retry_count"] == 1
    assert VitalSign.objects.filter(encounter_id=visit["encounter_id"]).count() == 1

    third = _push(client, visit, [operation])
    assert third.data["results"][0]["duplicate"] is True
    assert VitalSign.objects.filter(encounter_id=visit["encounter_id"]).count() == 1


@pytest.mark.django_db
def test_conflict_keeps_the_stored_clinical_record(visit):
    operation = _operation(visit)
    created = _push(visit["api"], visit, [operation])
    assert created.data["results"][0]["status"] == "synced"
    vital_id = created.data["results"][0]["server_entity_id"]

    replacement = _operation(
        visit,
        operation="update",
        payload={"encounter": visit["encounter_id"], "temperature": "36.0"},
    )
    replacement["entity_id"] = vital_id
    conflict = _push(visit["api"], visit, [replacement])
    assert conflict.status_code == 200, conflict.data
    assert conflict.data["results"][0]["status"] == "conflict"
    assert "does not replace" in conflict.data["results"][0]["last_error"]
    assert VitalSign.objects.get(pk=vital_id).temperature == Decimal("37.2")
    assert AuditEvent.objects.get(action="synchronization.operation_conflict").metadata == {"result": "conflict"}

    changed = _operation(
        visit,
        operation_id=operation["operation_id"],
        payload={"encounter": visit["encounter_id"], "temperature": "36.4", "pulse": 70},
    )
    mismatch = _push(visit["api"], visit, [changed])
    assert mismatch.data["results"][0]["status"] == "conflict"
    assert VitalSign.objects.get(pk=vital_id).temperature == Decimal("37.2")
    assert SyncOperation.objects.get(operation_id=operation["operation_id"]).status == "synced"
    assert VitalSign.objects.filter(encounter_id=visit["encounter_id"]).count() == 1


@pytest.mark.django_db
def test_multiple_devices_share_changes_without_reprocessing(visit, clinic, other_clinic):
    first = _operation(visit, device_id="device-a")
    pushed = _push(visit["api"], visit, [first])
    assert pushed.data["results"][0]["status"] == "synced"

    colleague = User.objects.create_user(
        email="colleague@example.com",
        password=PASSWORD,
        full_name="Colleague Example",
        clinic=clinic,
    )
    grant(colleague, "encounters.view", "encounters.create")
    colleague_api = APIClient()
    auth(colleague_api, colleague)
    pulled = colleague_api.get("/api/v1/sync/pull/", {"cursor": 0}, HTTP_X_BRANCH_ID=str(visit["branch"].id))
    assert pulled.status_code == 200, pulled.data
    assert [change["operation_id"] for change in pulled.data["changes"]] == [first["operation_id"]]
    assert pulled.data["changes"][0]["device_id"] == "device-a"

    replay = dict(first)
    replay["user_id"] = str(colleague.id)
    replay["device_id"] = "device-b"
    replayed = _push(colleague_api, visit, [replay])
    assert replayed.data["results"][0]["status"] == "failed"
    assert VitalSign.objects.filter(encounter_id=visit["encounter_id"]).count() == 1

    note = _operation(visit, device_id="device-b")
    note["user_id"] = str(colleague.id)
    note["entity_type"] = "encounters.ClinicalNote"
    note["payload"] = {"encounter": visit["encounter_id"], "body": "Awake and comfortable."}
    noted = _push(colleague_api, visit, [note])
    assert noted.status_code == 200, noted.data
    assert noted.data["results"][0]["status"] == "synced"
    assert ClinicalNote.objects.filter(encounter_id=visit["encounter_id"]).count() == 1

    cursor = pulled.data["next_cursor"]
    follow = visit["api"].get("/api/v1/sync/pull/", {"cursor": cursor}, HTTP_X_BRANCH_ID=str(visit["branch"].id))
    assert [change["entity_type"] for change in follow.data["changes"]] == ["encounters.ClinicalNote"]
    assert follow.data["changes"][0]["device_id"] == "device-b"

    outsider = User.objects.create_user(
        email="outsider@example.com",
        password=PASSWORD,
        full_name="Outsider Example",
        clinic=other_clinic,
    )
    grant(outsider, "encounters.view")
    outsider_api = APIClient()
    auth(outsider_api, outsider)
    hidden = outsider_api.get("/api/v1/sync/pull/")
    assert hidden.status_code == 200
    assert hidden.data["changes"] == []


@pytest.mark.django_db
def test_offline_to_online_keeps_the_original_created_at(visit):
    created_at = timezone.now() - timedelta(hours=3)
    operation = _operation(visit, device_id="device-offline", created_at=created_at)
    response = _push(visit["api"], visit, [operation])
    assert response.status_code == 200, response.data
    assert response.data["results"][0]["status"] == "synced"
    stored = SyncOperation.objects.get(operation_id=operation["operation_id"])
    assert abs((stored.created_at - created_at).total_seconds()) < 1
    assert stored.acknowledged_at > stored.created_at
    assert stored.device_id == "device-offline"
    assert stored.user_id == visit["user"].id
    assert stored.clinic_id == visit["clinic"].id
    assert stored.branch_id == visit["branch"].id


@pytest.mark.django_db
def test_sync_create_cannot_correct_an_existing_vital(visit):
    created = _push(visit["api"], visit, [_operation(visit)])
    assert created.status_code == 200, created.data
    vital_id = created.data["results"][0]["server_entity_id"]
    correction = _operation(
        visit,
        payload={
            "encounter": visit["encounter_id"],
            "temperature": "36.0",
            "supersedes": vital_id,
        },
    )
    response = _push(visit["api"], visit, [correction])
    assert response.status_code == 200, response.data
    result = response.data["results"][0]
    assert result["status"] == "conflict"
    assert result["server_entity_id"] is None
    assert VitalSign.objects.filter(encounter_id=visit["encounter_id"]).count() == 1
    assert VitalSign.objects.get(pk=vital_id).status == VitalSign.Status.ACTIVE
