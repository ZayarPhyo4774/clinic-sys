from django.urls import path

from apps.audit.views import AuditEventView

urlpatterns = [
    path("audit-events/", AuditEventView.as_view(), name="audit-events"),
]
