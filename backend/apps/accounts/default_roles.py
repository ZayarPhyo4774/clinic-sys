"""Default role templates for new clinic onboarding."""

from dataclasses import dataclass

from apps.accounts.catalog import MODULE_PERMISSIONS
from apps.accounts.models import Permission, Role


@dataclass(frozen=True)
class DefaultRoleTemplate:
    code: str
    name: str
    permissions: tuple[str, ...]


DEFAULT_ROLE_TEMPLATES: tuple[DefaultRoleTemplate, ...] = (
    DefaultRoleTemplate(
        code="clinic-admin",
        name="Clinic Admin",
        permissions=tuple(code for code, _description in MODULE_PERMISSIONS),
    ),
    DefaultRoleTemplate(
        code="branch-manager",
        name="Branch Manager",
        permissions=(
            "branches.view",
            "departments.view",
            "staff.view",
            "patients.view",
            "patients.create",
            "patients.update",
            "appointments.view",
            "appointments.create",
            "appointments.update",
            "appointments.cancel",
            "encounters.view",
            "prescriptions.view",
            "laboratory.view",
            "pharmacy.view",
            "billing.view",
            "reports.view",
            "notifications.view",
        ),
    ),
    DefaultRoleTemplate(
        code="receptionist",
        name="Receptionist",
        permissions=(
            "patients.view",
            "patients.create",
            "patients.update",
            "staff.view",
            "appointments.view",
            "appointments.create",
            "appointments.update",
            "appointments.cancel",
            "billing.view",
            "billing.create",
            "notifications.view",
        ),
    ),
    DefaultRoleTemplate(
        code="solo-practitioner",
        name="Solo Practitioner",
        permissions=(
            "patients.view",
            "patients.create",
            "patients.update",
            "appointments.view",
            "appointments.create",
            "appointments.update",
            "appointments.cancel",
            "encounters.view",
            "encounters.create",
            "encounters.update",
            "prescriptions.view",
            "prescriptions.create",
            "pharmacy.view",
            "pharmacy.manage",
            "laboratory.view",
            "laboratory.manage",
            "billing.view",
            "billing.create",
            "billing.payment",
            "reports.view",
            "notifications.view",
            "branches.view",
            "staff.view",
        ),
    ),
    DefaultRoleTemplate(
        code="doctor",
        name="Doctor",
        permissions=(
            "patients.view",
            "patients.create",
            "patients.update",
            "staff.view",
            "appointments.view",
            "appointments.create",
            "appointments.update",
            "encounters.view",
            "encounters.create",
            "encounters.update",
            "prescriptions.view",
            "prescriptions.create",
            "laboratory.view",
            "laboratory.manage",
            "pharmacy.view",
            "reports.view",
            "notifications.view",
        ),
    ),
    DefaultRoleTemplate(
        code="nurse",
        name="Nurse",
        permissions=(
            "patients.view",
            "patients.update",
            "appointments.view",
            "appointments.update",
            "encounters.view",
            "encounters.create",
            "laboratory.view",
            "laboratory.manage",
            "notifications.view",
        ),
    ),
    DefaultRoleTemplate(
        code="pharmacist",
        name="Pharmacist",
        permissions=(
            "patients.view",
            "prescriptions.view",
            "pharmacy.view",
            "pharmacy.manage",
            "notifications.view",
        ),
    ),
    DefaultRoleTemplate(
        code="lab-technician",
        name="Lab Technician",
        permissions=(
            "patients.view",
            "laboratory.view",
            "laboratory.manage",
            "notifications.view",
        ),
    ),
    DefaultRoleTemplate(
        code="cashier",
        name="Cashier",
        permissions=(
            "patients.view",
            "appointments.view",
            "billing.view",
            "billing.create",
            "billing.payment",
            "notifications.view",
        ),
    ),
    DefaultRoleTemplate(
        code="auditor",
        name="Auditor",
        permissions=(
            "audit.view",
            "reports.view",
            "notifications.view",
        ),
    ),
)


def ensure_permission_catalog() -> int:
    created = 0
    for code, description in MODULE_PERMISSIONS:
        _row, was_created = Permission.objects.get_or_create(
            code=code,
            defaults={"description": description},
        )
        if was_created:
            created += 1
    return created


def _template_permission_codes() -> set[str]:
    return {code for template in DEFAULT_ROLE_TEMPLATES for code in template.permissions}


def preview_default_roles(clinic, *, update_existing: bool = False) -> dict:
    roles = {
        row.code: row
        for row in Role.objects.filter(clinic=clinic).prefetch_related("permissions")
    }
    existing_codes_map = {
        code: set(role.permissions.values_list("code", flat=True))
        for code, role in roles.items()
    }
    catalog_codes = set(
        Permission.objects.filter(code__in=_template_permission_codes()).values_list("code", flat=True)
    )

    items = []
    created = 0
    updated = 0
    skipped = 0
    unchanged = 0
    for template in DEFAULT_ROLE_TEMPLATES:
        target_codes = set(template.permissions)
        existing = roles.get(template.code)
        if existing is None:
            status = "create"
            created += 1
            existing_name = None
            existing_codes = set()
        else:
            existing_name = existing.name
            existing_codes = existing_codes_map.get(template.code, set())
            if update_existing:
                if existing_name == template.name and existing_codes == target_codes:
                    status = "unchanged"
                    unchanged += 1
                else:
                    status = "update"
                    updated += 1
            else:
                status = "skip"
                skipped += 1

        items.append(
            {
                "code": template.code,
                "name": template.name,
                "existing_name": existing_name,
                "status": status,
                "added_permissions": sorted(target_codes - existing_codes),
                "removed_permissions": sorted(existing_codes - target_codes),
            }
        )

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "unchanged": unchanged,
        "total_templates": len(DEFAULT_ROLE_TEMPLATES),
        "missing_permission_codes": sorted(_template_permission_codes() - catalog_codes),
        "items": items,
    }


def install_default_roles(clinic, *, update_existing: bool = False) -> dict[str, int]:
    permission_rows = Permission.objects.filter(code__in=_template_permission_codes())
    permission_map = {row.code: row for row in permission_rows}
    created = 0
    updated = 0
    skipped = 0

    for template in DEFAULT_ROLE_TEMPLATES:
        permissions = [permission_map[code] for code in template.permissions if code in permission_map]
        existing = Role.objects.filter(clinic=clinic, code=template.code).first()

        if existing:
            if update_existing:
                existing.name = template.name
                existing.save(update_fields=["name"])
                existing.permissions.set(permissions)
                updated += 1
            else:
                skipped += 1
            continue

        role = Role.objects.create(clinic=clinic, name=template.name, code=template.code)
        role.permissions.set(permissions)
        created += 1

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "total_templates": len(DEFAULT_ROLE_TEMPLATES),
    }
