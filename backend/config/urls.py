from django.conf import settings
from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "Clinic System"
admin.site.site_title = "Clinic System"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/<version>/", include("config.api_urls")),
]

if settings.DEBUG:
    from django.conf.urls.static import static

    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
