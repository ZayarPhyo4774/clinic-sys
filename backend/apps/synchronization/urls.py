from django.urls import path

from apps.synchronization.views import SyncPullView, SyncPushView, SyncStatusView

urlpatterns = [
    path("sync/push/", SyncPushView.as_view(), name="sync-push"),
    path("sync/pull/", SyncPullView.as_view(), name="sync-pull"),
    path("sync/status/", SyncStatusView.as_view(), name="sync-status"),
]
