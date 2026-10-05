from datetime import time, timedelta

import pytest
from django.utils import timezone

from apps.appointments.models import Appointment, DoctorSchedule
from apps.appointments.tests.test_scheduling import make_doctor, make_patient, upcoming_slots
from apps.clinics.ccr_services import ensure_ccr_settings, ensure_default_disability_types
from apps.encounters.models import Diagnosis, Encounter, EncounterConsultationMeta
from apps.reports.services.ccr import build_ccr_report, render_ccr_pdf, render_ccr_xlsx
from apps.accounts.models import User
from testing import PASSWORD


@pytest.mark.django_db
def test_build_ccr_report_includes_completed_encounter(clinic, branch):
    ensure_default_disability_types(clinic)
    settings = ensure_ccr_settings(clinic)
    settings.project_name = "EWARS"
    settings.state_region = "Magway"
    settings.township_mimu = "Salin"
    settings.save()

    doctor = make_doctor(clinic, branch, email="ccr-doctor@example.com")
    doctor_user = doctor.staff.user
    patient = make_patient(branch, number="CCR001", name="CCR Patient")
    starts, ends = upcoming_slots(clinic, count=1)[0]
    schedule = DoctorSchedule.objects.create(
        branch=branch,
        doctor=doctor,
        weekday=starts.weekday(),
        start_time=time(8, 0),
        end_time=time(23, 0),
        slot_minutes=30,
    )
    appointment = Appointment.objects.create(
        clinic=clinic,
        branch=branch,
        patient=patient,
        doctor=doctor,
        schedule=schedule,
        starts_at=starts,
        ends_at=ends,
    )
    Appointment.objects.filter(pk=appointment.pk).update(status=Appointment.Status.IN_CONSULTATION)
    encounter = Encounter.objects.create(
        appointment=appointment,
        clinic=clinic,
        branch=branch,
        patient=patient,
        doctor=doctor,
        started_by=doctor_user,
        phase=Encounter.Phase.CONSULTATION,
    )
    Diagnosis.objects.create(
        encounter=encounter,
        clinic=clinic,
        branch=branch,
        patient=patient,
        doctor=doctor,
        description="DM",
        recorded_by=doctor_user,
    )
    Encounter.objects.filter(pk=encounter.pk).update(
        status=Encounter.Status.COMPLETED,
        completed_at=timezone.now(),
        completed_by_id=doctor_user.id,
    )
    Appointment.objects.filter(pk=appointment.pk).update(status=Appointment.Status.COMPLETED)
    encounter.refresh_from_db()
    disability = clinic.disability_types.first()
    EncounterConsultationMeta.objects.create(
        encounter=encounter,
        patient_status=EncounterConsultationMeta.PatientStatus.NEW,
        is_plw=True,
        is_disabled=True,
        disability_type=disability,
        referral_made=True,
        referral_cause="Hospital",
        treatment="Metformin",
        remark="Admission",
        updated_by=doctor_user,
    )

    today = timezone.localdate()
    payload = build_ccr_report(clinic_id=clinic.id, branch_id=branch.id, start=today, end=today)
    assert payload["header"]["project_name"] == "EWARS"
    assert payload["header"]["report_date_formatted"] == f"{today.day}-{today.month}-{today.year}"
    assert payload["row_count"] == 1
    row = payload["rows"][0]
    assert row["name"] == patient.full_name
    assert row["diagnosis"] == "DM"
    assert row["plw"] == "✓"
    assert row["disabled"] == "✓"
    assert row["status_new"] == "✓"
    assert row["referral"] == "✓"
    xlsx_bytes = render_ccr_xlsx(payload)
    pdf_bytes = render_ccr_pdf(payload)
    assert xlsx_bytes.startswith(b"PK")
    assert pdf_bytes.startswith(b"%PDF")
