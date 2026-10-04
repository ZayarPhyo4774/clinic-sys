from django.contrib import admin

from apps.synchronization.models import SyncChange, SyncOperation


@admin.register(SyncOperation)
class SyncOperationAdmin(admin.ModelAdmin):
    list_display = ("operation_id", "entity_type", "operation", "status", "device_id", "retry_count")
    list_filter = ("status", "entity_type", "clinic")
    readonly_fields = (
        "operation_id",
        "device_id",
        "user",
        "clinic",
        "branch",
        "entity_type",
        "entity_id",
        "operation",
        "payload",
        "payload_hash",
        "created_at",
        "status",
        "retry_count",
        "last_error",
        "server_entity_id",
        "acknowledged_at",
        "received_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SyncChange)
class SyncChangeAdmin(admin.ModelAdmin):
    list_display = ("id", "entity_type", "operation_name", "device_id", "created_at")
    readonly_fields = (
        "operation",
        "clinic",
        "branch",
        "device_id",
        "user",
        "entity_type",
        "entity_id",
        "operation_name",
        "payload",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
