from django.urls import path

from apps.notifications.views import NotificationDetailView, NotificationListView

urlpatterns = [
    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path("notifications/<uuid:notification_id>/", NotificationDetailView.as_view(), name="notification-detail"),
]
