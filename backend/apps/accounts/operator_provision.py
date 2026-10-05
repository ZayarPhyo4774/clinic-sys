"""Operator helpers for clinic onboarding and unified person provisioning."""

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction

from apps.accounts.default_roles import ensure_permission_catalog, install_default_roles
from apps.accounts.models import Role, User, UserRole
from apps.clinics.models import Branch, Clinic, Staff
from apps.clinics.services import ensure_doctor_profile

CLINICAL_ROLE_CODES = frozenset(
    {
        "solo-practitioner",
        "doctor",
        "nurse",
        "pharmacist",
        "lab-technician",
    }
)

STAFF_TYPE_BY_ROLE = {
    "solo-practitioner": Staff.StaffType.DOCTOR,
    "doctor": Staff.StaffType.DOCTOR,
    "nurse": Staff.StaffType.NURSE,
    "pharmacist": Staff.StaffType.OTHER,
    "lab-technician": Staff.StaffType.OTHER,
}


def clinic_setup_status(clinic_id) -> dict:
    from apps.accounts.models import Permission

    clinic_users = User.objects.filter(clinic_id=clinic_id, is_superuser=False)
    return {
        "clinic_id": str(clinic_id),
        "has_branch": Branch.objects.filter(clinic_id=clinic_id).exists(),
        "has_roles": Role.objects.filter(clinic_id=clinic_id).exists(),
        "has_permissions": Permission.objects.exists(),
        "has_user": clinic_users.exists(),
        "has_assignment": UserRole.objects.filter(user__clinic_id=clinic_id).exists(),
        "branch_count": Branch.objects.filter(clinic_id=clinic_id).count(),
        "role_count": Role.objects.filter(clinic_id=clinic_id).count(),
        "user_count": clinic_users.count(),
        "assignment_count": UserRole.objects.filter(user__clinic_id=clinic_id).count(),
        "permission_count": Permission.objects.count(),
    }


def ensure_clinic_defaults(clinic: Clinic) -> dict:
    created_permissions = ensure_permission_catalog()
    role_result = install_default_roles(clinic)
    return {"created_permissions": created_permissions, **role_result}


def provision_clinic_person(
    clinic: Clinic,
    *,
    email: str,
    full_name: str,
    password: str,
    role_code: str,
    branch_id=None,
    create_staff: bool = False,
    staff_type: str | None = None,
    created_by=None,
) -> dict:
    email = email.strip()
    full_name = full_name.strip()
    if not email:
        raise DjangoValidationError({"email": "Email is required."})
    if not full_name:
        raise DjangoValidationError({"full_name": "Full name is required."})
    if not role_code:
        raise DjangoValidationError({"role_code": "Role is required."})

    if not Role.objects.filter(clinic=clinic).exists():
        ensure_clinic_defaults(clinic)

    try:
        role = Role.objects.get(clinic=clinic, code=role_code)
    except Role.DoesNotExist as exc:
        raise DjangoValidationError({"role_code": "Role not found for this clinic."}) from exc

    branch = None
    if branch_id:
        try:
            branch = Branch.objects.get(pk=branch_id, clinic=clinic)
        except Branch.DoesNotExist as exc:
            raise DjangoValidationError({"branch": "Branch not found for this clinic."}) from exc

    user = User(email=email, full_name=full_name, clinic=clinic, is_active=True)
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise DjangoValidationError({"password": exc.messages}) from exc

    effective_staff_type = staff_type or STAFF_TYPE_BY_ROLE.get(role_code)
    if create_staff and not branch:
        raise DjangoValidationError({"branch": "Branch is required when creating a staff record."})
    if create_staff and not effective_staff_type:
        raise DjangoValidationError({"staff_type": "Staff type is required for this role."})

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                email=email,
                password=password,
                full_name=full_name,
                clinic=clinic,
            )
            assignment = UserRole(user=user, role=role, branch=branch)
            assignment.save()

            staff = None
            if create_staff and branch and effective_staff_type:
                staff = Staff(
                    user=user,
                    clinic=clinic,
                    branch=branch,
                    staff_type=effective_staff_type,
                    created_by=created_by,
                )
                staff.save()
                if effective_staff_type == Staff.StaffType.DOCTOR:
                    ensure_doctor_profile(staff, created_by=created_by)
    except IntegrityError as exc:
        message = str(exc)
        if "email" in message.lower() or "accounts_user" in message.lower():
            raise DjangoValidationError({"email": "A user with this email already exists."}) from exc
        if "staff_assignment_uniq" in message.lower():
            raise DjangoValidationError({"staff_type": "This staff assignment already exists."}) from exc
        raise DjangoValidationError({"non_field_errors": "Could not provision this person."}) from exc

    return {
        "user_id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "assignment_id": str(assignment.id),
        "role_code": role.code,
        "role_name": role.name,
        "branch_id": str(branch.id) if branch else None,
        "staff_id": str(staff.id) if staff else None,
        "staff_created": staff is not None,
        "is_clinical_role": role.code in CLINICAL_ROLE_CODES,
    }
