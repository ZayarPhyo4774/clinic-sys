import pytest

from apps.accounts.default_roles import ensure_permission_catalog, install_default_roles
from apps.accounts.models import Permission, Role, User, UserRole
from apps.clinics.models import Branch, Clinic, DoctorProfile, Staff
from testing import PASSWORD


def grant(user, clinic, branch, *codes):
    permissions = [
        Permission.objects.get_or_create(code=code, defaults={"description": code})[0] for code in codes
    ]
    role = Role.objects.create(clinic=clinic, name="Test role", code=f"test-{user.id}")
    role.permissions.set(permissions)
    UserRole.objects.create(user=user, role=role, branch=branch)
    return user


@pytest.mark.django_db
def test_receptionist_can_list_doctor_profiles(api_client, clinic, branch):
    ensure_permission_catalog()
    install_default_roles(clinic, update_existing=True)

    doctor_user = User.objects.create_user(
        email="doctor@example.com",
        password=PASSWORD,
        full_name="Dr. Example",
        clinic=clinic,
    )
    receptionist = User.objects.create_user(
        email="reception@example.com",
        password=PASSWORD,
        full_name="Front Desk",
        clinic=clinic,
    )
    receptionist_role = Role.objects.get(clinic=clinic, code="receptionist")
    UserRole.objects.create(user=receptionist, role=receptionist_role, branch=branch)

    Staff.objects.create(
        user=doctor_user,
        clinic=clinic,
        branch=branch,
        staff_type=Staff.StaffType.DOCTOR,
        job_title="Physician",
    )

    api_client.force_authenticate(user=receptionist)
    response = api_client.get("/api/v1/doctor-profiles/", HTTP_X_BRANCH_ID=str(branch.id))

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["staff_full_name"] == "Dr. Example"


@pytest.mark.django_db
def test_sync_doctor_profiles_backfills_missing_profiles(api_client, clinic, branch):
    doctor_user = User.objects.create_user(
        email="legacy-doctor@example.com",
        password=PASSWORD,
        full_name="Legacy Doctor",
        clinic=clinic,
    )
    staff = Staff.objects.create(
        user=doctor_user,
        clinic=clinic,
        branch=branch,
        staff_type=Staff.StaffType.DOCTOR,
    )
    DoctorProfile.objects.filter(staff=staff).delete()

    manager = User.objects.create_user(
        email="manager@example.com",
        password=PASSWORD,
        full_name="Manager",
        clinic=clinic,
    )
    grant(manager, clinic, branch, "staff.view")

    api_client.force_authenticate(user=manager)
    response = api_client.get("/api/v1/doctor-profiles/", HTTP_X_BRANCH_ID=str(branch.id))

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert DoctorProfile.objects.filter(staff=staff).exists()
