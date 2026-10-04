from django.contrib import admin

from apps.clinics.models import Branch, Clinic, Department, DoctorProfile, NurseProfile, Staff


@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "timezone", "is_active")
    search_fields = ("name", "code")


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "clinic", "is_active")
    list_filter = ("clinic", "is_active")
    search_fields = ("name", "code")


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "branch", "is_active")
    list_filter = ("clinic", "is_active")
    search_fields = ("name", "code")


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ("user", "staff_type", "branch", "department", "is_active")
    list_filter = ("clinic", "staff_type", "is_active")
    search_fields = ("user__email", "user__full_name", "job_title")


@admin.register(DoctorProfile)
class DoctorProfileAdmin(admin.ModelAdmin):
    list_display = ("license_number", "specialty", "staff")
    search_fields = ("license_number", "specialty")


@admin.register(NurseProfile)
class NurseProfileAdmin(admin.ModelAdmin):
    list_display = ("license_number", "grade", "staff")
    search_fields = ("license_number", "grade")
