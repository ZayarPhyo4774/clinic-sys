import re
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

_CURRENCY = re.compile(r"^[A-Z]{3}$")


def _lower_code(value: str) -> str:
    return value.strip().lower()


class Clinic(models.Model):
    """Organization boundary."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    code = models.SlugField(max_length=50, unique=True)
    timezone = models.CharField(max_length=64, default="UTC")
    currency = models.CharField(max_length=3, default="USD")
    locale = models.CharField(max_length=20, default="en")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_clinics",
    )

    class Meta:
        ordering = ["name"]

    def clean(self):
        if self.timezone:
            try:
                ZoneInfo(self.timezone)
            except ZoneInfoNotFoundError as exc:
                raise ValidationError({"timezone": "Unknown timezone."}) from exc
        if self.currency and not _CURRENCY.fullmatch(self.currency):
            raise ValidationError({"currency": "Use a 3-letter currency code."})
        if not (self.locale or "").strip():
            raise ValidationError({"locale": "Locale is required."})

    def save(self, *args, **kwargs):
        if self.code:
            self.code = _lower_code(self.code)
        if self.currency:
            self.currency = self.currency.strip().upper()
        if self.locale:
            self.locale = self.locale.strip()
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class Branch(models.Model):
    """A site inside one clinic."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey(Clinic, on_delete=models.PROTECT, related_name="branches")
    name = models.CharField(max_length=200)
    code = models.SlugField(max_length=50)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_branches",
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "code"], name="branch_clinic_code_uniq"),
        ]

    def clean(self):
        if self._state.adding and self.clinic_id and not self.clinic.is_active:
            raise ValidationError({"clinic": "Clinic is not active."})
        if self.clinic_id and self.code:
            conflict = Branch.objects.filter(clinic_id=self.clinic_id, code=self.code)
            if self.pk:
                conflict = conflict.exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError({"code": "A branch with this code already exists."})

    def save(self, *args, **kwargs):
        if self.code:
            self.code = _lower_code(self.code)
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.clinic_id}:{self.code}"


class Department(models.Model):
    """A clinical or operational unit at one branch."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey(Clinic, on_delete=models.PROTECT, related_name="departments")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="departments")
    name = models.CharField(max_length=200)
    code = models.SlugField(max_length=50)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_departments",
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["branch", "code"], name="dept_branch_code_uniq"),
        ]

    def clean(self):
        if self.branch_id and self.clinic_id and self.branch.clinic_id != self.clinic_id:
            raise ValidationError({"branch": "Branch is outside this clinic."})
        if self._state.adding and self.branch_id and not self.branch.is_active:
            raise ValidationError({"branch": "Branch is not active."})
        if self.branch_id and self.code:
            conflict = Department.objects.filter(branch_id=self.branch_id, code=self.code)
            if self.pk:
                conflict = conflict.exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError({"code": "A department with this code already exists in this branch."})

    def save(self, *args, **kwargs):
        if self.code:
            self.code = _lower_code(self.code)
        if self.branch_id:
            self.clinic_id = self.branch.clinic_id
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class Staff(models.Model):
    """Employment of one user at one branch."""

    class StaffType(models.TextChoices):
        DOCTOR = "doctor", "Doctor"
        NURSE = "nurse", "Nurse"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="staff_records",
    )
    clinic = models.ForeignKey(Clinic, on_delete=models.PROTECT, related_name="staff")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="staff")
    department = models.ForeignKey(
        Department,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="staff",
    )
    staff_type = models.CharField(max_length=20, choices=StaffType.choices)
    job_title = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_staff_records",
    )

    class Meta:
        ordering = ["user__full_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "branch", "department"],
                name="staff_assignment_uniq",
                nulls_distinct=False,
            ),
        ]

    def clean(self):
        if self.branch_id:
            if self.clinic_id and self.branch.clinic_id != self.clinic_id:
                raise ValidationError({"branch": "Branch is outside this clinic."})
            if self._state.adding and not self.branch.is_active:
                raise ValidationError({"branch": "Branch is not active."})
        if self.user_id and self.clinic_id and self.user.clinic_id != self.clinic_id:
            raise ValidationError({"user": "User is outside this clinic."})
        if self.department_id:
            if self.branch_id and self.department.branch_id != self.branch_id:
                raise ValidationError({"department": "Department is not in this branch."})
            if self.clinic_id and self.department.clinic_id != self.clinic_id:
                raise ValidationError({"department": "Department is outside this clinic."})
        if self.pk and not self._state.adding:
            if self.staff_type != self.StaffType.DOCTOR and DoctorProfile.objects.filter(staff_id=self.pk).exists():
                raise ValidationError({"staff_type": "Remove the doctor profile before changing type."})
            if self.staff_type != self.StaffType.NURSE and NurseProfile.objects.filter(staff_id=self.pk).exists():
                raise ValidationError({"staff_type": "Remove the nurse profile before changing type."})
        if self.user_id and self.branch_id:
            conflict = Staff.objects.filter(
                user_id=self.user_id,
                branch_id=self.branch_id,
                department_id=self.department_id,
            )
            if self.pk:
                conflict = conflict.exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError({"user": "This staff assignment already exists."})

    def save(self, *args, **kwargs):
        if self.branch_id:
            self.clinic_id = self.branch.clinic_id
        self.full_clean(validate_constraints=False)
        super().save(*args, **kwargs)
        if self.staff_type == self.StaffType.DOCTOR:
            from apps.clinics.services import ensure_doctor_profile

            ensure_doctor_profile(self)

    def __str__(self) -> str:
        return f"{self.user_id}:{self.staff_type}"


class DoctorProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    staff = models.OneToOneField(Staff, on_delete=models.PROTECT, related_name="doctor_profile")
    license_number = models.CharField(max_length=64)
    specialty = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_doctor_profiles",
    )

    class Meta:
        ordering = ["specialty", "license_number"]

    def clean(self):
        if not self.staff_id:
            return
        if self.staff.staff_type != Staff.StaffType.DOCTOR:
            raise ValidationError({"staff": "Staff member must be a doctor."})
        if NurseProfile.objects.filter(staff_id=self.staff_id).exists():
            raise ValidationError({"staff": "Staff member already has a nurse profile."})
        if not (self.license_number or "").strip():
            raise ValidationError({"license_number": "License number is required."})
        if not (self.specialty or "").strip():
            raise ValidationError({"specialty": "Specialty is required."})
        conflict = DoctorProfile.objects.filter(
            staff__clinic_id=self.staff.clinic_id,
            license_number=self.license_number.strip(),
        )
        if self.pk:
            conflict = conflict.exclude(pk=self.pk)
        if conflict.exists():
            raise ValidationError({"license_number": "License is already used in this clinic."})

    def save(self, *args, **kwargs):
        if self.license_number:
            self.license_number = self.license_number.strip()
        if self.specialty:
            self.specialty = self.specialty.strip()
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.license_number


class NurseProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    staff = models.OneToOneField(Staff, on_delete=models.PROTECT, related_name="nurse_profile")
    license_number = models.CharField(max_length=64)
    grade = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_nurse_profiles",
    )

    class Meta:
        ordering = ["license_number"]

    def clean(self):
        if not self.staff_id:
            return
        if self.staff.staff_type != Staff.StaffType.NURSE:
            raise ValidationError({"staff": "Staff member must be a nurse."})
        if DoctorProfile.objects.filter(staff_id=self.staff_id).exists():
            raise ValidationError({"staff": "Staff member already has a doctor profile."})
        if not (self.license_number or "").strip():
            raise ValidationError({"license_number": "License number is required."})
        conflict = NurseProfile.objects.filter(
            staff__clinic_id=self.staff.clinic_id,
            license_number=self.license_number.strip(),
        )
        if self.pk:
            conflict = conflict.exclude(pk=self.pk)
        if conflict.exists():
            raise ValidationError({"license_number": "License is already used in this clinic."})

    def save(self, *args, **kwargs):
        if self.license_number:
            self.license_number = self.license_number.strip()
        if self.grade:
            self.grade = self.grade.strip()
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.license_number
