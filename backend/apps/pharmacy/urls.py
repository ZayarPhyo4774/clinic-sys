from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.pharmacy.grn_views import BulkStockReceiveView, GoodsReceiptNoteViewSet, StockTransferView
from apps.pharmacy.views import (
    MedicineBatchViewSet,
    MedicineCategoryViewSet,
    MedicineViewSet,
    StockTransactionViewSet,
    SupplierViewSet,
)

router = DefaultRouter()
router.register("medicine-categories", MedicineCategoryViewSet, basename="medicine-category")
router.register("medicines", MedicineViewSet, basename="medicine")
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("medicine-batches", MedicineBatchViewSet, basename="medicine-batch")
router.register("stock-transactions", StockTransactionViewSet, basename="stock-transaction")
router.register("goods-receipts", GoodsReceiptNoteViewSet, basename="goods-receipt")

urlpatterns = router.urls + [
    path("stock-receive/bulk/", BulkStockReceiveView.as_view(), name="stock-receive-bulk"),
    path("stock-transfers/", StockTransferView.as_view(), name="stock-transfer"),
]
