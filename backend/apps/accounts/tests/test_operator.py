import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Permission, Role, User
from apps.audit.models import AuditEvent
from apps.clinics.models import Branch, Clinic
from testing import PASSWORD


def _operator(api_client):
    operator = User.objects.create_superuser(
        email="operator@example.com",
        password=PASSWORD,
        full_name="Operator Example",
    )
    api_client.force_authenticate(user=operator)
    return operator


@pytest.mark.django_db
def test_staff_cannot_open_the_operator_portal(api_client, user):
    api_client.force_authenticate(user=user)
    response = api_client.get("/api/v1/operator/clinics/")
    assert response.status_code == 403
    assert response.data["code"] == "permission_denied"


@pytest.mark.django_db
def test_operator_can_set_up_a_clinic_and_grant_module_access(api_client):
    _operator(api_client)

    clinic = api_client.post(
        "/api/v1/operator/clinics/",
        {"name": "Main Clinic", "code": "main", "timezone": "Asia/Yangon", "currency": "MMK"},
        format="json",
    )
    assert clinic.status_code == 201, clinic.data
    branch = api_client.post(
        "/api/v1/operator/branches/",
        {"clinic": clinic.data["id"], "name": "North", "code": "north"},
        format="json",
    )
    assert branch.status_code == 201, branch.data

    installed = api_client.post("/api/v1/operator/permissions/", {}, format="json")
    assert installed.status_code == 200, installed.data
    assert installed.data["created"] >= 1
    catalog = api_client.get("/api/v1/operator/permissions/")
    codes = {row["code"] for row in catalog.data["results"]}
    assert "patients.view" in codes
    assert "billing.payment" in codes

    role = api_client.post(
        "/api/v1/operator/roles/",
        {
            "clinic": clinic.data["id"],
            "name": "Reception",
            "code": "reception",
            "permissions": ["patients.view", "patients.create", "appointments.view"],
        },
        format="json",
    )
    assert role.status_code == 201, role.data

    created = api_client.post(
        "/api/v1/operator/users/",
        {
            "clinic": clinic.data["id"],
            "email": "reception@example.com",
            "full_name": "Rita Reception",
            "password": PASSWORD,
        },
        format="json",
    )
    assert created.status_code == 201, created.data
    assert "password" not in created.data
    assert created.data["email"] == "reception@example.com"

    assigned = api_client.post(
        "/api/v1/operator/assignments/",
        {"user": created.data["id"], "role": role.data["id"], "branch": branch.data["id"]},
        format="json",
    )
    assert assigned.status_code == 201, assigned.data

    event = AuditEvent.objects.get(action="operator.user_created")
    assert event.metadata == {"result": "created"}
    assert PASSWORD not in str(event.metadata)

    staff_api = APIClient()
    login = staff_api.post(
        "/api/v1/auth/token/",
        {"email": "reception@example.com", "password": PASSWORD},
        format="json",
    )
    assert login.status_code == 200
    me = staff_api.get(
        "/api/v1/auth/me/",
        HTTP_AUTHORIZATION=f"Bearer {login.data['access']}",
        HTTP_X_BRANCH_ID=branch.data["id"],
    )
    assert me.status_code == 200
    assert me.data["is_superuser"] is False
    assert me.data["permissions"] == ["appointments.view", "patients.create", "patients.view"]
    assert Clinic.objects.filter(code="main").exists()
    assert Branch.objects.filter(code="north").exists()


@pytest.mark.django_db
def test_operator_can_install_default_roles_for_a_clinic(api_client):
    _operator(api_client)
    clinic = api_client.post(
        "/api/v1/operator/clinics/",
        {"name": "Setup Clinic", "code": "setup", "timezone": "UTC", "currency": "USD"},
        format="json",
    )
    assert clinic.status_code == 201, clinic.data

    install = api_client.post(f"/api/v1/operator/clinics/{clinic.data['id']}/default-roles/", {}, format="json")
    assert install.status_code == 200, install.data
    assert install.data["created"] >= 1
    assert install.data["created_permissions"] >= 1

    seeded_codes = set(
        Role.objects.filter(clinic_id=clinic.data["id"]).values_list("code", flat=True)
    )
    assert "clinic-admin" in seeded_codes
    assert "solo-practitioner" in seeded_codes
    assert "doctor" in seeded_codes
    assert "receptionist" in seeded_codes

    rerun = api_client.post(f"/api/v1/operator/clinics/{clinic.data['id']}/default-roles/", {}, format="json")
    assert rerun.status_code == 200, rerun.data
    assert rerun.data["created"] == 0
    assert rerun.data["skipped"] >= 1


@pytest.mark.django_db
def test_operator_can_resync_existing_default_roles(api_client):
    _operator(api_client)
    clinic = api_client.post(
        "/api/v1/operator/clinics/",
        {"name": "Resync Clinic", "code": "resync", "timezone": "UTC", "currency": "USD"},
        format="json",
    )
    assert clinic.status_code == 201, clinic.data

    first_install = api_client.post(
        f"/api/v1/operator/clinics/{clinic.data['id']}/default-roles/",
        {},
        format="json",
    )
    assert first_install.status_code == 200, first_install.data

    cashier = Role.objects.get(clinic_id=clinic.data["id"], code="cashier")
    patients_view = Permission.objects.get(code="patients.view")
    cashier.name = "Custom Cashier"
    cashier.save(update_fields=["name"])
    cashier.permissions.set([patients_view])

    resync = api_client.post(
        f"/api/v1/operator/clinics/{clinic.data['id']}/default-roles/",
        {"update_existing": True},
        format="json",
    )
    assert resync.status_code == 200, resync.data
    assert resync.data["updated"] >= 1
    assert resync.data["skipped"] == 0

    cashier.refresh_from_db()
    assert cashier.name == "Cashier"
    cashier_codes = set(cashier.permissions.values_list("code", flat=True))
    assert "billing.payment" in cashier_codes
    assert "billing.create" in cashier_codes


@pytest.mark.django_db
def test_operator_can_preview_default_role_resync_changes(api_client):
    _operator(api_client)
    clinic = api_client.post(
        "/api/v1/operator/clinics/",
        {"name": "Preview Clinic", "code": "preview", "timezone": "UTC", "currency": "USD"},
        format="json",
    )
    assert clinic.status_code == 201, clinic.data

    api_client.post(f"/api/v1/operator/clinics/{clinic.data['id']}/default-roles/", {}, format="json")

    cashier = Role.objects.get(clinic_id=clinic.data["id"], code="cashier")
    cashier.name = "Cashier Custom"
    cashier.save(update_fields=["name"])
    cashier.permissions.clear()

    preview = api_client.get(f"/api/v1/operator/clinics/{clinic.data['id']}/default-roles/?update_existing=1")
    assert preview.status_code == 200, preview.data
    assert preview.data["update_existing"] is True
    assert preview.data["updated"] >= 1

    cashier_item = next(item for item in preview.data["items"] if item["code"] == "cashier")
    assert cashier_item["status"] == "update"
    assert cashier_item["existing_name"] == "Cashier Custom"
    assert "billing.payment" in cashier_item["added_permissions"]
    assert cashier_item["removed_permissions"] == []


@pytest.mark.django_db
def test_operator_rejects_a_short_password_and_a_cross_clinic_role(api_client, clinic, other_clinic, user):
    _operator(api_client)
    api_client.post("/api/v1/operator/permissions/", {}, format="json")
    role = api_client.post(
        "/api/v1/operator/roles/",
        {
            "clinic": str(other_clinic.id),
            "name": "Other",
            "code": "other",
            "permissions": ["patients.view"],
        },
        format="json",
    )
    assert role.status_code == 201, role.data
    short = api_client.post(
        "/api/v1/operator/users/",
        {
            "clinic": str(clinic.id),
            "email": "short@example.com",
            "full_name": "Short Password",
            "password": "short",
        },
        format="json",
    )
    assert short.status_code == 400
    assert "password" in short.data["fields"]
    assert User.objects.filter(email="short@example.com").count() == 0

    mismatched = api_client.post(
        "/api/v1/operator/assignments/",
        {"user": str(user.id), "role": role.data["id"]},
        format="json",
    )
    assert mismatched.status_code == 400


@pytest.mark.django_db
def test_operator_can_update_and_deactivate_clinic_records(api_client):
    _operator(api_client)
    clinic = api_client.post(
        "/api/v1/operator/clinics/",
        {"name": "Main Clinic", "code": "main", "timezone": "Asia/Yangon", "currency": "MMK"},
        format="json",
    )
    branch = api_client.post(
        "/api/v1/operator/branches/",
        {"clinic": clinic.data["id"], "name": "North", "code": "north"},
        format="json",
    )
    api_client.post("/api/v1/operator/permissions/", {}, format="json")
    role = api_client.post(
        "/api/v1/operator/roles/",
        {
            "clinic": clinic.data["id"],
            "name": "Reception",
            "code": "reception",
            "permissions": ["patients.view"],
        },
        format="json",
    )
    staff = api_client.post(
        "/api/v1/operator/users/",
        {
            "clinic": clinic.data["id"],
            "email": "staff@example.com",
            "full_name": "Staff Example",
            "password": PASSWORD,
        },
        format="json",
    )
    assignment = api_client.post(
        "/api/v1/operator/assignments/",
        {"user": staff.data["id"], "role": role.data["id"], "branch": branch.data["id"]},
        format="json",
    )

    updated_clinic = api_client.patch(
        f"/api/v1/operator/clinics/{clinic.data['id']}/",
        {"name": "Updated Clinic", "is_active": False},
        format="json",
    )
    assert updated_clinic.status_code == 200
    assert updated_clinic.data["name"] == "Updated Clinic"
    assert updated_clinic.data["is_active"] is False

    updated_branch = api_client.patch(
        f"/api/v1/operator/branches/{branch.data['id']}/",
        {"is_active": False},
        format="json",
    )
    assert updated_branch.status_code == 200
    assert updated_branch.data["is_active"] is False

    updated_user = api_client.patch(
        f"/api/v1/operator/users/{staff.data['id']}/",
        {"is_active": False},
        format="json",
    )
    assert updated_user.status_code == 200
    assert updated_user.data["is_active"] is False

    updated_role = api_client.patch(
        f"/api/v1/operator/roles/{role.data['id']}/",
        {"name": "Front desk", "permissions": ["patients.view", "patients.create"]},
        format="json",
    )
    assert updated_role.status_code == 200
    assert updated_role.data["name"] == "Front desk"
    assert updated_role.data["permissions"] == ["patients.create", "patients.view"]

    blocked = api_client.delete(f"/api/v1/operator/roles/{role.data['id']}/")
    assert blocked.status_code == 400
    assert blocked.data["fields"]["role"]

    removed = api_client.delete(f"/api/v1/operator/assignments/{assignment.data['id']}/")
    assert removed.status_code == 204

    deleted = api_client.delete(f"/api/v1/operator/roles/{role.data['id']}/")
    assert deleted.status_code == 204
    assert Role.objects.filter(id=role.data["id"]).count() == 0


@pytest.mark.django_db
def test_operator_can_edit_and_delete_an_empty_clinic(api_client):
    _operator(api_client)
    clinic = api_client.post(
        "/api/v1/operator/clinics/",
        {"name": "Empty Clinic", "code": "empty", "timezone": "UTC", "currency": "USD"},
        format="json",
    )
    assert clinic.status_code == 201, clinic.data

    updated = api_client.patch(
        f"/api/v1/operator/clinics/{clinic.data['id']}/",
        {"name": "Renamed Clinic", "timezone": "Asia/Yangon", "currency": "MMK", "is_active": False},
        format="json",
    )
    assert updated.status_code == 200
    assert updated.data["name"] == "Renamed Clinic"
    assert updated.data["currency"] == "MMK"
    assert updated.data["is_active"] is False

    removed = api_client.delete(f"/api/v1/operator/clinics/{clinic.data['id']}/")
    assert removed.status_code == 204
    assert Clinic.objects.filter(id=clinic.data["id"]).count() == 0


@pytest.mark.django_db
def test_operator_blocks_clinic_delete_when_branches_exist(api_client):
    _operator(api_client)
    clinic = api_client.post(
        "/api/v1/operator/clinics/",
        {"name": "Blocked Clinic", "code": "blocked", "timezone": "UTC", "currency": "USD"},
        format="json",
    )
    assert clinic.status_code == 201, clinic.data
    branch = api_client.post(
        "/api/v1/operator/branches/",
        {"clinic": clinic.data["id"], "name": "Only Branch", "code": "only"},
        format="json",
    )
    assert branch.status_code == 201, branch.data

    delete_blocked = api_client.delete(f"/api/v1/operator/clinics/{clinic.data['id']}/")
    assert delete_blocked.status_code == 400
    assert delete_blocked.data["fields"]["clinic"]
