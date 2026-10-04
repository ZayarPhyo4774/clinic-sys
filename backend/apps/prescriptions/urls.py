from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.prescriptions.views import PrescriptionItemViewSet, PrescriptionViewSet

router = DefaultRouter()
router.register("prescriptions", PrescriptionViewSet, basename="prescription")


def _child(viewset, actions):
    return viewset.as_view(actions)


urlpatterns = [
    path(
        "prescriptions/<uuid:prescription_id>/items/",
        _child(PrescriptionItemViewSet, {"get": "list", "post": "create"}),
        name="prescription-item-list",
    ),
    path(
        "prescriptions/<uuid:prescription_id>/items/<uuid:pk>/",
        _child(PrescriptionItemViewSet, {"get": "retrieve"}),
        name="prescription-item-detail",
    ),
    path(
        "prescriptions/<uuid:prescription_id>/items/<uuid:pk>/dispense/",
        _child(PrescriptionItemViewSet, {"post": "dispense"}),
        name="prescription-item-dispense",
    ),
    *router.urls,
]
