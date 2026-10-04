from rest_framework.routers import DefaultRouter

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

urlpatterns = router.urls
