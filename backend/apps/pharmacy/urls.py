from rest_framework.routers import DefaultRouter

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

urlpatterns = router.urls
