import logging

from config.redaction import RedactingFilter


def test_log_filter_redacts_secrets():
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg='login password=%s bearer %s url=postgres://clinicsys:%s@postgres/clinicsys',
        args=("secret-value", "aaa.bbb.ccc", "db-secret"),
        exc_info=None,
    )
    assert RedactingFilter().filter(record) is True
    message = record.getMessage()
    assert "secret-value" not in message
    assert "aaa.bbb.ccc" not in message
    assert "db-secret" not in message
    assert "[REDACTED]" in message
