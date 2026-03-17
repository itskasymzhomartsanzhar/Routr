
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from api.admin_site import admin_site


urlpatterns = [
    path('admin/', admin_site.urls),
    path("v1/api/", include("api.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
