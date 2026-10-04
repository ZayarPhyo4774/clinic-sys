import uuid

from rest_framework.exceptions import ValidationError

from apps.accounts.permissions import extract_branch_id


def apply_clinic_scope(queryset, user, lookup: str):
    if user.is_superuser and not user.clinic_id:
        return queryset
    if not user.clinic_id:
        return queryset.none()
    return queryset.filter(**{lookup: user.clinic_id})


def parse_bool(value: str | None, field: str) -> bool | None:
    if value is None or value == "":
        return None
    lowered = value.lower()
    if lowered not in {"true", "false"}:
        raise ValidationError({field: "Must be true or false."})
    return lowered == "true"


def parse_uuid(value: str | None, field: str) -> uuid.UUID | None:
    if value is None or value == "":
        return None
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise ValidationError({field: "Must be a UUID."}) from exc


def header_branch_id(request) -> uuid.UUID | None:
    return extract_branch_id(request)
