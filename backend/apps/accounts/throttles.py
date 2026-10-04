from rest_framework.throttling import SimpleRateThrottle


class _RemoteAddrThrottle(SimpleRateThrottle):
    """Count requests by the socket address, never by X-Forwarded-For.

    A client can put any value in that header. Nginx replaces it with the
    address it actually accepted, and this throttle ignores the header so a
    direct request to the API cannot mint a new limit for each attempt.
    """

    def remote_addr(self, request) -> str:
        return request.META.get("REMOTE_ADDR") or "unknown"


class LoginRateThrottle(_RemoteAddrThrottle):
    scope = "auth_login"

    def get_cache_key(self, request, view):
        ident = self.remote_addr(request)
        email = ""
        if isinstance(request.data, dict):
            email = str(request.data.get("email") or "").strip().lower()
        if email:
            return f"throttle_auth_login_{ident}_{email}"
        return f"throttle_auth_login_{ident}"


class RefreshRateThrottle(_RemoteAddrThrottle):
    scope = "auth_refresh"

    def get_cache_key(self, request, view):
        return f"throttle_auth_refresh_{self.remote_addr(request)}"
