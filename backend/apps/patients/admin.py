from django.contrib import admin

from apps.patients.models import (
    Patient,
    PatientAddress,
    PatientAllergy,
    PatientContact,
    PatientDocument,
    PatientMedicalHistory,
)


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ("patient_number", "is_active", "clinic", "branch")
    list_filter = ("clinic", "is_active")
    search_fields = ("patient_number",)
    readonly_fields = ("patient_number", "version", "created_at", "updated_at", "created_by")

    def has_delete_permission(self, request, obj=None):
        return False


class _ClinicalAdmin(admin.ModelAdmin):
    list_display = ("patient", "status", "created_at")
    readonly_fields = (
        "patient",
        "clinic",
        "branch",
        "status",
        "supersedes",
        "recorded_at",
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


@admin.register(PatientAllergy)
class PatientAllergyAdmin(_ClinicalAdmin):
    readonly_fields = _ClinicalAdmin.readonly_fields + ("substance", "reaction", "severity")


@admin.register(PatientMedicalHistory)
class PatientMedicalHistoryAdmin(_ClinicalAdmin):
    readonly_fields = _ClinicalAdmin.readonly_fields + ("title", "details", "onset_date")


@admin.register(PatientContact)
class PatientContactAdmin(admin.ModelAdmin):
    list_display = ("patient", "kind", "is_primary")
    readonly_fields = ("created_at", "updated_at", "created_by")


@admin.register(PatientAddress)
class PatientAddressAdmin(admin.ModelAdmin):
    list_display = ("patient", "is_primary")
    readonly_fields = ("created_at", "updated_at", "created_by")


@admin.register(PatientDocument)
class PatientDocumentAdmin(admin.ModelAdmin):
    list_display = ("patient", "document_type", "created_at")
    readonly_fields = ("created_at", "updated_at", "created_by")
