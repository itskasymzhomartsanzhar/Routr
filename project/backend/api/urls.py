from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    CategoryViewSet,
    HabitViewSet,
    ProductViewSet,
    XpViewSet,
    app_bootstrap,
    create_robokassa_payment,
    get_current_user,
    get_public_user_profile,
    robokassa_result_webhook,
    telegram_auth,
    update_current_user,
)

router = DefaultRouter()
router.register("products", ProductViewSet, basename="products")
router.register("habits", HabitViewSet, basename="habits")
router.register("categories", CategoryViewSet, basename="categories")
router.register("xp", XpViewSet, basename="xp")


urlpatterns = [
    path("bootstrap/", app_bootstrap, name="app_bootstrap"),
    path("payments/robokassa/create/", create_robokassa_payment, name="robokassa_create_payment"),
    path("payments/robokassa/webhook/", robokassa_result_webhook, name="robokassa_result_webhook"),
    path("auth/telegram/", telegram_auth, name="telegram_auth"),
    path("auth/me/", get_current_user, name="get_current_user"),
    path("auth/me/update/", update_current_user, name="update_current_user"),
    path("users/<int:user_id>/public-profile/", get_public_user_profile, name="public_user_profile"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
] + router.urls
