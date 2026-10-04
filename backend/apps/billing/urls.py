from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.billing.views import InvoiceItemViewSet, InvoiceViewSet, PaymentMethodViewSet, PaymentViewSet

router = DefaultRouter()
router.register("payment-methods", PaymentMethodViewSet, basename="payment-method")
router.register("invoices", InvoiceViewSet, basename="invoice")


def _child(viewset, actions):
    return viewset.as_view(actions)


urlpatterns = [
    path(
        "invoices/<uuid:invoice_id>/items/",
        _child(InvoiceItemViewSet, {"get": "list", "post": "create"}),
        name="invoice-item-list",
    ),
    path(
        "invoices/<uuid:invoice_id>/payments/",
        _child(PaymentViewSet, {"get": "list", "post": "create"}),
        name="invoice-payment-list",
    ),
    *router.urls,
]
