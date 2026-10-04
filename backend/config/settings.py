"""Django settings for the clinic system backend foundation."""

from datetime import timedelta
from pathlib import Path

import environ
from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    POSTGRES_PORT=(int, 5432),
)

_env_file = BASE_DIR.parent / ".env"
if _env_file.exists():
    env.read_env(_env_file)

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env("DJANGO_DEBUG")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

_INSECURE_SECRETS = {"", "change-me", "changeme", "secret", "password"}
if not DEBUG:
    if SECRET_KEY.strip().lower() in _INSECURE_SECRETS or len(SECRET_KEY) < 32:
        raise ImproperlyConfigured(
            "Set a unique DJANGO_SECRET_KEY of at least 32 characters when DJANGO_DEBUG is false."
        )
    if env("POSTGRES_PASSWORD").strip().lower() in _INSECURE_SECRETS:
        raise ImproperlyConfigured("Set POSTGRES_PASSWORD when DJANGO_DEBUG is false.")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "apps.clinics.apps.ClinicsConfig",
    "apps.accounts.apps.AccountsConfig",
    "apps.audit.apps.AuditConfig",
    "apps.patients.apps.PatientsConfig",
    "apps.appointments.apps.AppointmentsConfig",
    "apps.queues.apps.QueuesConfig",
    "apps.encounters.apps.EncountersConfig",
    "apps.prescriptions.apps.PrescriptionsConfig",
    "apps.pharmacy.apps.PharmacyConfig",
    "apps.laboratory.apps.LaboratoryConfig",
    "apps.billing.apps.BillingConfig",
    "apps.notifications.apps.NotificationsConfig",
    "apps.synchronization.apps.SynchronizationConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST", default="localhost"),
        "PORT": env("POSTGRES_PORT"),
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
    }
}

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REDIS_URL = env("REDIS_URL")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
    }
}

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = False
CORS_ALLOW_HEADERS = [*default_headers, "x-branch-id", "idempotency-key"]

REST_FRAMEWORK = {
    "DEFAULT_VERSIONING_CLASS": "rest_framework.versioning.URLPathVersioning",
    "DEFAULT_VERSION": "v1",
    "ALLOWED_VERSIONS": ["v1"],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_RATES": {
        "auth_login": "10/minute",
        "auth_refresh": "30/minute",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=False)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

LOG_LEVEL = env("LOG_LEVEL", default="INFO")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "redact": {"()": "config.redaction.RedactingFilter"},
    },
    "formatters": {
        "plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "plain",
            "filters": ["redact"],
        },
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.server": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.db.backends": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "celery": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
    },
}
