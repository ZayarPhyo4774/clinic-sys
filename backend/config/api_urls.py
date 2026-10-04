from django.urls import include, path

from apps.accounts.views import EmailTokenObtainPairView, MeView, RefreshView
from config.health import HealthView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("auth/token/", EmailTokenObtainPairView.as_view(), name="token-obtain"),
    path("auth/token/refresh/", RefreshView.as_view(), name="token-refresh"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("", include("apps.accounts.operator_urls")),
    path("", include("apps.accounts.admin_urls")),
    path("", include("apps.audit.urls")),
    path("", include("apps.reports.urls")),
    path("", include("apps.clinics.urls")),
    path("", include("apps.patients.urls")),
    path("", include("apps.appointments.urls")),
    path("", include("apps.queues.urls")),
    path("", include("apps.encounters.urls")),
    path("", include("apps.pharmacy.urls")),
    path("", include("apps.prescriptions.urls")),
    path("", include("apps.laboratory.urls")),
    path("", include("apps.billing.urls")),
    path("", include("apps.synchronization.urls")),
    path("", include("apps.notifications.urls")),
]
