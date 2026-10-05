import uuid
from decimal import Decimal

import pytest

from apps.appointments.tests.test_scheduling import auth, book, cover, grant, make_doctor, make_patient, upcoming_slots
from apps.encounters.models import Encounter
from apps.encounters.tests.test_encounters import start
from apps.queues.models import QueueEntry


def queue_patient(api, branch, patient, doctor, slot):
    cover(api, doctor, branch, [slot])
    created = book(api, branch, patient, doctor, *slot)
    assert created.status_code == 201, created.data
    appointment_id = created.data["id"]
    assert api.post(f"/api/v1/appointments/{appointment_id}/check-in/").status_code == 200
    queued = api.post(f"/api/v1/appointments/{appointment_id}/queue/")
    assert queued.status_code == 201, queued.data
    return appointment_id, queued.data["id"]


@pytest.fixture
def nurse(api_client, clinic, branch, user):
    grant(
        user,
        "appointments.view",
        "appointments.create",
        "appointments.update",
        "encounters.view",
        "vitals.record",
        "triage.start",
    )
    auth(api_client, user)
    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    patient = make_patient(branch, name="Triage Patient")
    slot = upcoming_slots(clinic, count=1)[0]
    appointment_id, entry_id = queue_patient(api_client, branch, patient, doctor, slot)
    return {
        "api": api_client,
        "branch": branch,
        "user": user,
        "doctor": doctor,
        "patient": patient,
        "appointment_id": appointment_id,
        "entry_id": entry_id,
    }


@pytest.mark.django_db
def test_triage_start_creates_open_encounter(nurse):
    response = nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/triage/start/")
    assert response.status_code == 200, response.data
    encounter = response.data["encounter"]
    assert encounter["phase"] == "triage"
    assert encounter["status"] == "open"
    entry = response.data["queue_entry"]
    assert entry["triage_started_at"]
    assert entry["encounter"] == encounter["id"]

    again = nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/triage/start/")
    assert again.status_code == 200, again.data
    assert again.data["encounter"]["id"] == encounter["id"]


@pytest.mark.django_db
def test_vitals_only_allowed_during_triage(nurse):
    triage = nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/triage/start/")
    encounter_id = triage.data["encounter"]["id"]
    vital = nurse["api"].post(
        f"/api/v1/encounters/{encounter_id}/vitals/",
        {"temperature": "37.1", "pulse": 78},
        format="json",
    )
    assert vital.status_code == 201, vital.data
    entry = QueueEntry.objects.get(pk=nurse["entry_id"])
    assert entry.vitals_recorded_at is not None

    grant(nurse["user"], "encounters.create")
    symptom = nurse["api"].post(
        f"/api/v1/encounters/{encounter_id}/symptoms/",
        {"description": "Headache"},
        format="json",
    )
    assert symptom.status_code == 400
    assert "consultation" in str(symptom.data).lower()


@pytest.mark.django_db
def test_queue_start_moves_triage_encounter_to_consultation(nurse, clinic, branch):
    doctor_user = nurse["doctor"].staff.user
    grant(doctor_user, "encounters.create", "appointments.update")
    triage = nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/triage/start/")
    encounter_id = triage.data["encounter"]["id"]
    nurse["api"].post(
        f"/api/v1/encounters/{encounter_id}/vitals/",
        {"temperature": "36.8", "pulse": 72},
        format="json",
    )

    auth(nurse["api"], doctor_user)
    assert nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/call/").status_code == 200
    started = nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/start/")
    assert started.status_code == 200, started.data

    encounter = Encounter.objects.get(pk=encounter_id)
    assert encounter.phase == Encounter.Phase.CONSULTATION

    auth(nurse["api"], nurse["user"])
    vital = nurse["api"].post(
        f"/api/v1/encounters/{encounter_id}/vitals/",
        {"temperature": "37.0"},
        format="json",
    )
    assert vital.status_code == 400

    auth(nurse["api"], doctor_user)
    diagnosis = nurse["api"].post(
        f"/api/v1/encounters/{encounter_id}/diagnoses/",
        {"description": "Viral illness"},
        format="json",
    )
    assert diagnosis.status_code == 201, diagnosis.data


@pytest.mark.django_db
def test_consultation_facts_blocked_in_triage_phase(nurse):
    triage = nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/triage/start/")
    encounter_id = triage.data["encounter"]["id"]
    grant(nurse["user"], "encounters.create")
    note = nurse["api"].post(
        f"/api/v1/encounters/{encounter_id}/notes/",
        {"body": "Patient feels warm."},
        format="json",
    )
    assert note.status_code == 400


@pytest.mark.django_db
def test_vitals_require_vitals_record_permission(api_client, clinic, branch, user):
    grant(user, "appointments.create", "appointments.update", "encounters.view", "triage.start")
    auth(api_client, user)
    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    patient = make_patient(branch)
    slot = upcoming_slots(clinic, count=1)[0]
    _appointment_id, entry_id = queue_patient(api_client, branch, patient, doctor, slot)
    triage = api_client.post(f"/api/v1/queue-entries/{entry_id}/triage/start/")
    encounter_id = triage.data["encounter"]["id"]
    denied = api_client.post(
        f"/api/v1/encounters/{encounter_id}/vitals/",
        {"pulse": 70},
        format="json",
    )
    assert denied.status_code == 403


@pytest.mark.django_db
def test_consultation_encounter_rejects_vitals(api_client, clinic, branch, user):
    grant(
        user,
        "appointments.view",
        "appointments.create",
        "appointments.update",
        "encounters.view",
        "encounters.create",
        "vitals.record",
    )
    auth(api_client, user)
    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    patient = make_patient(branch)
    slot = upcoming_slots(clinic, count=1)[0]
    appointment_id, _entry_id = queue_patient(api_client, branch, patient, doctor, slot)
    assert api_client.post(f"/api/v1/queue-entries/{_entry_id}/call/").status_code == 200
    assert api_client.post(f"/api/v1/queue-entries/{_entry_id}/start/").status_code == 200
    opened = start(api_client, appointment_id)
    assert opened.status_code == 201, opened.data
    assert opened.data["phase"] == "consultation"
    encounter_id = opened.data["id"]

    vital = api_client.post(
        f"/api/v1/encounters/{encounter_id}/vitals/",
        {"temperature": "37.2", "pulse": 80},
        format="json",
    )
    assert vital.status_code == 400
    assert "triage" in str(vital.data).lower()


@pytest.mark.django_db
def test_complete_encounter_requires_consultation_phase(nurse, user):
    grant(user, "encounters.update")
    triage = nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/triage/start/")
    encounter_id = triage.data["encounter"]["id"]
    auth(nurse["api"], user)
    blocked = nurse["api"].post(f"/api/v1/encounters/{encounter_id}/complete/")
    assert blocked.status_code == 400

    assert nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/call/").status_code == 200
    assert nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/start/").status_code == 200
    auth(nurse["api"], user)
    grant(user, "encounters.update")
    finished = nurse["api"].post(f"/api/v1/encounters/{encounter_id}/complete/")
    assert finished.status_code == 200, finished.data
    assert finished.data["status"] == "completed"


@pytest.mark.django_db
def test_triage_start_rejected_after_patient_is_called(nurse):
    assert nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/call/").status_code == 200
    response = nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/triage/start/")
    assert response.status_code == 400


@pytest.mark.django_db
def test_full_triage_to_consultation_flow(api_client, clinic, branch, user):
    grant(
        user,
        "appointments.view",
        "appointments.create",
        "appointments.update",
        "encounters.view",
        "encounters.create",
        "encounters.update",
        "vitals.record",
        "triage.start",
    )
    auth(api_client, user)
    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    patient = make_patient(branch, name="Flow Patient")
    slot = upcoming_slots(clinic, count=1)[0]
    appointment_id, entry_id = queue_patient(api_client, branch, patient, doctor, slot)

    triage = api_client.post(f"/api/v1/queue-entries/{entry_id}/triage/start/")
    encounter_id = triage.data["encounter"]["id"]
    vital = api_client.post(
        f"/api/v1/encounters/{encounter_id}/vitals/",
        {"temperature": "37.0", "systolic": 120, "diastolic": 80},
        format="json",
    )
    assert vital.status_code == 201, vital.data
    assert Decimal(vital.data["temperature"]) == Decimal("37.0")

    assert api_client.post(f"/api/v1/queue-entries/{entry_id}/call/").status_code == 200
    assert api_client.post(f"/api/v1/queue-entries/{entry_id}/start/").status_code == 200

    opened = start(api_client, appointment_id)
    assert opened.status_code == 201, opened.data
    assert opened.data["id"] == encounter_id
    assert opened.data["phase"] == "consultation"

    history = api_client.get(f"/api/v1/encounters/{encounter_id}/history/")
    assert history.status_code == 200
    assert len(history.data["vitals"]) == 1
    assert history.data["vitals"][0]["temperature"] == "37.0"
