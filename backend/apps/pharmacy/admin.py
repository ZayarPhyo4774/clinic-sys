from django.contrib import admin

from apps.pharmacy.models import Medicine, MedicineBatch, MedicineCategory, StockTransaction, Supplier


@admin.register(MedicineCategory)
class MedicineCategoryAdmin(admin.ModelAdmin):
    list_display = ("code", "is_active", "clinic")
    readonly_fields = ("created_at", "updated_at", "created_by")

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = ("code", "is_active", "reorder_level", "clinic")
    list_filter = ("clinic", "is_active")
    readonly_fields = ("created_at", "updated_at", "created_by")

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("code", "is_active", "clinic")
    readonly_fields = ("created_at", "updated_at", "created_by")

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MedicineBatch)
class MedicineBatchAdmin(admin.ModelAdmin):
    list_display = ("batch_number", "expiry_date", "quantity_on_hand", "is_active", "branch")
    list_filter = ("clinic", "is_active")
    readonly_fields = ("quantity_on_hand", "created_at", "updated_at", "created_by")

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(StockTransaction)
class StockTransactionAdmin(admin.ModelAdmin):
    list_display = ("kind", "direction", "quantity", "recorded_at", "branch")
    list_filter = ("clinic", "kind")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
