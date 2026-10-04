from django.conf import settings
from django.db import connection
from django.db.utils import OperationalError
from redis.exceptions import RedisError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, **kwargs):
        checks = {"database": "ok", "redis": "ok"}
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except OperationalError:
            checks["database"] = "unavailable"

        try:
            import redis

            client = redis.Redis.from_url(
                settings.REDIS_URL,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
            client.ping()
        except RedisError:
            checks["redis"] = "unavailable"

        healthy = all(value == "ok" for value in checks.values())
        return Response(
            {"status": "ok" if healthy else "unavailable", **checks},
            status=200 if healthy else 503,
        )
