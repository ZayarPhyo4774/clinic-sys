from django.contrib import admin

from apps.audit.models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("created_at", "action", "entity_type", "actor", "clinic")
    list_filter = ("action", "entity_type")
    readonly_fields = (
        "id",
        "actor",
        "action",
        "entity_type",
        "entity_id",
        "clinic",
        "branch",
        "device_id",
        "metadata",
        "ip_address",
        "created_at",
    )
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
