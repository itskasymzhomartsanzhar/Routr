from django.contrib import admin
from django.contrib.auth.models import Group
from django.utils.html import format_html
from django.utils import timezone
from .admin_site import admin_site
from .models import (
    Category,
    Habit,
    HabitCompletion,
    HabitCopy,
    HabitShare,
    Payment,
    Product,
    Quest,
    Title,
    User,
    UserQuest,
    XpTransaction,
)

try:
    admin_site.unregister(Group)
except admin.sites.NotRegistered:
    pass






@admin.register(User, site=admin_site)
class UserAdmin(admin.ModelAdmin):
    list_display = (
        'get_full_name',
        'telegram_id',
        'username',
        'current_title',
        'level',
        'xp',
        'extra_habit_slots',
        'streak_shields',
        'xp_boost_multiplier',
        'xp_boost_expires_at',
        'is_premium',
        'date_joined',
    )
    list_filter = ('is_active', 'is_staff', 'date_joined', 'premium_expiration')
    search_fields = ('telegram_id', 'username', 'first_name')
    readonly_fields = ('date_joined', 'last_login')
    list_per_page = 50

    fieldsets = (
        ('Основная информация', {
            'fields': ('telegram_id', 'username', 'first_name')
        }),
        ('Дополнительно', {
            'fields': ('photo_url', 'premium_expiration')
        }),
        ('Прогресс', {
            'fields': (
                'current_title',
                'level',
                'xp',
                'extra_habit_slots',
                'streak_shields',
                'xp_boost_multiplier',
                'xp_boost_expires_at',
            )
        }),
        ('Уведомления и приватность', {
            'fields': (
                'notification_habit',
                'notification_streak',
                'notification_quests',
                'participation_in_ratings',
                'balance_wheel',
                'onboarding_completed',
            )
        }),
        ('Права доступа', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
            'classes': ('collapse',)
        }),
        ('Даты', {
            'fields': ('date_joined', 'last_login'),
            'classes': ('collapse',)
        }),
    )

    def get_full_name(self, obj):
        return obj.first_name or obj.username or f"User {obj.id}"
    get_full_name.short_description = 'Пользователь'

    def is_premium(self, obj):
        if obj.premium_expiration and obj.premium_expiration > timezone.now():
            return format_html('<span style="color: gold;">★ Premium</span>')
        return '-'
    is_premium.short_description = 'Премиум'


@admin.register(Product, site=admin_site)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "price",
        "currency",
        "duration_days",
        "is_premium",
        "xp_multiplier",
        "extra_habit_slots",
        "streak_shields",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active", "currency", "duration_days", "is_premium")
    search_fields = ("name", "description")
    readonly_fields = ("created_at",)


@admin.register(Payment, site=admin_site)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("id", "provider", "invoice_id", "user", "product", "amount", "currency", "status", "paid_at", "created_at")
    list_filter = ("provider", "status", "currency", "created_at")
    search_fields = ("invoice_id", "user__telegram_id", "user__first_name", "user__username", "product__name")
    readonly_fields = ("created_at", "updated_at", "paid_at")


@admin.register(Category, site=admin_site)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)
    readonly_fields = ("created_at",)


@admin.register(Habit, site=admin_site)
class HabitAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "category", "goal", "visibility", "end_date", "is_archived", "copied_count", "share_count", "created_at")
    list_filter = ("visibility", "category", "is_archived", "created_at")
    search_fields = ("title", "owner__username", "owner__first_name", "owner__telegram_id")
    readonly_fields = ("created_at", "updated_at")


@admin.register(HabitCompletion, site=admin_site)
class HabitCompletionAdmin(admin.ModelAdmin):
    list_display = ("habit", "date", "count")
    list_filter = ("date",)
    search_fields = ("habit__title", "habit__owner__username", "habit__owner__first_name")


@admin.register(HabitCopy, site=admin_site)
class HabitCopyAdmin(admin.ModelAdmin):
    list_display = ("source_habit", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("source_habit__title", "user__username", "user__first_name")
    readonly_fields = ("created_at",)




@admin.register(Quest, site=admin_site)
class QuestAdmin(admin.ModelAdmin):
    list_display = ("title", "group", "type", "xp", "target", "is_active", "order")
    list_filter = ("group", "type", "is_active")
    search_fields = ("title", "code")
    ordering = ("group", "order")


@admin.register(Title, site=admin_site)
class TitleAdmin(admin.ModelAdmin):
    list_display = ("name", "level_min", "level_max", "requires_premium", "order")
    list_filter = ("requires_premium",)
    search_fields = ("name", "code")
    ordering = ("order",)


@admin.register(UserQuest, site=admin_site)
class UserQuestAdmin(admin.ModelAdmin):
    list_display = ("user", "quest", "completed_at", "xp_awarded")
    list_filter = ("completed_at",)
    search_fields = ("user__username", "user__first_name", "quest__title")
    readonly_fields = ("completed_at",)


@admin.register(XpTransaction, site=admin_site)
class XpTransactionAdmin(admin.ModelAdmin):
    list_display = ("user", "week_start", "week_end", "xp", "created_at")
    list_filter = ("week_start", "week_end")
    search_fields = ("user__username", "user__first_name", "user__telegram_id")
    readonly_fields = ("created_at",)


@admin.register(HabitShare, site=admin_site)
class HabitShareAdmin(admin.ModelAdmin):
    list_display = ("habit", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("habit__title", "user__username", "user__first_name")
    readonly_fields = ("created_at",)
