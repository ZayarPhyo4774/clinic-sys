from __future__ import annotations

import csv
import io
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.pharmacy.models import Medicine, MedicineCategory, slug_code

REQUIRED_COLUMNS = ("category_code", "name", "code", "form", "strength", "unit")
OPTIONAL_COLUMNS = ("reorder_level", "category_name", "is_active")
HEADER_ALIASES = {
    "category": "category_code",
}


def _normalize_header(value: str) -> str:
    return (value or "").strip().lower().replace(" ", "_")


def _normalize_row(raw: dict[str, Any]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for key, value in raw.items():
        if key is None:
            continue
        normalized[_normalize_header(key)] = "" if value is None else str(value).strip()
    for source, target in HEADER_ALIASES.items():
        if normalized.get(source) and not normalized.get(target):
            normalized[target] = normalized[source]
    if not normalized.get("category_code") and normalized.get("category_name"):
        normalized["category_code"] = normalized["category_name"]
    return normalized


def _effective_headers(headers: set[str]) -> set[str]:
    effective = set(headers)
    for source, target in HEADER_ALIASES.items():
        if source in effective:
            effective.add(target)
    if "category_name" in effective:
        effective.add("category_code")
    return effective


def parse_medicine_csv(content: bytes) -> list[dict[str, str]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValidationError("CSV file must be UTF-8 encoded.") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValidationError("CSV file is empty.")

    headers = {_normalize_header(name) for name in reader.fieldnames if name}
    missing = [column for column in REQUIRED_COLUMNS if column not in _effective_headers(headers)]
    if missing:
        raise ValidationError(f"Missing required columns: {', '.join(missing)}.")

    rows: list[dict[str, str]] = []
    for raw in reader:
        row = _normalize_row(raw)
        if not any(row.values()):
            continue
        rows.append(row)
    if not rows:
        raise ValidationError("CSV file has no data rows.")
    return rows


def _parse_bool(value: str, *, default: bool) -> bool:
    if not value:
        return default
    lowered = value.strip().lower()
    if lowered in {"1", "true", "yes", "y", "active"}:
        return True
    if lowered in {"0", "false", "no", "n", "inactive"}:
        return False
    raise ValidationError(f"Invalid boolean value: {value}")


def _parse_reorder_level(value: str) -> int:
    if not value:
        return 0
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ValidationError("Reorder level must be a whole number.") from exc
    if parsed < 0:
        raise ValidationError("Reorder level cannot be negative.")
    return parsed


def _resolve_category(
    *,
    clinic_id,
    user,
    category_code: str,
    category_name: str,
    create_missing_categories: bool,
    cache: dict[str, MedicineCategory],
) -> tuple[MedicineCategory, bool]:
    raw_code = category_code.strip() or category_name.strip()
    if not raw_code:
        raise ValidationError("Category code is required.")
    code = slug_code(raw_code)

    cached = cache.get(code)
    if cached is not None:
        return cached, False

    category = MedicineCategory.objects.filter(clinic_id=clinic_id, code=code).first()
    if category is None:
        if not create_missing_categories:
            raise ValidationError(f"Unknown category code: {code}.")
        name = category_name.strip() or code.replace("-", " ").title()
        category = MedicineCategory.objects.create(
            clinic_id=clinic_id,
            code=code,
            name=name,
            created_by=user,
        )
        cache[code] = category
        return category, True
    if not category.is_active:
        raise ValidationError(f"Category {code} is not active.")

    cache[code] = category
    return category, False


def import_medicines(
    *,
    clinic_id,
    user,
    rows: list[dict[str, str]],
    create_missing_categories: bool = True,
    skip_duplicates: bool = True,
) -> dict[str, Any]:
    created = 0
    skipped = 0
    categories_created = 0
    errors: list[dict[str, Any]] = []
    seen_codes: set[str] = set()
    category_cache: dict[str, MedicineCategory] = {}

    for index, row in enumerate(rows, start=2):
        raw_code = (row.get("code") or "").strip()
        code = ""
        try:
            code = slug_code(raw_code)
            if code in seen_codes:
                raise ValidationError("Duplicate code in upload file.")
            seen_codes.add(code)

            if Medicine.objects.filter(clinic_id=clinic_id, code=code).exists():
                if skip_duplicates:
                    skipped += 1
                    continue
                raise ValidationError("A medicine with this code already exists.")

            category, category_was_created = _resolve_category(
                clinic_id=clinic_id,
                user=user,
                category_code=row.get("category_code", ""),
                category_name=row.get("category_name", ""),
                create_missing_categories=create_missing_categories,
                cache=category_cache,
            )
            if category_was_created:
                categories_created += 1

            form = (row.get("form") or "").strip().lower()
            unit = (row.get("unit") or "").strip().lower()
            if form not in Medicine.Form.values:
                raise ValidationError(f"Unknown form: {form or '(empty)'}.")
            if unit not in Medicine.Unit.values:
                raise ValidationError(f"Unknown unit: {unit or '(empty)'}.")

            medicine = Medicine(
                clinic_id=clinic_id,
                category=category,
                name=(row.get("name") or "").strip(),
                code=code,
                form=form,
                strength=(row.get("strength") or "").strip(),
                unit=unit,
                reorder_level=_parse_reorder_level(row.get("reorder_level", "")),
                is_active=_parse_bool(row.get("is_active", ""), default=True),
                created_by=user,
            )
            with transaction.atomic():
                medicine.save()
            created += 1
        except ValidationError as exc:
            message = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
            if getattr(exc, "error_dict", None):
                parts = []
                for field, field_errors in exc.error_dict.items():
                    label = field if field != "__all__" else "row"
                    parts.extend(f"{label}: {error}" for error in field_errors)
                message = "; ".join(parts) or message
            errors.append({"row": index, "code": code or None, "message": message})

    return {
        "created": created,
        "skipped": skipped,
        "categories_created": categories_created,
        "errors": errors,
    }


STOCK_RECEIVE_REQUIRED = ("medicine_code", "batch_number", "expiry_date", "quantity")
STOCK_RECEIVE_ALIASES = {
    "medicine": "medicine_code",
    "code": "medicine_code",
}


def _apply_stock_header_aliases(row: dict[str, str]) -> dict[str, str]:
    for source, target in STOCK_RECEIVE_ALIASES.items():
        if row.get(source) and not row.get(target):
            row[target] = row[source]
    return row


def parse_stock_receive_csv(content: bytes) -> list[dict[str, str]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValidationError("CSV file must be UTF-8 encoded.") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValidationError("CSV file is empty.")

    headers = {_normalize_header(name) for name in reader.fieldnames if name}
    effective = set(headers)
    for source, target in STOCK_RECEIVE_ALIASES.items():
        if source in effective:
            effective.add(target)
    missing = [column for column in STOCK_RECEIVE_REQUIRED if column not in effective]
    if missing:
        raise ValidationError(f"Missing required columns: {', '.join(missing)}.")

    rows: list[dict[str, str]] = []
    for raw in reader:
        row = _apply_stock_header_aliases(_normalize_row(raw))
        if not any(row.values()):
            continue
        rows.append(row)
    if not rows:
        raise ValidationError("CSV file has no data rows.")
    return rows
