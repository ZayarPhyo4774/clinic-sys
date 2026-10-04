import pytest

from apps.accounts.models import Permission, Role, User, UserRole
from testing import PASSWORD


def _grant(user, code: str, clinic, branch=None):
    permission = Permission.objects.get_or_create(code=code, defaults={"description": code})[0]
    role = Role.objects.create(clinic=clinic, name=code, code=code.replace(".", "_"))
    role.permissions.add(permission)
    UserRole.objects.create(user=user, role=role, branch=branch)


@pytest.mark.django_db
def test_clinic_admin_lists_users(api_client, user, clinic, branch):
    _grant(user, "users.manage", clinic, branch)
    api_client.force_authenticate(user=user)
    response = api_client.get("/api/v1/admin/users/", HTTP_X_BRANCH_ID=str(branch.id))
    assert response.status_code == 200
    assert any(row["email"] == user.email for row in response.data["results"])


@pytest.mark.django_db
def test_clinic_admin_creates_user(api_client, user, clinic, branch):
    _grant(user, "users.manage", clinic, branch)
    api_client.force_authenticate(user=user)
    response = api_client.post(
        "/api/v1/admin/users/",
        {
            "email": "reception@example.com",
            "full_name": "Reception Desk",
            "password": PASSWORD,
        },
        format="json",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert response.status_code == 201
    assert User.objects.filter(email="reception@example.com", clinic=clinic).exists()


@pytest.mark.django_db
def test_clinic_admin_roles_require_permission(api_client, user, clinic, branch):
    _grant(user, "roles.manage", clinic, branch)
    Permission.objects.get_or_create(code="patients.view", defaults={"description": "View patients"})
    api_client.force_authenticate(user=user)
    response = api_client.post(
        "/api/v1/admin/roles/",
        {"name": "Reception", "code": "reception", "permissions": ["patients.view"]},
        format="json",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert response.status_code == 201
    assert Role.objects.filter(clinic=clinic, code="reception").exists()


@pytest.mark.django_db
def test_audit_events_require_audit_view(api_client, user, clinic, branch):
    api_client.force_authenticate(user=user)
    denied = api_client.get("/api/v1/audit-events/", HTTP_X_BRANCH_ID=str(branch.id))
    assert denied.status_code == 403
    _grant(user, "audit.view", clinic, branch)
    allowed = api_client.get("/api/v1/audit-events/", HTTP_X_BRANCH_ID=str(branch.id))
    assert allowed.status_code == 200
    assert "results" in allowed.data


@pytest.mark.django_db
def test_audit_view_is_clinic_admin_without_branch_header(api_client, user, clinic, branch):
    _grant(user, "audit.view", clinic, branch)
    api_client.force_authenticate(user=user)
    allowed = api_client.get("/api/v1/audit-events/")
    assert allowed.status_code == 200
    assert "results" in allowed.data


@pytest.mark.django_db
def test_clinic_admin_updates_user_and_role(api_client, user, clinic, branch):
    _grant(user, "users.manage", clinic, branch)
    _grant(user, "roles.manage", clinic, branch)
    Permission.objects.get_or_create(code="patients.view", defaults={"description": "View patients"})
    api_client.force_authenticate(user=user)
    created = api_client.post(
        "/api/v1/admin/users/",
        {"email": "staff@example.com", "full_name": "Staff Member", "password": PASSWORD},
        format="json",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert created.status_code == 201
    staff_id = created.data["id"]
    deactivated = api_client.patch(
        f"/api/v1/admin/users/{staff_id}/",
        {"is_active": False},
        format="json",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert deactivated.status_code == 200
    assert deactivated.data["is_active"] is False

    role = Role.objects.create(clinic=clinic, name="Desk", code="desk")
    role.permissions.add(Permission.objects.get(code="patients.view"))
    updated = api_client.patch(
        f"/api/v1/admin/roles/{role.id}/",
        {"name": "Front desk", "permissions": ["patients.view"]},
        format="json",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert updated.status_code == 200
    assert updated.data["name"] == "Front desk"


@pytest.mark.django_db
def test_clinic_admin_removes_assignment(api_client, user, clinic, branch):
    _grant(user, "roles.manage", clinic, branch)
    Permission.objects.get_or_create(code="patients.view", defaults={"description": "View patients"})
    api_client.force_authenticate(user=user)
    staff = User.objects.create_user(email="assign@example.com", password=PASSWORD, full_name="Assign Me", clinic=clinic)
    role = Role.objects.create(clinic=clinic, name="Viewer", code="viewer")
    role.permissions.add(Permission.objects.get(code="patients.view"))
    assignment = UserRole.objects.create(user=staff, role=role, branch=branch)
    response = api_client.delete(
        f"/api/v1/admin/assignments/{assignment.id}/",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert response.status_code == 204
    assert not UserRole.objects.filter(pk=assignment.id).exists()


@pytest.mark.django_db
def test_reports_summary(api_client, user, clinic, branch):
    _grant(user, "reports.view", clinic, branch)
    api_client.force_authenticate(user=user)
    response = api_client.get("/api/v1/reports/summary/", HTTP_X_BRANCH_ID=str(branch.id))
    assert response.status_code == 200
    assert "appointments_by_status" in response.data
    assert "invoice_total" in response.data
    assert "payments_collected" in response.data
    assert "outstanding_balance" in response.data
    assert response.data["currency"] == "USD"
