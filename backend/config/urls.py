from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "Clinic System"
admin.site.site_title = "Clinic System"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/<version>/", include("config.api_urls")),
]
