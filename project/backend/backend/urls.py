
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path


admin.site.site_header = 'Трекер привычек Routr'
admin.site.index_title = 'Администрирование Telegram Bot Mini App Routr'

admin.site.site_url = 'https://t.me/testproject3_bot'


urlpatterns = [
    path('admin/', admin.site.urls),
    path("v1/api/", include("api.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
