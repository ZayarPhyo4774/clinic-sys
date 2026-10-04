import pytest

from apps.accounts.models import Permission, Role, User, UserRole
from apps.notifications.models import Notification
from testing import PASSWORD


def _grant(user, code: str, clinic, branch=None):
    permission = Permission.objects.get_or_create(code=code, defaults={"description": code})[0]
    role = Role.objects.create(clinic=clinic, name=code, code=code.replace(".", "_"))
    role.permissions.add(permission)
    UserRole.objects.create(user=user, role=role, branch=branch)


@pytest.mark.django_db
def test_user_lists_and_marks_notifications_read(api_client, user, clinic, branch):
    _grant(user, "notifications.view", clinic, branch)
    Notification.objects.create(
        clinic=clinic,
        branch=branch,
        recipient=user,
        title="Low stock",
        message="Paracetamol is below reorder level.",
    )
    api_client.force_authenticate(user=user)
    listed = api_client.get("/api/v1/notifications/", HTTP_X_BRANCH_ID=str(branch.id))
    assert listed.status_code == 200
    assert listed.data["results"][0]["title"] == "Low stock"
    notification_id = listed.data["results"][0]["id"]

    marked = api_client.patch(
        f"/api/v1/notifications/{notification_id}/",
        {"read": True},
        format="json",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert marked.status_code == 200
    assert marked.data["read_at"] is not None


@pytest.mark.django_db
def test_role_assignment_creates_notification(api_client, user, clinic, branch):
    _grant(user, "roles.manage", clinic, branch)
    Permission.objects.get_or_create(code="patients.view", defaults={"description": "View patients"})
    api_client.force_authenticate(user=user)
    staff = User.objects.create_user(
        email="notify@example.com",
        password=PASSWORD,
        full_name="Notify Me",
        clinic=clinic,
    )
    role = Role.objects.create(clinic=clinic, name="Viewer", code="viewer")
    role.permissions.add(Permission.objects.get(code="patients.view"))
    response = api_client.post(
        "/api/v1/admin/assignments/",
        {"user": str(staff.id), "role": str(role.id), "branch": str(branch.id)},
        format="json",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert response.status_code == 201
    assert Notification.objects.filter(recipient=staff, kind="assignment").exists()
