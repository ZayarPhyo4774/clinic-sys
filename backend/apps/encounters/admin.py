from django.contrib import admin

from apps.encounters.models import (
    ClinicalNote,
    Diagnosis,
    Encounter,
    FollowUp,
    Symptom,
    TreatmentPlan,
    VitalSign,
)


class _ClinicalAdmin(admin.ModelAdmin):
    list_display = ("status", "recorded_at", "branch")
    list_filter = ("clinic", "status")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Encounter)
class EncounterAdmin(admin.ModelAdmin):
    list_display = ("status", "started_at", "branch")
    list_filter = ("clinic", "status")
    readonly_fields = (
        "appointment",
        "clinic",
        "branch",
        "patient",
        "doctor",
        "status",
        "started_at",
        "started_by",
        "completed_at",
        "completed_by",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(VitalSign, _ClinicalAdmin)
admin.site.register(Symptom, _ClinicalAdmin)
admin.site.register(Diagnosis, _ClinicalAdmin)
admin.site.register(ClinicalNote, _ClinicalAdmin)
admin.site.register(TreatmentPlan, _ClinicalAdmin)
admin.site.register(FollowUp, _ClinicalAdmin)
