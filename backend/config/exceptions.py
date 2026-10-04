"""Normalize DRF errors to a stable JSON envelope."""

from rest_framework.views import exception_handler


def _text(value) -> str:
    if isinstance(value, (list, tuple)):
        return "; ".join(_text(item) for item in value)
    return str(value)


def _code(value) -> str:
    if isinstance(value, (list, tuple)) and value:
        return _code(value[0])
    return getattr(value, "code", None) or "error"


def _messages(value) -> list[str]:
    if isinstance(value, dict):
        return [f"{key}: {_text(item)}" for key, item in value.items()]
    if isinstance(value, (list, tuple)):
        return [_text(item) for item in value]
    return [_text(value)]


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    payload = response.data
    fields: dict[str, list[str]] = {}

    if isinstance(payload, dict) and set(payload.keys()) == {"detail"}:
        detail = _text(payload["detail"])
        code = _code(payload["detail"])
    elif isinstance(payload, dict):
        detail_value = payload.get("detail")
        for key, value in payload.items():
            if key == "detail":
                continue
            fields[key] = _messages(value)
        if detail_value is not None:
            detail = _text(detail_value)
            code = _code(detail_value)
        elif fields:
            detail = " ".join(message for messages in fields.values() for message in messages)
            code = "validation_error"
        else:
            detail = "Validation failed."
            code = "validation_error"
    elif isinstance(payload, list):
        detail = "Validation failed."
        code = "validation_error"
        fields = {"non_field_errors": _messages(payload)}
    else:
        detail = _text(payload)
        code = "error"

    response.data = {"code": code, "detail": detail, "fields": fields}
    return response
