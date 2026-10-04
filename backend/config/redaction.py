"""Drop secrets from log records before they are written."""

import logging
import re

_ASSIGNMENT = re.compile(
    r"(?i)([\"']?(?:password|secret|token|authorization|api_key)[\"']?\s*[:=]\s*)"
    r"(\"[^\"]*\"|'[^']*'|\S+)"
)
_BEARER = re.compile(r"(?i)bearer\s+\S+")
_URL_PASSWORD = re.compile(r"(?i)(://[^:/\s]+:)([^@/\s]+)@")


def _redact(message: str) -> str:
    message = _ASSIGNMENT.sub(r"\1[REDACTED]", message)
    message = _BEARER.sub("Bearer [REDACTED]", message)
    message = _URL_PASSWORD.sub(r"\1[REDACTED]@", message)
    return message


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = _redact(record.getMessage()).replace("%", "%%")
        record.args = ()
        return True
