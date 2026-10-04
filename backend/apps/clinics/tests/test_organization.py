import uuid

import pytest

from apps.accounts.models import Permission, Role, User, UserRole
from apps.audit.models import AuditEvent
from apps.clinics.models import Branch, Department, DoctorProfile, NurseProfile, Staff
from testing import PASSWORD


def grant(user, *codes):
    permissions = [
        Permission.objects.get_or_create(code=code, defaults={"description": code})[0] for code in codes
    ]
    role = Role.objects.create(
        clinic=user.clinic,
        name="Organization",
        code=f"org-{uuid.uuid4().hex[:8]}",
    )
    role.permissions.add(*permissions)
    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def manager(user):
    return grant(
        user,
        "clinics.view",
        "clinics.manage",
        "branches.view",
        "branches.manage",
        "departments.view",
        "departments.manage",
        "staff.view",
        "staff.manage",
    )


@pytest.fixture
def colleague(clinic):
    return User.objects.create_user(
        email="doctor@example.com",
        password=PASSWORD,
        full_name="Doctor Example",
        clinic=clinic,
    )


def auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.django_db
def test_organization_requires_authentication(api_client):
    response = api_client.get("/api/v1/clinics/")
    assert response.status_code == 401
    assert response.data["code"] == "not_authenticated"


@pytest.mark.django_db
def test_missing_permission_is_forbidden(api_client, user):
    auth(api_client, user)
    response = api_client.get("/api/v1/branches/")
    assert response.status_code == 403
    assert response.data["code"] == "permission_denied"


@pytest.mark.django_db
def test_clinic_list_is_isolated_and_paginated(api_client, manager, other_clinic):
    auth(api_client, manager)
    response = api_client.get("/api/v1/clinics/")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["id"] == str(manager.clinic_id)
    assert response.data["results"][0]["name"] != other_clinic.name
    missing = api_client.get(f"/api/v1/clinics/{other_clinic.id}/")
    assert missing.status_code == 404


@pytest.mark.django_db
def test_only_operator_can_create_a_clinic(api_client, manager, db):
    auth(api_client, manager)
    denied = api_client.post(
        "/api/v1/clinics/",
        {"name": "New Clinic", "code": "new-clinic"},
        format="json",
    )
    assert denied.status_code == 403

    operator = User.objects.create_superuser(
        email="operator@example.com",
        password=PASSWORD,
        full_name="Operator",
    )
    auth(api_client, operator)
    created = api_client.post(
        "/api/v1/clinics/",
        {"name": "New Clinic", "code": "New-Clinic", "currency": "usd", "timezone": "Not/AZone"},
        format="json",
    )
    assert created.status_code == 400
    assert "timezone" in created.data["fields"]

    created = api_client.post(
        "/api/v1/clinics/",
        {"name": "New Clinic", "code": "New-Clinic", "currency": "usd", "timezone": "Asia/Yangon"},
        format="json",
    )
    assert created.status_code == 201
    assert created.data["code"] == "new-clinic"
    assert created.data["currency"] == "USD"
    assert str(created.data["created_by"]) == str(operator.id)


@pytest.mark.django_db
def test_manager_can_update_own_clinic_only(api_client, manager, other_clinic):
    auth(api_client, manager)
    response = api_client.patch(
        f"/api/v1/clinics/{manager.clinic_id}/",
        {"name": "Renamed Clinic"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["name"] == "Renamed Clinic"
    blocked = api_client.patch(
        f"/api/v1/clinics/{other_clinic.id}/",
        {"name": "Stolen"},
        format="json",
    )
    assert blocked.status_code == 404
    other_clinic.refresh_from_db()
    assert other_clinic.name == "Other Clinic"


@pytest.mark.django_db
def test_branch_create_is_scoped_and_audited(api_client, manager, other_clinic):
    auth(api_client, manager)
    response = api_client.post(
        "/api/v1/branches/",
        {"name": "East Wing", "code": "East"},
        format="json",
    )
    assert response.status_code == 201
    assert response.data["code"] == "east"
    assert str(response.data["clinic"]) == str(manager.clinic_id)
    assert str(response.data["created_by"]) == str(manager.id)
    event = AuditEvent.objects.get(action="clinics.branch_created")
    assert event.actor_id == manager.id
    assert event.metadata == {"result": "created"}
    assert "East Wing" not in str(event.metadata)

    duplicate = api_client.post(
        "/api/v1/branches/",
        {"name": "East Again", "code": "east"},
        format="json",
    )
    assert duplicate.status_code == 400
    assert "code" in duplicate.data["fields"]

    foreign = Branch.objects.create(clinic=other_clinic, name="Far", code="far")
    hidden = api_client.get(f"/api/v1/branches/{foreign.id}/")
    assert hidden.status_code == 404


@pytest.mark.django_db
def test_department_filters_pagination_and_branch_header(api_client, manager, branch, other_branch):
    auth(api_client, manager)
    first = api_client.post(
        "/api/v1/departments/",
        {"branch": str(branch.id), "name": "Cardiology", "code": "cardio"},
        format="json",
    )
    second = api_client.post(
        "/api/v1/departments/",
        {"branch": str(other_branch.id), "name": "Radiology", "code": "radio"},
        format="json",
    )
    assert first.status_code == 201
    assert second.status_code == 201

    inactive = Department.objects.get(code="radio")
    inactive.is_active = False
    inactive.save()

    active = api_client.get("/api/v1/departments/?is_active=true")
    assert active.status_code == 200
    assert active.data["count"] == 1
    assert active.data["results"][0]["code"] == "cardio"

    searched = api_client.get("/api/v1/departments/?search=card")
    assert [row["code"] for row in searched.data["results"]] == ["cardio"]

    paged = api_client.get("/api/v1/departments/?page_size=1&ordering=name")
    assert paged.data["count"] == 2
    assert len(paged.data["results"]) == 1
    assert paged.data["next"]

    scoped = api_client.get("/api/v1/departments/", HTTP_X_BRANCH_ID=str(branch.id))
    assert scoped.data["count"] == 1
    assert str(scoped.data["results"][0]["branch"]) == str(branch.id)

    mismatch = api_client.post(
        "/api/v1/departments/",
        {"branch": str(other_branch.id), "name": "Lab", "code": "lab"},
        format="json",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert mismatch.status_code == 400
    assert "branch" in mismatch.data["fields"]

    invalid = api_client.get("/api/v1/departments/?is_active=maybe")
    assert invalid.status_code == 400
    assert "is_active" in invalid.data["fields"]


@pytest.mark.django_db
def test_staff_and_profiles_validate_relationships(api_client, manager, branch, colleague, other_clinic):
    auth(api_client, manager)
    department = Department.objects.create(branch=branch, name="Medicine", code="med")
    other_branch = Branch.objects.create(clinic=manager.clinic, name="West", code="west")
    other_department = Department.objects.create(branch=other_branch, name="Surgery", code="surg")
    outsider = User.objects.create_user(
        email="outsider@example.com",
        password=PASSWORD,
        full_name="Outsider",
        clinic=other_clinic,
    )

    rejected_user = api_client.post(
        "/api/v1/staff/",
        {
            "user": str(outsider.id),
            "branch": str(branch.id),
            "staff_type": "doctor",
        },
        format="json",
    )
    assert rejected_user.status_code == 400
    assert other_clinic.name not in str(rejected_user.data)

    rejected_department = api_client.post(
        "/api/v1/staff/",
        {
            "user": str(colleague.id),
            "branch": str(branch.id),
            "department": str(other_department.id),
            "staff_type": "doctor",
        },
        format="json",
    )
    assert rejected_department.status_code == 400
    assert "department" in rejected_department.data["fields"]

    doctor = api_client.post(
        "/api/v1/staff/",
        {
            "user": str(colleague.id),
            "branch": str(branch.id),
            "department": str(department.id),
            "staff_type": "doctor",
            "job_title": "Physician",
        },
        format="json",
    )
    assert doctor.status_code == 201
    assert str(doctor.data["clinic"]) == str(manager.clinic_id)
    assert doctor.data["user_email"] == colleague.email
    assert str(doctor.data["created_by"]) == str(manager.id)

    nurse_user = User.objects.create_user(
        email="nurse2@example.com",
        password=PASSWORD,
        full_name="Second Nurse",
        clinic=manager.clinic,
    )
    nurse = api_client.post(
        "/api/v1/staff/",
        {"user": str(nurse_user.id), "branch": str(branch.id), "staff_type": "nurse"},
        format="json",
    )
    assert nurse.status_code == 201

    doctors = api_client.get("/api/v1/staff/?staff_type=doctor")
    assert doctors.data["count"] == 1
    assert doctors.data["results"][0]["id"] == doctor.data["id"]

    listed = api_client.get("/api/v1/doctor-profiles/")
    assert listed.data["count"] == 1
    assert str(listed.data["results"][0]["staff"]) == doctor.data["id"]
    assert listed.data["results"][0]["staff_full_name"]

    profile = api_client.patch(
        f"/api/v1/doctor-profiles/{listed.data['results'][0]['id']}/",
        {"license_number": "DOC-1", "specialty": "Cardiology"},
        format="json",
    )
    assert profile.status_code == 200
    assert str(profile.data["branch"]) == str(branch.id)

    wrong_type = api_client.post(
        "/api/v1/doctor-profiles/",
        {"staff": nurse.data["id"], "license_number": "DOC-2", "specialty": "Medicine"},
        format="json",
    )
    assert wrong_type.status_code == 400
    assert "staff" in wrong_type.data["fields"]

    duplicate_license = api_client.post(
        "/api/v1/doctor-profiles/",
        {"staff": doctor.data["id"], "license_number": "DOC-1", "specialty": "Medicine"},
        format="json",
    )
    assert duplicate_license.status_code == 400

    nurse_profile = api_client.post(
        "/api/v1/nurse-profiles/",
        {"staff": nurse.data["id"], "license_number": "NUR-1", "grade": "Senior"},
        format="json",
    )
    assert nurse_profile.status_code == 201

    removed = api_client.delete(f"/api/v1/departments/{department.id}/")
    assert removed.status_code == 405
    assert Department.objects.filter(pk=department.id).exists()
    assert DoctorProfile.objects.filter(license_number="DOC-1").exists()
    assert NurseProfile.objects.filter(license_number="NUR-1").exists()
    assert Staff.objects.filter(pk=doctor.data["id"], staff_type=Staff.StaffType.DOCTOR).exists()
