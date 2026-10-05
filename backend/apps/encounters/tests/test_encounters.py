import uuid
from datetime import timedelta
from decimal import Decimal

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
from apps.encounters.models import ClinicalNote, Encounter, Symptom, VitalSign
from testing import PASSWORD


def begin_consultation(api, branch, patient, doctor, slot):
    cover(api, doctor, branch, [slot])
    created = book(api, branch, patient, doctor, *slot)
    assert created.status_code == 201, created.data
    appointment_id = created.data["id"]
    assert api.post(f"/api/v1/appointments/{appointment_id}/check-in/").status_code == 200
    queued = api.post(f"/api/v1/appointments/{appointment_id}/queue/")
    assert queued.status_code == 201, queued.data
    entry_id = queued.data["id"]
    assert api.post(f"/api/v1/queue-entries/{entry_id}/call/").status_code == 200
    started = api.post(f"/api/v1/queue-entries/{entry_id}/start/")
    assert started.status_code == 200, started.data
    return appointment_id


@pytest.fixture
def clinician(api_client, clinic, branch, user):
    grant(
        user,
        "appointments.view",
        "appointments.create",
        "appointments.update",
        "appointments.cancel",
        "encounters.view",
        "encounters.create",
        "encounters.update",
    )
    auth(api_client, user)
    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    patient = make_patient(branch, name="Lina Chart")
    slot = upcoming_slots(clinic, count=1)[0]
    appointment_id = begin_consultation(api_client, branch, patient, doctor, slot)
    return {
        "api": api_client,
        "clinic": clinic,
        "branch": branch,
        "user": user,
        "doctor": doctor,
        "patient": patient,
        "appointment_id": appointment_id,
    }


def start(api, appointment_id):
    return api.post("/api/v1/encounters/", {"appointment": str(appointment_id)}, format="json")


@pytest.mark.django_db
def test_consultation_records_are_attributed_and_not_overwritten(clinician):
    api = clinician["api"]
    opened = start(api, clinician["appointment_id"])
    assert opened.status_code == 201, opened.data
    assert opened.data["status"] == "open"
    assert str(opened.data["patient"]) == str(clinician["patient"].id)
    assert str(opened.data["doctor"]) == str(clinician["doctor"].id)
    assert str(opened.data["clinic"]) == str(clinician["clinic"].id)
    assert str(opened.data["branch"]) == str(clinician["branch"].id)
    assert str(opened.data["started_by"]) == str(clinician["user"].id)
    assert opened.data["started_at"]
    encounter_id = opened.data["id"]
    assert opened.data["phase"] == "consultation"
    duplicate = start(api, clinician["appointment_id"])
    assert duplicate.status_code == 201, duplicate.data
    assert duplicate.data["id"] == encounter_id

    grant(clinician["user"], "vitals.record")
    vital = api.post(
        f"/api/v1/encounters/{encounter_id}/vitals/",
        {"temperature": "37.2", "pulse": 80, "systolic": 120, "diastolic": 80},
        format="json",
    )
    assert vital.status_code == 400

    symptom = api.post(
        f"/api/v1/encounters/{encounter_id}/symptoms/",
        {"description": "Sore throat"},
        format="json",
    )
    assert symptom.status_code == 201, symptom.data
    replacement = api.post(
        f"/api/v1/encounters/{encounter_id}/symptoms/",
        {"description": "Mild sore throat", "supersedes": symptom.data["id"]},
        format="json",
    )
    assert replacement.status_code == 201
    assert Symptom.objects.get(pk=symptom.data["id"]).description == "Sore throat"

    diagnosis = api.post(
        f"/api/v1/encounters/{encounter_id}/diagnoses/",
        {"code": "j06.9", "description": "Upper respiratory infection"},
        format="json",
    )
    assert diagnosis.status_code == 201, diagnosis.data
    assert diagnosis.data["code"] == "J06.9"

    note = api.post(
        f"/api/v1/encounters/{encounter_id}/notes/",
        {"body": "Exam is unremarkable."},
        format="json",
    )
    assert note.status_code == 201, note.data
    plan = api.post(
        f"/api/v1/encounters/{encounter_id}/treatment-plans/",
        {"title": "Rest and fluids", "details": "Review if fever persists."},
        format="json",
    )
    assert plan.status_code == 201, plan.data
    tomorrow = timezone.now().date() + timedelta(days=1)
    follow_up = api.post(
        f"/api/v1/encounters/{encounter_id}/follow-ups/",
        {"follow_up_on": tomorrow.isoformat(), "note": "Clinic review"},
        format="json",
    )
    assert follow_up.status_code == 201, follow_up.data
    yesterday = timezone.now().date() - timedelta(days=1)
    past = api.post(
        f"/api/v1/encounters/{encounter_id}/follow-ups/",
        {"follow_up_on": yesterday.isoformat()},
        format="json",
    )
    assert past.status_code == 400
    empty_vital = api.post(f"/api/v1/encounters/{encounter_id}/vitals/", {}, format="json")
    assert empty_vital.status_code == 400

    history = api.get(f"/api/v1/encounters/{encounter_id}/history/")
    assert history.status_code == 200
    assert len(history.data["vitals"]) == 0
    assert len(history.data["symptoms"]) == 2
    assert len(history.data["diagnoses"]) == 1
    assert len(history.data["notes"]) == 1
    assert len(history.data["treatment_plans"]) == 1
    assert len(history.data["follow_ups"]) == 1
    listed = api.get(f"/api/v1/encounters/?patient={clinician['patient'].id}&search=Lina")
    assert listed.status_code == 200
    assert listed.data["count"] == 1
    assert "Sore throat" not in str(listed.data)

    finished = api.post(f"/api/v1/encounters/{encounter_id}/complete/")
    assert finished.status_code == 200
    assert finished.data["status"] == "completed"
    assert str(finished.data["completed_by"]) == str(clinician["user"].id)
    again = api.post(f"/api/v1/encounters/{encounter_id}/complete/")
    assert again.status_code == 400
    assert Encounter.objects.get(pk=encounter_id).status == Encounter.Status.COMPLETED
    late = api.post(
        f"/api/v1/encounters/{encounter_id}/symptoms/",
        {"description": "New symptom after close"},
        format="json",
    )
    assert late.status_code == 400
    amended = api.post(
        f"/api/v1/encounters/{encounter_id}/notes/",
        {"body": "Addendum after close.", "supersedes": note.data["id"]},
        format="json",
    )
    assert amended.status_code == 201, amended.data
    assert ClinicalNote.objects.get(pk=note.data["id"]).body == "Exam is unremarkable."

    stored = " ".join(str(row) for row in AuditEvent.objects.values_list("metadata", flat=True))
    for secret in ("Sore throat", "Exam is unremarkable", "Upper respiratory", "Rest and fluids"):
        assert secret not in stored
    started_event = AuditEvent.objects.get(action="encounters.encounter_started", entity_id=encounter_id)
    assert started_event.metadata == {"result": "started"}
    assert started_event.actor_id == clinician["user"].id
    with pytest.raises(ValidationError):
        Encounter.objects.all().delete()
    with pytest.raises(ValidationError):
        VitalSign.objects.all().delete()


@pytest.mark.django_db
def test_encounter_list_filters_by_appointment(clinician):
    api = clinician["api"]
    opened = start(api, clinician["appointment_id"])
    assert opened.status_code == 201, opened.data
    encounter_id = opened.data["id"]

    filtered = api.get(f"/api/v1/encounters/?appointment={clinician['appointment_id']}")
    assert filtered.status_code == 200, filtered.data
    assert len(filtered.data["results"]) == 1
    assert filtered.data["results"][0]["id"] == encounter_id

    other = api.get(f"/api/v1/encounters/?appointment={uuid.uuid4()}")
    assert other.status_code == 200, other.data
    assert other.data["results"] == []


@pytest.mark.django_db
def test_encounter_requires_an_open_consultation(api_client, clinic, branch, user):
    grant(user, "appointments.create", "appointments.update", "encounters.create", "encounters.view")
    auth(api_client, user)
    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    patient = make_patient(branch)
    slot = upcoming_slots(clinic, count=1)[0]
    cover(api_client, doctor, branch, [slot])
    booked = book(api_client, branch, patient, doctor, *slot)
    assert booked.status_code == 201
    too_soon = start(api_client, booked.data["id"])
    assert too_soon.status_code == 400


@pytest.mark.django_db
def test_unauthorized_access_and_role_permissions(api_client, clinic, branch, user):
    assert api_client.get("/api/v1/encounters/").status_code == 401
    grant(user, "appointments.create", "appointments.update")
    auth(api_client, user)
    assert api_client.get("/api/v1/encounters/").status_code == 403

    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    patient = make_patient(branch)
    slot = upcoming_slots(clinic, count=1)[0]
    appointment_id = begin_consultation(api_client, branch, patient, doctor, slot)

    viewer = grant(
        User.objects.create_user(email="viewer@example.com", password=PASSWORD, full_name="Viewer", clinic=clinic),
        "encounters.view",
    )
    creator = grant(
        User.objects.create_user(email="creator@example.com", password=PASSWORD, full_name="Creator", clinic=clinic),
        "encounters.create",
    )
    closer = grant(
        User.objects.create_user(email="closer@example.com", password=PASSWORD, full_name="Closer", clinic=clinic),
        "encounters.update",
    )

    auth(api_client, creator)
    opened = start(api_client, appointment_id)
    assert opened.status_code == 201
    assert api_client.get("/api/v1/encounters/").status_code == 403
    assert api_client.post(f"/api/v1/encounters/{opened.data['id']}/complete/").status_code == 403
    grant(creator, "vitals.record")
    vital = api_client.post(
        f"/api/v1/encounters/{opened.data['id']}/vitals/",
        {"pulse": 72},
        format="json",
    )
    assert vital.status_code == 400

    auth(api_client, viewer)
    assert api_client.get("/api/v1/encounters/").status_code == 200
    assert start(api_client, appointment_id).status_code == 403
    assert api_client.post(
        f"/api/v1/encounters/{opened.data['id']}/notes/",
        {"body": "Viewer note"},
        format="json",
    ).status_code == 403

    auth(api_client, closer)
    assert api_client.get("/api/v1/encounters/").status_code == 403
    closed = api_client.post(f"/api/v1/encounters/{opened.data['id']}/complete/")
    assert closed.status_code == 200
    assert closed.data["status"] == "completed"
    assert api_client.post(
        f"/api/v1/encounters/{opened.data['id']}/notes/",
        {"body": "Closer note"},
        format="json",
    ).status_code == 403


@pytest.mark.django_db
def test_clinic_isolation_and_branch_scope(api_client, clinic, branch, other_branch, other_clinic, user):
    grant(
        user,
        "appointments.create",
        "appointments.update",
        "encounters.view",
        "encounters.create",
        "encounters.update",
    )
    auth(api_client, user)
    doctor = make_doctor(clinic, branch, email=f"dr-{uuid.uuid4().hex[:8]}@example.com")
    patient = make_patient(branch, name="Hidden Chart")
    slot = upcoming_slots(clinic, count=1)[0]
    appointment_id = begin_consultation(api_client, branch, patient, doctor, slot)
    opened = start(api_client, appointment_id)
    assert opened.status_code == 201
    note = api_client.post(
        f"/api/v1/encounters/{opened.data['id']}/notes/",
        {"body": "Private headache note"},
        format="json",
    )
    assert note.status_code == 201

    outsider = grant(
        User.objects.create_user(
            email="other-clinician@example.com",
            password=PASSWORD,
            full_name="Other Clinician",
            clinic=other_clinic,
        ),
        "encounters.view",
        "encounters.create",
        "encounters.update",
    )
    auth(api_client, outsider)
    listing = api_client.get("/api/v1/encounters/?search=Hidden")
    assert listing.status_code == 200
    assert listing.data["count"] == 0
    detail = api_client.get(f"/api/v1/encounters/{opened.data['id']}/")
    assert detail.status_code == 404
    history = api_client.get(f"/api/v1/encounters/{opened.data['id']}/history/")
    assert history.status_code == 404
    assert "Private headache note" not in str(detail.data)
    assert "Hidden Chart" not in str(detail.data)

    north = grant(
        User.objects.create_user(
            email="north-clinician@example.com",
            password=PASSWORD,
            full_name="North Clinician",
            clinic=clinic,
        ),
        "encounters.view",
        branch=branch,
    )
    auth(api_client, north)
    visible = api_client.get("/api/v1/encounters/", HTTP_X_BRANCH_ID=str(branch.id))
    assert visible.status_code == 200
    assert visible.data["count"] == 1
