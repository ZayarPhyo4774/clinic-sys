from rest_framework.routers import DefaultRouter

from apps.appointments.views import AppointmentViewSet, DoctorScheduleViewSet

router = DefaultRouter()
router.register("doctor-schedules", DoctorScheduleViewSet, basename="doctor-schedule")
router.register("appointments", AppointmentViewSet, basename="appointment")

urlpatterns = router.urls
