from django.urls import path

from apps.accounts.operator_views import (
    OperatorAssignmentDetailView,
    OperatorAssignmentView,
    OperatorBranchDetailView,
    OperatorBranchView,
    OperatorClinicDetailView,
    OperatorClinicDefaultRoleInstallView,
    OperatorClinicView,
    OperatorPermissionView,
    OperatorRoleDetailView,
    OperatorRoleView,
    OperatorUserDetailView,
    OperatorUserView,
)

urlpatterns = [
    path("operator/clinics/", OperatorClinicView.as_view(), name="operator-clinics"),
    path("operator/clinics/<uuid:clinic_id>/", OperatorClinicDetailView.as_view(), name="operator-clinic-detail"),
    path(
        "operator/clinics/<uuid:clinic_id>/default-roles/",
        OperatorClinicDefaultRoleInstallView.as_view(),
        name="operator-clinic-default-roles",
    ),
    path("operator/branches/", OperatorBranchView.as_view(), name="operator-branches"),
    path("operator/branches/<uuid:branch_id>/", OperatorBranchDetailView.as_view(), name="operator-branch-detail"),
    path("operator/permissions/", OperatorPermissionView.as_view(), name="operator-permissions"),
    path("operator/roles/", OperatorRoleView.as_view(), name="operator-roles"),
    path("operator/roles/<uuid:role_id>/", OperatorRoleDetailView.as_view(), name="operator-role-detail"),
    path("operator/users/", OperatorUserView.as_view(), name="operator-users"),
    path("operator/users/<uuid:user_id>/", OperatorUserDetailView.as_view(), name="operator-user-detail"),
    path("operator/assignments/", OperatorAssignmentView.as_view(), name="operator-assignments"),
    path(
        "operator/assignments/<uuid:assignment_id>/",
        OperatorAssignmentDetailView.as_view(),
        name="operator-assignment-detail",
    ),
]
