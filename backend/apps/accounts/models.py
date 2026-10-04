import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

from apps.accounts.managers import UserManager

_PERMISSION_CODE = RegexValidator(
    regex=r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$",
    message="Use dotted lowercase codes such as patients.view.",
)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    clinic = models.ForeignKey(
        "clinics.Clinic",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="users",
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        ordering = ["email"]

    def __str__(self) -> str:
        return self.email


class Permission(models.Model):
    """Application permission. This is not Django's built-in auth.Permission."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=100, unique=True, validators=[_PERMISSION_CODE])
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["code"]

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.code


class Role(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey(
        "clinics.Clinic",
        on_delete=models.PROTECT,
        related_name="roles",
    )
    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=50)
    permissions = models.ManyToManyField(Permission, related_name="roles", blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "code"], name="role_clinic_code_uniq"),
        ]

    def __str__(self) -> str:
        return f"{self.clinic.code}:{self.code}"


class UserRole(models.Model):
    """Assigns a clinic role to a user, optionally limited to one branch.

    A null branch means the role applies to every branch of the user's clinic.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="role_assignments")
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="assignments")
    branch = models.ForeignKey(
        "clinics.Branch",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="role_assignments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "role", "branch"],
                name="user_role_branch_uniq",
                nulls_distinct=False,
            ),
        ]

    def clean(self):
        errors = {}
        if self.user_id and self.role_id and self.user.clinic_id != self.role.clinic_id:
            errors["role"] = "Role is outside the user's clinic."
        if self.branch_id and self.user_id and self.branch.clinic_id != self.user.clinic_id:
            errors["branch"] = "Branch is outside the user's clinic."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.user_id}:{self.role_id}"
