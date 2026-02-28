from rest_framework import serializers

from django.utils import timezone
from datetime import date
from .models import Product, User, Habit, HabitCompletion, Category, Title, Quest, Payment


class TelegramAuthSerializer(serializers.Serializer):
    init_data = serializers.CharField()


class UserSerializer(serializers.ModelSerializer):
    is_premium = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "telegram_id",
            "username",
            "first_name",
            "photo_url",
            "premium_expiration",
            "is_premium",
            "title",
            "notification_habit",
            "notification_streak",
            "notification_quests",
            "participation_in_ratings",
            "balance_wheel",
            "level",
            "xp",
            "extra_habit_slots",
            "streak_shields",
            "xp_boost_multiplier",
            "xp_boost_expires_at",
            "is_active",
            "date_joined",
        )
        read_only_fields = (
            "telegram_id",
            "premium_expiration",
            "level",
            "xp",
            "extra_habit_slots",
            "streak_shields",
            "xp_boost_multiplier",
            "xp_boost_expires_at",
            "date_joined",
        )

    def get_is_premium(self, obj):
        return bool(obj.premium_expiration and obj.premium_expiration > timezone.now())

    def get_title(self, obj):
        title = obj.current_title
        return title.name if title else ""


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "description",
            "price",
            "currency",
            "image",
            "duration_days",
            "is_premium",
            "xp_multiplier",
            "extra_habit_slots",
            "streak_shields",
            "is_active",
            "created_at",
        )
        read_only_fields = ("created_at",)


class PaymentSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    purchased_at = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id",
            "status",
            "provider",
            "amount",
            "currency",
            "paid_at",
            "created_at",
            "purchased_at",
            "product",
        )
        read_only_fields = ("paid_at", "created_at")

    def get_purchased_at(self, obj):
        return obj.paid_at or obj.created_at


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name")


class TitleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Title
        fields = ("code", "name", "level_min", "level_max", "privileges", "requires_premium", "order")


class QuestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Quest
        fields = ("code", "title", "description", "xp", "group", "type", "target", "metadata", "order")


class HabitCompletionSerializer(serializers.ModelSerializer):
    class Meta:
        model = HabitCompletion
        fields = ("date", "count")
        read_only_fields = ("date", "count")


class HabitSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source="category",
        write_only=True,
        required=False,
    )
    completed = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    current_steps = serializers.SerializerMethodField()
    total_steps = serializers.SerializerMethodField()
    completed_dates = serializers.SerializerMethodField()
    completions = HabitCompletionSerializer(many=True, read_only=True)
    total_completions = serializers.SerializerMethodField()
    current_streak = serializers.IntegerField(source="streak_current", read_only=True)
    best_streak = serializers.IntegerField(source="streak_best", read_only=True)
    source_habit_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Habit
        fields = (
            "id",
            "title",
            "category",
            "category_id",
            "icon",
            "goal",
            "repeat_days",
            "reminder",
            "reminder_times",
            "visibility",
            "created_at",
            "updated_at",
            "completed",
            "progress",
            "current_steps",
            "total_steps",
            "completed_dates",
            "completions",
            "total_completions",
            "current_streak",
            "best_streak",
            "source_habit_id",
        )
        read_only_fields = (
            "created_at",
            "updated_at",
            "completed",
            "progress",
            "current_steps",
            "total_steps",
            "completed_dates",
            "completions",
            "total_completions",
            "current_streak",
            "best_streak",
        )

    def validate_reminder_times(self, value):
        request = self.context.get("request")
        if not request:
            return value
        user = request.user
        is_premium = bool(user.premium_expiration and user.premium_expiration > timezone.now())
        limit = 5 if is_premium else 3
        if len(value) > limit:
            raise serializers.ValidationError(f"Максимум {limit} напоминаний.")
        return value

    def _get_context_date(self):
        context_date = self.context.get("date")
        if isinstance(context_date, date):
            return context_date
        if isinstance(context_date, str):
            try:
                return date.fromisoformat(context_date)
            except ValueError:
                return None
        return timezone.localdate()

    def _get_today_completion(self, obj):
        target_date = self._get_context_date()
        if not target_date:
            return 0
        completion = next((item for item in obj.completions.all() if item.date == target_date), None)
        return completion.count if completion else 0

    def get_current_steps(self, obj):
        return self._get_today_completion(obj)

    def get_total_steps(self, obj):
        return obj.goal

    def get_progress(self, obj):
        goal = max(obj.goal, 1)
        current = self._get_today_completion(obj)
        return min(round((current / goal) * 100, 2), 100)

    def get_completed(self, obj):
        return self._get_today_completion(obj) >= max(obj.goal, 1)

    def get_completed_dates(self, obj):
        goal = max(obj.goal, 1)
        return [item.date.isoformat() for item in obj.completions.all() if item.count >= goal]

    def get_total_completions(self, obj):
        today = timezone.localdate()
        today_completion = next((item for item in obj.completions.all() if item.date == today), None)
        return int(obj.completed_total or 0) + int(today_completion.count if today_completion else 0)
