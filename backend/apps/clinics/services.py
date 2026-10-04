from apps.clinics.models import DoctorProfile, Staff


def default_doctor_license(staff: Staff) -> str:
    token = str(staff.pk).replace("-", "")[:12].upper()
    return f"AUTO-{token}"


def default_doctor_specialty(staff: Staff) -> str:
    title = (staff.job_title or "").strip()
    return title[:120] if title else "General practice"


def ensure_doctor_profile(staff: Staff, *, created_by=None) -> DoctorProfile:
    profile, _created = DoctorProfile.objects.get_or_create(
        staff=staff,
        defaults={
            "license_number": default_doctor_license(staff),
            "specialty": default_doctor_specialty(staff),
            "created_by": created_by or staff.created_by,
        },
    )
    return profile


def sync_doctor_profiles_for_clinic(clinic_id) -> int:
    profile_staff_ids = DoctorProfile.objects.filter(staff__clinic_id=clinic_id).values_list("staff_id", flat=True)
    missing = Staff.objects.filter(
        clinic_id=clinic_id,
        staff_type=Staff.StaffType.DOCTOR,
        is_active=True,
    ).exclude(id__in=profile_staff_ids)
    created = 0
    for staff in missing:
        ensure_doctor_profile(staff)
        created += 1
    return created
