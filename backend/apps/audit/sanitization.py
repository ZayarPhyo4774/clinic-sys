BLOCKED_METADATA_KEYS = {
    "password",
    "token",
    "access",
    "refresh",
    "secret",
    "authorization",
    "api_key",
}


def sanitize_metadata(value):
    if not isinstance(value, dict):
        return {}
    clean = {}
    for key, item in value.items():
        if str(key).lower() in BLOCKED_METADATA_KEYS:
            continue
        if isinstance(item, dict):
            clean[key] = sanitize_metadata(item)
        else:
            clean[key] = item
    return clean
