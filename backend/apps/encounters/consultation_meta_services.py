from django.core.exceptions import ValidationError
from django.db import transaction

from apps.clinics.ccr_services import get_ccr_settings
from apps.encounters.models import Diagnosis, Encounter, EncounterConsultationMeta, TreatmentPlan


def suggest_patient_status(*, patient_id, clinic_id, encounter_id) -> str:
    prior = (
        Encounter.objects.filter(
            patient_id=patient_id,
            clinic_id=clinic_id,
            status=Encounter.Status.COMPLETED,
        )
        .exclude(pk=encounter_id)
        .exists()
    )
    return EncounterConsultationMeta.PatientStatus.OLD if prior else EncounterConsultationMeta.PatientStatus.NEW


def get_or_create_consultation_meta(encounter: Encounter, *, user=None) -> EncounterConsultationMeta:
    meta, created = EncounterConsultationMeta.objects.get_or_create(encounter=encounter)
    if created and not meta.patient_status:
        meta.patient_status = suggest_patient_status(
            patient_id=encounter.patient_id,
            clinic_id=encounter.clinic_id,
            encounter_id=encounter.id,
        )
        if user is not None:
            meta.updated_by = user
        meta.save(update_fields=["patient_status", "updated_by", "updated_at"])
    return meta


def treatment_text_for_encounter(encounter: Encounter) -> str:
    meta = getattr(encounter, "consultation_meta", None)
    if meta is not None and (meta.treatment or "").strip():
        return meta.treatment.strip()
    plans = TreatmentPlan.objects.filter(encounter=encounter, status="active").order_by("recorded_at")
    parts = []
    for plan in plans:
        line = plan.title.strip()
        if plan.details.strip():
            line = f"{line}: {plan.details.strip()}"
        parts.append(line)
    return "; ".join(parts)


def validate_consultation_for_complete(encounter: Encounter, meta: EncounterConsultationMeta | None) -> None:
    settings = get_ccr_settings(encounter.clinic_id)
    required = settings.required_fields or []
    if not required:
        return

    errors: dict[str, str] = {}
    meta = meta or get_or_create_consultation_meta(encounter)

    if "diagnosis" in required:
        has_diagnosis = Diagnosis.objects.filter(encounter=encounter, status="active").exists()
        if not has_diagnosis:
            errors["diagnosis"] = "Record at least one diagnosis before completing."

    if "patient_status" in required and not meta.patient_status:
        errors["patient_status"] = "Select whether the patient is new or returning."

    if "treatment" in required and not treatment_text_for_encounter(encounter):
        errors["treatment"] = "Record treatment before completing."

    if "remark" in required and not (meta.remark or "").strip():
        errors["remark"] = "Remark is required before completing."

    if "referral_cause" in required and meta.referral_made and not (meta.referral_cause or "").strip():
        errors["referral_cause"] = "Cause of referral is required when referral is yes."

    if "disability_type" in required and meta.is_disabled and meta.disability_type_id is None:
        errors["disability_type"] = "Select a disability type when disability is marked."

    if meta.is_disabled and meta.disability_type_id is None:
        errors.setdefault("disability_type", "Select a disability type when disability is marked.")

    if errors:
        raise ValidationError(errors)


def upsert_consultation_meta(encounter: Encounter, *, user, data: dict) -> EncounterConsultationMeta:
    with transaction.atomic():
        meta = get_or_create_consultation_meta(encounter, user=user)
        for field, value in data.items():
            setattr(meta, field, value)
        meta.updated_by = user
        meta.save()
        return meta
