import uuid
from datetime import date, time, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.accounts.models import Permission, Role, User, UserRole
from apps.appointments.models import Appointment, DoctorSchedule
from apps.audit.models import AuditEvent
from apps.clinics.models import DoctorProfile, Staff
from apps.patients.models import Patient
from apps.queues.models import QueueEntry
from testing import PASSWORD


def grant(user, *codes, branch=None):
    permissions = [
        Permission.objects.get_or_create(code=code, defaults={"description": code})[0] for code in codes
    ]
    role = Role.objects.create(clinic=user.clinic, name="Scheduling", code=f"sch-{uuid.uuid4().hex[:8]}")
    role.permissions.add(*permissions)
    UserRole.objects.create(user=user, role=role, branch=branch)
    return user


def auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def make_doctor(clinic, branch, email="doctor@example.com"):
    doctor_user = User.objects.create_user(
        email=email,
        password=PASSWORD,
        full_name="Doctor Example",
        clinic=clinic,
    )
    staff = Staff.objects.create(user=doctor_user, branch=branch, staff_type=Staff.StaffType.DOCTOR)
    profile = DoctorProfile.objects.filter(staff=staff).first()
    if profile is not None:
        return profile
    return DoctorProfile.objects.create(
        staff=staff,
        license_number=f"LIC-{uuid.uuid4().hex[:8]}",
        specialty="General",
    )


def make_patient(branch, number="000001", name="Lina Chart"):
    return Patient.objects.create(
        branch=branch,
        patient_number=number,
        full_name=name,
        date_of_birth=date(1990, 4, 12),
        sex=Patient.Sex.FEMALE,
    )


def upcoming_slots(clinic, count=3, slot_minutes=30):
    zone = ZoneInfo(clinic.timezone)
    moment = timezone.now().astimezone(zone)
    cursor_day = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    step = timedelta(minutes=slot_minutes)
    slots = []
    while len(slots) < count:
        elapsed = (moment - cursor_day).total_seconds()
        index = 0 if elapsed < 0 else int(elapsed // step.total_seconds()) + 1
        start = cursor_day + (index * step)
        end = start + step
        if start.date() != cursor_day.date() or end.date() != start.date() or end.time() > time(23, 30):
            cursor_day = cursor_day + timedelta(days=1)
            moment = cursor_day - timedelta(seconds=1)
            continue
        slots.append((start, end))
        moment = end
    return slots


def cover(api, doctor, branch, slots):
    seen = set()
    for start, _end in slots:
        if start.weekday() in seen:
            continue
        seen.add(start.weekday())
        response = api.post(
            "/api/v1/doctor-schedules/",
            {
                "branch": str(branch.id),
                "doctor": str(doctor.id),
                "weekday": start.weekday(),
                "start_time": "00:00:00",
                "end_time": "23:30:00",
                "slot_minutes": 30,
            },
            format="json",
        )
        assert response.status_code == 201, response.data


def book(api, branch, patient, doctor, start, end, reason="Follow up"):
    return api.post(
        "/api/v1/appointments/",
        {
            "branch": str(branch.id),
            "patient": str(patient.id),
            "doctor": str(doctor.id),
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat(),
            "visit_reason": reason,
        },
        format="json",
    )


@pytest.fixture
def desk(api_client, clinic, branch, user):
    grant(user, "appointments.view", "appointments.create", "appointments.update", "appointments.cancel")
    auth(api_client, user)
    doctor = make_doctor(clinic, branch)
    patient = make_patient(branch)
    slots = upcoming_slots(clinic)
    cover(api_client, doctor, branch, slots)
    return SimpleNamespace(
        api=api_client,
        clinic=clinic,
        branch=branch,
        user=user,
        doctor=doctor,
        patient=patient,
        slots=slots,
    )


def queue_patient(api, appointment_id):
    checked = api.post(f"/api/v1/appointments/{appointment_id}/check-in/")
    assert checked.status_code == 200, checked.data
    queued = api.post(f"/api/v1/appointments/{appointment_id}/queue/")
    assert queued.status_code == 201, queued.data
    return queued.data


@pytest.mark.django_db
def test_walk_in_requires_create_and_update_permissions(api_client, clinic, branch, user):
    from apps.accounts.default_roles import ensure_permission_catalog, install_default_roles
    from apps.accounts.models import Role, User, UserRole

    ensure_permission_catalog()
    install_default_roles(clinic, update_existing=True)
    grant(user, "appointments.view", "appointments.create", "appointments.update", branch=branch)
    auth(api_client, user)
    doctor = make_doctor(clinic, branch)
    patient = make_patient(branch)
    cover(api_client, doctor, branch, upcoming_slots(clinic, count=1))
    header = {"HTTP_X_BRANCH_ID": str(branch.id)}

    solo = Role.objects.get(clinic=clinic, code="solo-practitioner")
    solo_user = User.objects.create_user(
        email="solo-walkin@example.com",
        password=PASSWORD,
        full_name="Dr. Solo",
        clinic=clinic,
    )
    UserRole.objects.create(user=solo_user, role=solo, branch=branch)
    auth(api_client, solo_user)
    allowed = api_client.post(
        "/api/v1/appointments/walk-in/",
        {"patient": str(patient.id), "doctor": str(doctor.id), "visit_reason": "Walk-in"},
        format="json",
        **header,
    )
    assert allowed.status_code == 201, allowed.data

    viewer = grant(
        User.objects.create_user(
            email="walkin-viewer@example.com",
            password=PASSWORD,
            full_name="Viewer",
            clinic=clinic,
        ),
        "appointments.view",
        branch=branch,
    )
    auth(api_client, viewer)
    denied = api_client.post(
        "/api/v1/appointments/walk-in/",
        {"patient": str(patient.id), "doctor": str(doctor.id), "visit_reason": "Walk-in"},
        format="json",
        **header,
    )
    assert denied.status_code == 403
    assert "appointments.create" in denied.data["detail"]


@pytest.mark.django_db
def test_walk_in_books_checks_in_and_queues(desk):
    api = desk.api
    header = {"HTTP_X_BRANCH_ID": str(desk.branch.id)}
    response = api.post(
        "/api/v1/appointments/walk-in/",
        {
            "patient": str(desk.patient.id),
            "doctor": str(desk.doctor.id),
            "visit_reason": "Walk-in",
        },
        format="json",
        **header,
    )
    assert response.status_code == 201, response.data
    assert response.data["appointment"]["status"] == "in_queue"
    assert response.data["appointment"]["visit_reason"] == "Walk-in"
    assert response.data["queue_entry"]["status"] == "waiting"
    assert response.data["queue_entry"]["position"] == 1


@pytest.mark.django_db
def test_schedule_booking_reschedule_and_consultation(desk):
    api = desk.api
    start, end = desk.slots[0]
    later, later_end = desk.slots[1]
    created = book(api, desk.branch, desk.patient, desk.doctor, start, end)
    assert created.status_code == 201
    assert created.data["status"] == "scheduled"
    assert created.data["visit_reason"] == "Follow up"
    assert str(created.data["doctor"]) == str(desk.doctor.id)
    appointment_id = created.data["id"]

    confirmed = api.post(f"/api/v1/appointments/{appointment_id}/confirm/")
    assert confirmed.status_code == 200
    assert confirmed.data["status"] == "confirmed"

    moved = api.post(
        f"/api/v1/appointments/{appointment_id}/reschedule/",
        {"starts_at": later.isoformat(), "ends_at": later_end.isoformat()},
        format="json",
    )
    assert moved.status_code == 200, moved.data
    assert moved.data["status"] == "confirmed"
    assert parse_datetime(moved.data["starts_at"]) == later

    queued = queue_patient(api, appointment_id)
    assert queued["status"] == "waiting"
    assert queued["position"] == 1
    assert queued["appointment_status"] == "in_queue"
    entry_id = queued["id"]

    called = api.post(f"/api/v1/queue-entries/{entry_id}/call/")
    assert called.status_code == 200
    assert called.data["status"] == "called"

    started = api.post(f"/api/v1/queue-entries/{entry_id}/start/")
    assert started.status_code == 200
    assert started.data["status"] == "in_service"
    assert started.data["appointment_status"] == "in_consultation"

    finished = api.post(f"/api/v1/queue-entries/{entry_id}/complete/")
    assert finished.status_code == 200
    assert finished.data["status"] == "completed"
    assert finished.data["appointment_status"] == "completed"

    cancelled = api.post(f"/api/v1/appointments/{appointment_id}/cancel/")
    assert cancelled.status_code == 400
    assert cancelled.data["fields"]["status"]
    assert Appointment.objects.get(pk=appointment_id).status == Appointment.Status.COMPLETED
    assert QueueEntry.objects.get(pk=entry_id).status == QueueEntry.Status.COMPLETED

    found = api.get("/api/v1/appointments/?search=Lina&status=completed")
    assert found.status_code == 200
    assert found.data["count"] == 1


@pytest.mark.django_db
def test_invalid_queue_transition_leaves_both_records_unchanged(desk):
    api = desk.api
    created = book(api, desk.branch, desk.patient, desk.doctor, *desk.slots[0])
    queued = queue_patient(api, created.data["id"])
    started = api.post(f"/api/v1/queue-entries/{queued['id']}/start/")
    assert started.status_code == 400
    assert started.data["fields"]["status"]
    assert QueueEntry.objects.get(pk=queued["id"]).status == QueueEntry.Status.WAITING
    assert Appointment.objects.get(pk=created.data["id"]).status == Appointment.Status.IN_QUEUE

    called = api.post(f"/api/v1/queue-entries/{queued['id']}/call/")
    assert called.status_code == 200
    skipped = api.post(f"/api/v1/queue-entries/{queued['id']}/skip/")
    assert skipped.status_code == 200
    assert skipped.data["status"] == "skipped"
    recalled = api.post(f"/api/v1/queue-entries/{queued['id']}/call/")
    assert recalled.status_code == 400
    rejoined = api.post(f"/api/v1/queue-entries/{queued['id']}/requeue/")
    assert rejoined.status_code == 200
    assert rejoined.data["status"] == "waiting"
    assert rejoined.data["position"] == 2


@pytest.mark.django_db
def test_overlap_past_time_and_schedule_conflicts_are_rejected(desk, clinic, other_branch):
    api = desk.api
    start, end = desk.slots[0]
    first = book(api, desk.branch, desk.patient, desk.doctor, start, end)
    assert first.status_code == 201
    other = make_patient(desk.branch, number="000002", name="Omar West")
    overlap = book(api, desk.branch, other, desk.doctor, start, end, reason="Same slot")
    assert overlap.status_code == 400
    assert "starts_at" in overlap.data["fields"]

    zone = ZoneInfo(clinic.timezone)
    past = (timezone.now().astimezone(zone) - timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
    cover(api, desk.doctor, desk.branch, [(past, past + timedelta(minutes=30))])
    too_early = book(api, desk.branch, other, desk.doctor, past, past + timedelta(minutes=30))
    assert too_early.status_code == 400
    assert "future" in too_early.data["fields"]["starts_at"][0]

    outside = api.post(
        "/api/v1/appointments/",
        {
            "branch": str(desk.branch.id),
            "patient": str(other.id),
            "doctor": str(desk.doctor.id),
            "starts_at": (start + timedelta(days=14)).isoformat(),
            "ends_at": (start + timedelta(days=14, minutes=15)).isoformat(),
        },
        format="json",
    )
    assert outside.status_code == 400

    duplicate_schedule = api.post(
        "/api/v1/doctor-schedules/",
        {
            "branch": str(desk.branch.id),
            "doctor": str(desk.doctor.id),
            "weekday": start.weekday(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 30,
        },
        format="json",
    )
    assert duplicate_schedule.status_code == 400
    assert "start_time" in duplicate_schedule.data["fields"]

    south_doctor = make_doctor(clinic, other_branch, email="south-doctor@example.com")
    wrong_branch = book(api, desk.branch, other, south_doctor, desk.slots[1][0], desk.slots[1][1])
    assert wrong_branch.status_code == 400
    assert "doctor" in wrong_branch.data["fields"]


@pytest.mark.django_db
def test_cancellation_frees_the_slot_and_cancels_the_queue(desk):
    api = desk.api
    start, end = desk.slots[0]
    created = book(api, desk.branch, desk.patient, desk.doctor, start, end)
    queued = queue_patient(api, created.data["id"])
    cancelled = api.post(f"/api/v1/appointments/{created.data['id']}/cancel/")
    assert cancelled.status_code == 200
    assert cancelled.data["status"] == "cancelled"
    assert QueueEntry.objects.get(pk=queued["id"]).status == QueueEntry.Status.CANCELLED
    other = make_patient(desk.branch, number="000002", name="Omar West")
    rebooked = book(api, desk.branch, other, desk.doctor, start, end)
    assert rebooked.status_code == 201

    missed = book(api, desk.branch, desk.patient, desk.doctor, *desk.slots[1])
    no_show = api.post(f"/api/v1/appointments/{missed.data['id']}/no-show/")
    assert no_show.status_code == 200
    assert no_show.data["status"] == "no_show"
    third = make_patient(desk.branch, number="000003", name="Nila Shore")
    taken = book(api, desk.branch, third, desk.doctor, *desk.slots[1])
    assert taken.status_code == 201


@pytest.mark.django_db
def test_unauthorized_access_and_role_permissions(api_client, clinic, branch, user):
    anonymous = api_client.get("/api/v1/appointments/")
    assert anonymous.status_code == 401
    assert anonymous.data["code"] == "not_authenticated"

    auth(api_client, user)
    assert api_client.get("/api/v1/queue-entries/").status_code == 403

    doctor = make_doctor(clinic, branch)
    patient = make_patient(branch)
    slots = upcoming_slots(clinic, count=1)

    viewer = grant(
        User.objects.create_user(email="viewer@example.com", password=PASSWORD, full_name="Viewer", clinic=clinic),
        "appointments.view",
    )
    creator = grant(
        User.objects.create_user(email="creator@example.com", password=PASSWORD, full_name="Creator", clinic=clinic),
        "appointments.create",
    )
    editor = grant(
        User.objects.create_user(email="editor@example.com", password=PASSWORD, full_name="Editor", clinic=clinic),
        "appointments.update",
    )
    canceller = grant(
        User.objects.create_user(email="canceller@example.com", password=PASSWORD, full_name="Canceller", clinic=clinic),
        "appointments.cancel",
    )

    auth(api_client, editor)
    assert cover_status(api_client, doctor, branch, slots) == 201
    auth(api_client, creator)
    assert (
        api_client.post(
            "/api/v1/doctor-schedules/",
            {
                "branch": str(branch.id),
                "doctor": str(doctor.id),
                "weekday": slots[0][0].weekday(),
                "start_time": "00:00:00",
                "end_time": "12:00:00",
                "slot_minutes": 30,
            },
            format="json",
        ).status_code
        == 403
    )
    created = book(api_client, branch, patient, doctor, *slots[0])
    assert created.status_code == 201
    assert api_client.get("/api/v1/appointments/").status_code == 403
    assert api_client.post(f"/api/v1/appointments/{created.data['id']}/check-in/").status_code == 403
    assert api_client.post(f"/api/v1/appointments/{created.data['id']}/cancel/").status_code == 403

    auth(api_client, viewer)
    assert api_client.get("/api/v1/appointments/").status_code == 200
    assert book(api_client, branch, patient, doctor, *slots[0]).status_code == 403

    auth(api_client, editor)
    assert api_client.post(f"/api/v1/appointments/{created.data['id']}/check-in/").status_code == 200
    assert book(api_client, branch, patient, doctor, *slots[0]).status_code == 403

    auth(api_client, canceller)
    assert api_client.get("/api/v1/appointments/").status_code == 403
    removed = api_client.post(f"/api/v1/appointments/{created.data['id']}/cancel/")
    assert removed.status_code == 200
    assert removed.data["status"] == "cancelled"


def cover_status(api, doctor, branch, slots):
    response = api.post(
        "/api/v1/doctor-schedules/",
        {
            "branch": str(branch.id),
            "doctor": str(doctor.id),
            "weekday": slots[0][0].weekday(),
            "start_time": "00:00:00",
            "end_time": "23:30:00",
            "slot_minutes": 30,
        },
        format="json",
    )
    return response.status_code


@pytest.mark.django_db
def test_clinic_isolation_and_branch_scope(api_client, clinic, branch, other_branch, other_clinic, user):
    grant(user, "appointments.view", "appointments.create", "appointments.update", "appointments.cancel")
    auth(api_client, user)
    doctor = make_doctor(clinic, branch)
    patient = make_patient(branch, name="Hidden Chart")
    slots = upcoming_slots(clinic, count=1)
    cover(api_client, doctor, branch, slots)
    created = book(api_client, branch, patient, doctor, *slots[0])
    assert created.status_code == 201

    outsider = grant(
        User.objects.create_user(
            email="other-desk@example.com",
            password=PASSWORD,
            full_name="Other Desk",
            clinic=other_clinic,
        ),
        "appointments.view",
        "appointments.create",
        "appointments.update",
        "appointments.cancel",
    )
    auth(api_client, outsider)
    listing = api_client.get("/api/v1/appointments/?search=Hidden")
    assert listing.status_code == 200
    assert listing.data["count"] == 0
    detail = api_client.get(f"/api/v1/appointments/{created.data['id']}/")
    assert detail.status_code == 404
    assert "Hidden Chart" not in str(detail.data)
    queue_list = api_client.get("/api/v1/queue-entries/?search=Hidden")
    assert queue_list.status_code == 200
    assert queue_list.data["count"] == 0

    north = grant(
        User.objects.create_user(
            email="north-desk@example.com",
            password=PASSWORD,
            full_name="North Desk",
            clinic=clinic,
        ),
        "appointments.view",
        "appointments.create",
        branch=branch,
    )
    auth(api_client, north)
    assert api_client.get("/api/v1/appointments/").status_code == 403
    assert api_client.get("/api/v1/appointments/", HTTP_X_BRANCH_ID=str(other_branch.id)).status_code == 403
    visible = api_client.get("/api/v1/appointments/", HTTP_X_BRANCH_ID=str(branch.id))
    assert visible.status_code == 200
    assert visible.data["count"] == 1


@pytest.mark.django_db
def test_one_doctor_sees_one_active_patient_and_audit_omits_clinical_text(desk):
    api = desk.api
    first = book(api, desk.branch, desk.patient, desk.doctor, *desk.slots[0], reason="Follow up")
    second_patient = make_patient(desk.branch, number="000002", name="Omar West")
    second = book(api, desk.branch, second_patient, desk.doctor, *desk.slots[1], reason="Lab review")
    first_entry = queue_patient(api, first.data["id"])
    second_entry = queue_patient(api, second.data["id"])
    assert api.post(f"/api/v1/queue-entries/{first_entry['id']}/call/").status_code == 200
    blocked = api.post(f"/api/v1/queue-entries/{second_entry['id']}/call/")
    assert blocked.status_code == 400
    assert QueueEntry.objects.get(pk=second_entry["id"]).status == QueueEntry.Status.WAITING
    assert api.post(f"/api/v1/queue-entries/{first_entry['id']}/start/").status_code == 200
    assert api.post(f"/api/v1/queue-entries/{first_entry['id']}/complete/").status_code == 200
    opened = api.post(f"/api/v1/queue-entries/{second_entry['id']}/call/")
    assert opened.status_code == 200

    event = AuditEvent.objects.get(action="appointments.appointment_created", entity_id=first.data["id"])
    assert event.metadata == {"result": "created"}
    stored = " ".join(str(row) for row in AuditEvent.objects.values_list("metadata", flat=True))
    for secret in ("Lina Chart", "Omar West", "Follow up", "Lab review"):
        assert secret not in stored
    with pytest.raises(ValidationError):
        Appointment.objects.all().delete()


@pytest.mark.django_db
def test_database_rejects_an_overlapping_appointment_insert(desk):
    api = desk.api
    start, end = desk.slots[0]
    created = book(api, desk.branch, desk.patient, desk.doctor, start, end)
    assert created.status_code == 201
    schedule = DoctorSchedule.objects.get(pk=created.data["schedule"])
    other = make_patient(desk.branch, number="000002", name="Omar West")
    duplicate = Appointment(
        clinic=desk.branch.clinic,
        branch=desk.branch,
        patient=other,
        doctor=desk.doctor,
        schedule=schedule,
        starts_at=start,
        ends_at=end,
        status=Appointment.Status.SCHEDULED,
        visit_reason="",
        created_at=timezone.now(),
        updated_at=timezone.now(),
    )
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Appointment.objects.bulk_create([duplicate])
