import re
import uuid
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError

_ALLOWED_CONTENT_TYPES = frozenset(
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
)
_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _media_root() -> Path:
    return Path(settings.MEDIA_ROOT)


def patient_document_relative_path(*, clinic_id, patient_id, file_name: str) -> str:
    safe_name = _SAFE_NAME.sub("_", Path(file_name).name).strip("._") or "document"
    token = uuid.uuid4().hex[:12]
    return f"patient-documents/{clinic_id}/{patient_id}/{token}_{safe_name}"


def resolve_patient_document_path(storage_key: str) -> Path:
    root = _media_root().resolve()
    target = (root / storage_key).resolve()
    if root not in target.parents and target != root:
        raise ValidationError({"storage_key": "Invalid document path."})
    return target


def save_patient_document(*, clinic_id, patient_id, upload) -> tuple[str, str, str, int]:
    content_type = (upload.content_type or "application/octet-stream").strip().lower()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise ValidationError({"file": "This file type is not allowed."})
    byte_size = upload.size or 0
    max_bytes = getattr(settings, "PATIENT_DOCUMENT_MAX_BYTES", 10 * 1024 * 1024)
    if byte_size <= 0:
        raise ValidationError({"file": "The uploaded file is empty."})
    if byte_size > max_bytes:
        raise ValidationError({"file": "The uploaded file is too large."})

    storage_key = patient_document_relative_path(
        clinic_id=clinic_id,
        patient_id=patient_id,
        file_name=upload.name or "document",
    )
    target = resolve_patient_document_path(storage_key)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as handle:
        for chunk in upload.chunks():
            handle.write(chunk)
    return storage_key, Path(upload.name or "document").name, content_type, byte_size
