from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.laboratory.views import LabOrderItemViewSet, LabOrderViewSet, LabResultViewSet, LabTestViewSet

router = DefaultRouter()
router.register("lab-tests", LabTestViewSet, basename="lab-test")
router.register("lab-orders", LabOrderViewSet, basename="lab-order")


def _child(viewset, actions):
    return viewset.as_view(actions)


urlpatterns = [
    path(
        "lab-orders/<uuid:order_id>/items/",
        _child(LabOrderItemViewSet, {"get": "list", "post": "create"}),
        name="lab-order-item-list",
    ),
    path(
        "lab-orders/<uuid:order_id>/items/<uuid:pk>/",
        _child(LabOrderItemViewSet, {"get": "retrieve"}),
        name="lab-order-item-detail",
    ),
    path(
        "lab-orders/<uuid:order_id>/items/<uuid:item_id>/results/",
        _child(LabResultViewSet, {"get": "list", "post": "create"}),
        name="lab-result-list",
    ),
    path(
        "lab-orders/<uuid:order_id>/items/<uuid:item_id>/results/<uuid:pk>/",
        _child(LabResultViewSet, {"get": "retrieve"}),
        name="lab-result-detail",
    ),
    path(
        "lab-orders/<uuid:order_id>/items/<uuid:item_id>/results/<uuid:pk>/verify/",
        _child(LabResultViewSet, {"post": "verify"}),
        name="lab-result-verify",
    ),
    *router.urls,
]
