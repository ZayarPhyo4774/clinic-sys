import pytest
from django.core.exceptions import ValidationError
from django.urls import path
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Permission, Role, User, UserRole
from apps.accounts.permissions import BranchScopedPermission
from apps.accounts.services import permissions_for_user
from apps.clinics.models import Branch
from testing import PASSWORD


class ProbeView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "patients.view"

    def get(self, request, **kwargs):
        return Response({"ok": True})


urlpatterns = [path("probe/", ProbeView.as_view())]


@pytest.mark.django_db
def test_email_is_stored_lowercase(clinic):
    created = User.objects.create_user(
        email="Ada@Example.com",
        password=PASSWORD,
        full_name="Ada",
        clinic=clinic,
    )
    assert created.email == "ada@example.com"


@pytest.mark.django_db
def test_branch_scoped_permissions(user, clinic, branch, other_branch):
    permission = Permission.objects.create(code="patients.view", description="View patients")
    role = Role.objects.create(clinic=clinic, name="Reception", code="reception")
    role.permissions.add(permission)
    UserRole.objects.create(user=user, role=role, branch=branch)

    assert "patients.view" in permissions_for_user(user, branch.id)
    assert "patients.view" not in permissions_for_user(user, other_branch.id)
    assert "patients.view" not in permissions_for_user(user, None)


@pytest.mark.django_db
def test_me_reports_branch_selection_context(api_client, user, clinic, branch, other_branch):
    permission = Permission.objects.create(code="patients.view", description="View patients")
    role = Role.objects.create(clinic=clinic, name="Reception", code="reception")
    role.permissions.add(permission)
    UserRole.objects.create(user=user, role=role, branch=branch)

    login = api_client.post(
        "/api/v1/auth/token/",
        {"email": user.email, "password": PASSWORD},
        format="json",
    )
    me = api_client.get(
        "/api/v1/auth/me/",
        HTTP_AUTHORIZATION=f"Bearer {login.data['access']}",
    )
    assert me.status_code == 200
    assert me.data["permissions"] == ["patients.view"]
    assert me.data["has_role_assignments"] is True
    assert me.data["requires_branch_selection"] is False
    assert me.data["access_block_reason"] is None
    assert me.data["resolved_branch_id"] == str(branch.id)
    assert len(me.data["assigned_branches"]) == 1
    assert me.data["assigned_branches"][0]["id"] == str(branch.id)

    scoped = api_client.get(
        "/api/v1/auth/me/",
        HTTP_AUTHORIZATION=f"Bearer {login.data['access']}",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert scoped.data["permissions"] == ["patients.view"]
    assert scoped.data["requires_branch_selection"] is False
    assert scoped.data["access_block_reason"] is None

    wrong_branch = api_client.get(
        "/api/v1/auth/me/",
        HTTP_AUTHORIZATION=f"Bearer {login.data['access']}",
        HTTP_X_BRANCH_ID=str(other_branch.id),
    )
    assert wrong_branch.data["permissions"] == ["patients.view"]
    assert wrong_branch.data["resolved_branch_id"] == str(branch.id)
    assert wrong_branch.data["requires_branch_selection"] is False


@pytest.mark.django_db
def test_me_reports_missing_role_assignments(api_client, user):
    login = api_client.post(
        "/api/v1/auth/token/",
        {"email": user.email, "password": PASSWORD},
        format="json",
    )
    me = api_client.get(
        "/api/v1/auth/me/",
        HTTP_AUTHORIZATION=f"Bearer {login.data['access']}",
    )
    assert me.status_code == 200
    assert me.data["permissions"] == []
    assert me.data["has_role_assignments"] is False
    assert me.data["requires_branch_selection"] is False
    assert me.data["access_block_reason"] == "no_role"
    assert me.data["assigned_branches"] == []


@pytest.mark.django_db
def test_me_requires_branch_selection_for_multiple_branch_assignments(
    api_client, user, clinic, branch, other_branch
):
    permission = Permission.objects.create(code="patients.view", description="View patients")
    role_a = Role.objects.create(clinic=clinic, name="North", code="north-desk")
    role_b = Role.objects.create(clinic=clinic, name="South", code="south-desk")
    role_a.permissions.add(permission)
    role_b.permissions.add(permission)
    UserRole.objects.create(user=user, role=role_a, branch=branch)
    UserRole.objects.create(user=user, role=role_b, branch=other_branch)

    login = api_client.post(
        "/api/v1/auth/token/",
        {"email": user.email, "password": PASSWORD},
        format="json",
    )
    me = api_client.get(
        "/api/v1/auth/me/",
        HTTP_AUTHORIZATION=f"Bearer {login.data['access']}",
    )
    assert me.data["permissions"] == []
    assert me.data["requires_branch_selection"] is True
    assert me.data["access_block_reason"] == "branch_required"
    assert me.data["resolved_branch_id"] is None
    assert len(me.data["assigned_branches"]) == 2


@pytest.mark.django_db
def test_me_reports_role_without_permissions(api_client, user, clinic):
    role = Role.objects.create(clinic=clinic, name="Empty", code="empty")
    UserRole.objects.create(user=user, role=role)

    login = api_client.post(
        "/api/v1/auth/token/",
        {"email": user.email, "password": PASSWORD},
        format="json",
    )
    me = api_client.get(
        "/api/v1/auth/me/",
        HTTP_AUTHORIZATION=f"Bearer {login.data['access']}",
    )
    assert me.data["permissions"] == []
    assert me.data["has_role_assignments"] is True
    assert me.data["requires_branch_selection"] is False
    assert me.data["access_block_reason"] == "role_empty"


@pytest.mark.django_db
def test_clinic_wide_role_applies_to_every_branch(user, clinic, branch, other_branch):
    permission = Permission.objects.create(code="patients.view", description="View patients")
    role = Role.objects.create(clinic=clinic, name="Reception", code="reception")
    role.permissions.add(permission)
    UserRole.objects.create(user=user, role=role, branch=None)

    assert "patients.view" in permissions_for_user(user, branch.id)
    assert "patients.view" in permissions_for_user(user, other_branch.id)
    assert "patients.view" in permissions_for_user(user, None)


@pytest.mark.django_db
def test_cross_clinic_role_assignment_is_rejected(user, other_clinic):
    role = Role.objects.create(clinic=other_clinic, name="Doctor", code="doctor")
    with pytest.raises(ValidationError):
        UserRole.objects.create(user=user, role=role)


@pytest.mark.django_db
def test_cross_clinic_branch_assignment_is_rejected(user, other_clinic, clinic):
    role = Role.objects.create(clinic=clinic, name="Doctor", code="doctor")
    foreign_branch = Branch.objects.create(clinic=other_clinic, name="Far", code="far")
    with pytest.raises(ValidationError):
        UserRole.objects.create(user=user, role=role, branch=foreign_branch)


@pytest.mark.django_db
@pytest.mark.urls("apps.accounts.tests.test_rbac")
def test_permission_class_denies_then_allows(api_client, user, clinic, branch):
    api_client.force_authenticate(user=user)
    denied = api_client.get("/probe/", HTTP_X_BRANCH_ID=str(branch.id))
    assert denied.status_code == 403
    assert denied.data["code"] == "permission_denied"

    permission = Permission.objects.create(code="patients.view", description="View patients")
    role = Role.objects.create(clinic=clinic, name="Reception", code="reception")
    role.permissions.add(permission)
    UserRole.objects.create(user=user, role=role, branch=branch)

    allowed = api_client.get("/probe/", HTTP_X_BRANCH_ID=str(branch.id))
    assert allowed.status_code == 200
    assert allowed.data == {"ok": True}


@pytest.mark.django_db
def test_foreign_branch_header_is_rejected(api_client, user, other_clinic):
    foreign_branch = Branch.objects.create(clinic=other_clinic, name="Far", code="far")
    login = api_client.post(
        "/api/v1/auth/token/",
        {"email": user.email, "password": PASSWORD},
        format="json",
    )
    response = api_client.get(
        "/api/v1/auth/me/",
        HTTP_AUTHORIZATION=f"Bearer {login.data['access']}",
        HTTP_X_BRANCH_ID=str(foreign_branch.id),
    )
    assert response.status_code == 403
    assert response.data["code"] == "permission_denied"
    assert other_clinic.name not in response.data["detail"]


@pytest.mark.django_db
def test_malformed_branch_header_is_a_validation_error(api_client, user):
    login = api_client.post(
        "/api/v1/auth/token/",
        {"email": user.email, "password": PASSWORD},
        format="json",
    )
    response = api_client.get(
        "/api/v1/auth/me/",
        HTTP_AUTHORIZATION=f"Bearer {login.data['access']}",
        HTTP_X_BRANCH_ID="not-a-uuid",
    )
    assert response.status_code == 400
    assert response.data["code"] == "validation_error"
    assert "X-Branch-Id" in response.data["fields"]
