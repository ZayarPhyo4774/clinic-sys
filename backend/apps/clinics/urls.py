from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.clinics.ccr_views import ClinicCcrSettingsView, DisabilityTypeDetailView, DisabilityTypeListCreateView
from apps.clinics.vital_settings_views import ClinicVitalSettingsView
from apps.clinics.views import (
    BranchViewSet,
    ClinicViewSet,
    DepartmentViewSet,
    DoctorProfileViewSet,
    NurseProfileViewSet,
    StaffViewSet,
)

router = DefaultRouter()
router.register("clinics", ClinicViewSet, basename="clinic")
router.register("branches", BranchViewSet, basename="branch")
router.register("departments", DepartmentViewSet, basename="department")
router.register("staff", StaffViewSet, basename="staff")
router.register("doctor-profiles", DoctorProfileViewSet, basename="doctor-profile")
router.register("nurse-profiles", NurseProfileViewSet, basename="nurse-profile")

urlpatterns = [
    path("clinic-ccr-settings/", ClinicCcrSettingsView.as_view(), name="clinic-ccr-settings"),
    path("clinic-vital-settings/", ClinicVitalSettingsView.as_view(), name="clinic-vital-settings"),
    path("disability-types/", DisabilityTypeListCreateView.as_view(), name="disability-type-list"),
    path("disability-types/<uuid:pk>/", DisabilityTypeDetailView.as_view(), name="disability-type-detail"),
    *router.urls,
]
