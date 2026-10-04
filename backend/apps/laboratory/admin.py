from django.contrib import admin

from apps.laboratory.models import LabOrder, LabOrderItem, LabResult, LabTest


@admin.register(LabTest)
class LabTestAdmin(admin.ModelAdmin):
    list_display = ("code", "is_active", "clinic")
    list_filter = ("clinic", "is_active")
    readonly_fields = ("created_at", "updated_at", "created_by")

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(LabOrder)
class LabOrderAdmin(admin.ModelAdmin):
    list_display = ("status", "created_at", "branch")
    list_filter = ("clinic", "status")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(LabOrderItem)
class LabOrderItemAdmin(admin.ModelAdmin):
    list_display = ("created_at", "branch")
    list_filter = ("clinic",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(LabResult)
class LabResultAdmin(admin.ModelAdmin):
    list_display = ("status", "recorded_at", "branch")
    list_filter = ("clinic", "status")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
