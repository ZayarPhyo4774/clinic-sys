from django.contrib import admin

from apps.appointments.models import Appointment, DoctorSchedule


@admin.register(DoctorSchedule)
class DoctorScheduleAdmin(admin.ModelAdmin):
    list_display = ("weekday", "start_time", "end_time", "is_active", "branch")
    list_filter = ("clinic", "is_active", "weekday")
    readonly_fields = ("created_at", "updated_at", "created_by")

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("status", "starts_at", "branch")
    list_filter = ("clinic", "status")
    readonly_fields = (
        "clinic",
        "branch",
        "patient",
        "doctor",
        "schedule",
        "starts_at",
        "ends_at",
        "status",
        "visit_reason",
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
