from django.urls import path

from apps.accounts.admin_views import (
    ClinicAssignmentDetailView,
    ClinicAssignmentView,
    ClinicPermissionCatalogView,
    ClinicRoleDetailView,
    ClinicRoleView,
    ClinicUserDetailView,
    ClinicUserView,
)

urlpatterns = [
    path("admin/permissions/", ClinicPermissionCatalogView.as_view(), name="admin-permissions"),
    path("admin/users/", ClinicUserView.as_view(), name="admin-users"),
    path("admin/users/<uuid:user_id>/", ClinicUserDetailView.as_view(), name="admin-user-detail"),
    path("admin/roles/", ClinicRoleView.as_view(), name="admin-roles"),
    path("admin/roles/<uuid:role_id>/", ClinicRoleDetailView.as_view(), name="admin-role-detail"),
    path("admin/assignments/", ClinicAssignmentView.as_view(), name="admin-assignments"),
    path("admin/assignments/<uuid:assignment_id>/", ClinicAssignmentDetailView.as_view(), name="admin-assignment-detail"),
]
