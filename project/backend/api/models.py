from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models
from django.utils import timezone
import uuid
import os
import requests
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from django.conf import settings
import urllib.parse

from django.utils.translation import gettext_lazy as _

class UserManager(BaseUserManager):
    def create_user(self, telegram_id=None, email=None, password=None, **extra_fields):
        if not telegram_id and not extra_fields.get('is_superuser', False):
            raise ValueError("telegram_id is required for normal users")

        user = self.model(telegram_id=telegram_id, **extra_fields)
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, telegram_id=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if not password:
            raise ValueError("Superuser must have a password")

        return self.create_user(telegram_id=telegram_id, password=password, **extra_fields)


    def get_or_create_telegram_user(self, telegram_id, **extra_fields):
        try:
            user = self.get(telegram_id=telegram_id)
            for key, value in extra_fields.items():
                setattr(user, key, value)
            user.save()
            return user, False
        except User.DoesNotExist:
            return self.create_user(telegram_id=telegram_id, **extra_fields), True



class User(AbstractBaseUser, PermissionsMixin):

    telegram_id = models.BigIntegerField("Telegram ID", null=True, blank=True, unique=True)
    username = models.CharField("Имя пользователя", max_length=250, blank=True)
    photo_url = models.URLField("URL фото", max_length=750, blank=True, null=True)
    first_name = models.CharField("Имя", max_length=250, blank=True, null=True)
    language_code = models.CharField("Код языка", max_length=8, default="ru", blank=True)

    premium_expiration = models.DateTimeField("Дата окончания премиума", null=True, blank=True)

    notification_habit = models.BooleanField("Напоминание о привычках", default=True)
    notification_streak = models.BooleanField("Уведомление о страйке", default=True)
    notification_quests = models.BooleanField("Уведомление о квестах", default=True)
    participation_in_ratings = models.BooleanField("Участие в рейтингах", default=True)
    balance_wheel = models.BooleanField("Только публичные привычки в колесе баланса", default=False)
    payment_offer_accepted = models.BooleanField("Согласие с офертой", default=False)

    level = models.BigIntegerField("Уровень", default=1)
    xp = models.BigIntegerField("Опыт", default=0)
    current_title = models.ForeignKey(
        "Title",
        on_delete=models.SET_NULL,
        related_name="users_with_title",
        null=True,
        blank=True,
        verbose_name="Текущая должность",
    )

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)


    objects = UserManager()

    USERNAME_FIELD = "telegram_id"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "Пользователь"
        verbose_name_plural = "Пользователи"
        ordering = ("-date_joined",)

    @property
    def is_anonymous(self):
        return False

    @property
    def is_authenticated(self):
        return True

    def __str__(self):
        return f"{self.first_name} ({self.telegram_id})" if self.telegram_id else self.first_name or str(self.id)
    

class Product(models.Model):
    name = models.CharField("Название", max_length=255)
    description = models.TextField("Описание", blank=True)
    price = models.DecimalField("Цена", max_digits=10, decimal_places=2, default=0)
    currency = models.CharField("Валюта", max_length=8, default="RUB")
    image = models.ImageField("Фото", upload_to="products/", blank=True, null=True)
    duration_days = models.PositiveIntegerField("Длительность (дни)", default=0)
    is_active = models.BooleanField("Доступен", default=True)
    created_at = models.DateTimeField("Создан", auto_now_add=True)

    class Meta:
        verbose_name = "Продукт"
        verbose_name_plural = "Продукты"
        ordering = ("-created_at",)

    def __str__(self):
        return self.name


class Payment(models.Model):
    STATUS_PENDING = "pending"
    STATUS_PAID = "paid"
    STATUS_FAILED = "failed"

    STATUS_CHOICES = (
        (STATUS_PENDING, "Ожидает"),
        (STATUS_PAID, "Оплачен"),
        (STATUS_FAILED, "Ошибка"),
    )

    PROVIDER_ROBOKASSA = "robokassa"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="payments")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="payments")
    provider = models.CharField("Провайдер", max_length=32, default=PROVIDER_ROBOKASSA)
    invoice_id = models.BigIntegerField("Invoice ID", unique=True, db_index=True)
    amount = models.DecimalField("Сумма", max_digits=10, decimal_places=2)
    currency = models.CharField("Валюта", max_length=8, default="RUB")
    status = models.CharField("Статус", max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    metadata = models.JSONField("Метаданные", default=dict, blank=True)
    paid_at = models.DateTimeField("Оплачен", null=True, blank=True)
    created_at = models.DateTimeField("Создан", auto_now_add=True)
    updated_at = models.DateTimeField("Обновлен", auto_now=True)

    class Meta:
        verbose_name = "Платеж"
        verbose_name_plural = "Платежи"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.provider}:{self.invoice_id}:{self.status}"


class Category(models.Model):
    name = models.CharField("Название", max_length=120, unique=True)
    created_at = models.DateTimeField("Создана", auto_now_add=True)

    class Meta:
        verbose_name = "Категория"
        verbose_name_plural = "Категории"
        ordering = ("name",)

    def __str__(self):
        return self.name


def get_default_category_id():
    default_name = "Личное"
    category = Category.objects.filter(name=default_name).first()
    if category:
        return category.id
    fallback = Category.objects.order_by("id").first()
    if fallback:
        return fallback.id
    return Category.objects.create(name=default_name).id


class Habit(models.Model):
    VISIBILITY_CHOICES = (
        ("Публичный", "Публичный"),
        ("Приватный", "Приватный"),
    )

    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="habits")
    source_habit = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="copies",
        null=True,
        blank=True,
    )
    title = models.CharField("Название", max_length=255)
    category = models.ForeignKey(
        Category,
        on_delete=models.SET(get_default_category_id),
        related_name="habits",
        default=get_default_category_id,
    )
    icon = models.CharField("Иконка", max_length=32, default="✅")
    goal = models.PositiveIntegerField("Цель в день", default=1)
    repeat_days = models.JSONField("Дни повтора", default=list, blank=True)
    reminder = models.BooleanField("Напоминания включены", default=False)
    reminder_times = models.JSONField("Время напоминаний", default=list, blank=True)
    visibility = models.CharField("Видимость", max_length=20, choices=VISIBILITY_CHOICES, default="Приватный")
    copied_count = models.PositiveIntegerField("Добавлений пользователями", default=0)
    share_count = models.PositiveIntegerField("Поделились", default=0)
    completed_total = models.PositiveIntegerField("Выполнений за прошлые дни", default=0)
    streak_current = models.PositiveIntegerField("Текущий стрик", default=0)
    streak_best = models.PositiveIntegerField("Рекорд стрик", default=0)
    streak_last_date = models.DateField("Последняя дата стрика", null=True, blank=True)
    stats_rollup_date = models.DateField("Дата последнего роллапа статистики", null=True, blank=True)
    created_at = models.DateTimeField("Создана", auto_now_add=True)
    updated_at = models.DateTimeField("Обновлена", auto_now=True)

    class Meta:
        verbose_name = "Привычка"
        verbose_name_plural = "Привычки"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.title} ({self.owner_id})"


class HabitCompletion(models.Model):
    habit = models.ForeignKey(Habit, on_delete=models.CASCADE, related_name="completions")
    date = models.DateField("Дата")
    count = models.PositiveIntegerField("Количество", default=0)

    class Meta:
        verbose_name = "Выполнение привычки"
        verbose_name_plural = "Выполнения привычек"
        ordering = ("-date", "-id")
        constraints = [
            models.UniqueConstraint(fields=["habit", "date"], name="unique_habit_completion"),
        ]

    def __str__(self):
        return f"{self.habit_id} {self.date} ({self.count})"


class HabitCopy(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="habit_copies")
    source_habit = models.ForeignKey(Habit, on_delete=models.CASCADE, related_name="habit_copies")
    created_at = models.DateTimeField("Создан", auto_now_add=True)

    class Meta:
        verbose_name = "Копия публичной привычки"
        verbose_name_plural = "Копии публичных привычек"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(fields=["user", "source_habit"], name="unique_habit_copy"),
        ]
        indexes = [
            models.Index(fields=["source_habit", "created_at"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"{self.user_id} {self.source_habit_id}"


class HabitShare(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="habit_shares")
    habit = models.ForeignKey(Habit, on_delete=models.CASCADE, related_name="shares")
    created_at = models.DateTimeField("Создан", auto_now_add=True)

    class Meta:
        verbose_name = "Репост привычки"
        verbose_name_plural = "Репосты привычек"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(fields=["user", "habit"], name="unique_habit_share"),
        ]

    def __str__(self):
        return f"{self.user_id} {self.habit_id}"


class XpTransaction(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="xp_transactions")
    week_start = models.DateField("Начало недели")
    week_end = models.DateField("Конец недели")
    xp = models.BigIntegerField("Опыт", default=0)
    created_at = models.DateTimeField("Создан", auto_now_add=True)

    class Meta:
        verbose_name = "XP-транзакция (неделя)"
        verbose_name_plural = "XP-транзакции (неделя)"
        ordering = ("-week_start", "-id")
        constraints = [
            models.UniqueConstraint(fields=["user", "week_start"], name="unique_user_week_xp"),
        ]

    def __str__(self):
        return f"{self.user_id} {self.week_start} {self.xp}"


class XpIntervalTransaction(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="xp_interval_transactions")
    period_start = models.DateTimeField("Начало интервала")
    period_end = models.DateTimeField("Конец интервала")
    xp = models.BigIntegerField("Опыт", default=0)
    created_at = models.DateTimeField("Создан", auto_now_add=True)

    class Meta:
        verbose_name = "XP-транзакция (интервал)"
        verbose_name_plural = "XP-транзакции (интервал)"
        ordering = ("-period_start", "-id")
        constraints = [
            models.UniqueConstraint(fields=["user", "period_start"], name="unique_user_xp_interval"),
        ]
        indexes = [
            models.Index(fields=["period_start"]),
            models.Index(fields=["period_end"]),
            models.Index(fields=["user", "period_start"]),
        ]

    def __str__(self):
        return f"{self.user_id} {self.period_start.isoformat()} {self.xp}"


class Title(models.Model):
    code = models.CharField("Код", max_length=32, unique=True)
    name = models.CharField("Название", max_length=80)
    level_min = models.PositiveIntegerField("Уровень от")
    level_max = models.PositiveIntegerField("Уровень до")
    privileges = models.JSONField("Привилегии", default=dict, blank=True)
    requires_premium = models.BooleanField("Требует Premium", default=False)
    order = models.PositiveIntegerField("Порядок", default=0)

    class Meta:
        verbose_name = "Должность"
        verbose_name_plural = "Должности"
        ordering = ("order", "id")

    def __str__(self):
        return self.name


class Quest(models.Model):
    GROUP_CHOICES = (
        ("novice", "Новичок"),
        ("explorer", "Исследователь"),
        ("leader", "Лидер"),
        ("mentor", "Наставник"),
    )
    TYPE_CHOICES = (
        ("create_habit", "Создать привычку"),
        ("public_habit_created", "Создать публичную привычку"),
        ("join_public_habit", "Присоединиться к публичной привычке"),
        ("share_habit", "Поделиться привычкой"),
        ("streak_days", "Стрик дней"),
        ("balance_points", "Баланс"),
        ("level_reached", "Достигнуть уровня"),
        ("popular_habit", "Популярная привычка"),
        ("trend_setter", "Тренд-сеттер"),
        ("monthly_xp", "Опыт за месяц"),
        ("community_support", "Поддержка сообщества"),
        ("mentor_streak", "Стрик менторства"),
        ("influential_habit", "Влиятельная привычка"),
    )

    code = models.CharField("Код", max_length=64, unique=True)
    title = models.CharField("Название", max_length=120)
    description = models.TextField("Описание", blank=True)
    xp = models.PositiveIntegerField("Опыт", default=0)
    group = models.CharField("Группа", max_length=16, choices=GROUP_CHOICES)
    type = models.CharField("Тип", max_length=32, choices=TYPE_CHOICES)
    target = models.PositiveIntegerField("Цель", default=1)
    metadata = models.JSONField("Метаданные", default=dict, blank=True)
    order = models.PositiveIntegerField("Порядок", default=0)
    is_active = models.BooleanField("Активен", default=True)

    class Meta:
        verbose_name = "Квест"
        verbose_name_plural = "Квесты"
        ordering = ("group", "order", "id")

    def __str__(self):
        return self.title


class UserQuest(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="quests")
    quest = models.ForeignKey(Quest, on_delete=models.CASCADE, related_name="users")
    completed_at = models.DateTimeField("Выполнен", null=True, blank=True)
    xp_awarded = models.PositiveIntegerField("Выданный опыт", default=0)

    class Meta:
        verbose_name = "Квест пользователя"
        verbose_name_plural = "Квесты пользователей"
        ordering = ("-completed_at", "-id")
        constraints = [
            models.UniqueConstraint(fields=["user", "quest"], name="unique_user_quest"),
        ]

    def __str__(self):
        return f"{self.user_id} {self.quest_id}"


@receiver(pre_delete, sender=Category)
def reassign_habits_on_category_delete(sender, instance, **kwargs):
    fallback = Category.objects.exclude(id=instance.id).filter(name="Личное").first()
    if not fallback:
        fallback = Category.objects.exclude(id=instance.id).order_by("id").first()
    if not fallback:
        fallback = Category.objects.create(name="Личное")
    Habit.objects.filter(category=instance).update(category=fallback)
