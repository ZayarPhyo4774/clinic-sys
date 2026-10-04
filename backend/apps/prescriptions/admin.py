from django.contrib import admin

from apps.prescriptions.models import Prescription, PrescriptionItem


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = ("status", "created_at", "branch")
    list_filter = ("clinic", "status")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PrescriptionItem)
class PrescriptionItemAdmin(admin.ModelAdmin):
    list_display = ("quantity", "quantity_dispensed", "branch", "created_at")
    list_filter = ("clinic",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
