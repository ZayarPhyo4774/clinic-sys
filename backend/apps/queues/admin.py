from django.contrib import admin

from apps.queues.models import QueueEntry


@admin.register(QueueEntry)
class QueueEntryAdmin(admin.ModelAdmin):
    list_display = ("service_date", "position", "status", "branch")
    list_filter = ("clinic", "status")
    readonly_fields = (
        "appointment",
        "clinic",
        "branch",
        "patient",
        "doctor",
        "service_date",
        "position",
        "status",
        "called_at",
        "started_at",
        "completed_at",
        "created_at",
        "updated_at",
        "created_by",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
