from rest_framework.routers import DefaultRouter

from apps.queues.views import QueueEntryViewSet

router = DefaultRouter()
router.register("queue-entries", QueueEntryViewSet, basename="queue-entry")

urlpatterns = router.urls
