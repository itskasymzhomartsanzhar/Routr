from django.contrib import admin
from django.contrib.auth.models import Group
from django.utils.html import format_html
from django.utils import timezone
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

admin.site.unregister(Group)






@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = (
        'get_full_name',
        'telegram_id',
        'username',
        'current_title',
        'level',
        'xp',
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
            'fields': ('current_title', 'level', 'xp')
        }),
        ('Уведомления и приватность', {
            'fields': (
                'notification_habit',
                'notification_streak',
                'notification_quests',
                'participation_in_ratings',
                'balance_wheel',
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


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "price", "currency", "duration_days", "is_active", "created_at")
    list_filter = ("is_active", "currency", "duration_days")
    search_fields = ("name", "description")
    readonly_fields = ("created_at",)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("id", "provider", "invoice_id", "user", "product", "amount", "currency", "status", "paid_at", "created_at")
    list_filter = ("provider", "status", "currency", "created_at")
    search_fields = ("invoice_id", "user__telegram_id", "user__first_name", "user__username", "product__name")
    readonly_fields = ("created_at", "updated_at", "paid_at")


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)
    readonly_fields = ("created_at",)


@admin.register(Habit)
class HabitAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "category", "goal", "visibility", "copied_count", "share_count", "created_at")
    list_filter = ("visibility", "category", "created_at")
    search_fields = ("title", "owner__username", "owner__first_name", "owner__telegram_id")
    readonly_fields = ("created_at", "updated_at")


@admin.register(HabitCompletion)
class HabitCompletionAdmin(admin.ModelAdmin):
    list_display = ("habit", "date", "count")
    list_filter = ("date",)
    search_fields = ("habit__title", "habit__owner__username", "habit__owner__first_name")


@admin.register(HabitCopy)
class HabitCopyAdmin(admin.ModelAdmin):
    list_display = ("source_habit", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("source_habit__title", "user__username", "user__first_name")
    readonly_fields = ("created_at",)




@admin.register(Quest)
class QuestAdmin(admin.ModelAdmin):
    list_display = ("title", "group", "type", "xp", "target", "is_active", "order")
    list_filter = ("group", "type", "is_active")
    search_fields = ("title", "code")
    ordering = ("group", "order")


@admin.register(Title)
class TitleAdmin(admin.ModelAdmin):
    list_display = ("name", "level_min", "level_max", "requires_premium", "order")
    list_filter = ("requires_premium",)
    search_fields = ("name", "code")
    ordering = ("order",)


@admin.register(UserQuest)
class UserQuestAdmin(admin.ModelAdmin):
    list_display = ("user", "quest", "completed_at", "xp_awarded")
    list_filter = ("completed_at",)
    search_fields = ("user__username", "user__first_name", "quest__title")
    readonly_fields = ("completed_at",)


@admin.register(XpTransaction)
class XpTransactionAdmin(admin.ModelAdmin):
    list_display = ("user", "week_start", "week_end", "xp", "created_at")
    list_filter = ("week_start", "week_end")
    search_fields = ("user__username", "user__first_name", "user__telegram_id")
    readonly_fields = ("created_at",)

"""
@admin.register(HabitShare)
class HabitShareAdmin(admin.ModelAdmin):
    list_display = ("habit", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("habit__title", "user__username", "user__first_name")
    readonly_fields = ("created_at",)
"""