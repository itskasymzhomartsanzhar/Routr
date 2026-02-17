from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("api", "0008_user_language_code"),
    ]

    operations = [
        migrations.CreateModel(
            name="Title",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=32, unique=True, verbose_name="Код")),
                ("name", models.CharField(max_length=80, verbose_name="Название")),
                ("level_min", models.PositiveIntegerField(verbose_name="Уровень от")),
                ("level_max", models.PositiveIntegerField(verbose_name="Уровень до")),
                ("privileges", models.JSONField(blank=True, default=dict, verbose_name="Привилегии")),
                ("requires_premium", models.BooleanField(default=False, verbose_name="Требует Premium")),
                ("order", models.PositiveIntegerField(default=0, verbose_name="Порядок")),
            ],
        ),
        migrations.CreateModel(
            name="Quest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=64, unique=True, verbose_name="Код")),
                ("title", models.CharField(max_length=120, verbose_name="Название")),
                ("description", models.TextField(blank=True, verbose_name="Описание")),
                ("xp", models.PositiveIntegerField(default=0, verbose_name="Опыт")),
                ("group", models.CharField(choices=[("novice", "Новичок"), ("explorer", "Исследователь"), ("leader", "Лидер"), ("mentor", "Наставник")], max_length=16, verbose_name="Группа")),
                ("type", models.CharField(choices=[("create_habit", "Создать привычку"), ("public_habit_created", "Создать публичную привычку"), ("join_public_habit", "Присоединиться к публичной привычке"), ("share_habit", "Поделиться привычкой"), ("streak_days", "Стрик дней"), ("balance_points", "Баланс"), ("level_reached", "Достигнуть уровня"), ("popular_habit", "Популярная привычка"), ("trend_setter", "Тренд-сеттер"), ("monthly_xp", "Опыт за месяц"), ("community_support", "Поддержка сообщества"), ("mentor_streak", "Стрик менторства"), ("influential_habit", "Влиятельная привычка")], max_length=32, verbose_name="Тип")),
                ("target", models.PositiveIntegerField(default=1, verbose_name="Цель")),
                ("metadata", models.JSONField(blank=True, default=dict, verbose_name="Метаданные")),
                ("order", models.PositiveIntegerField(default=0, verbose_name="Порядок")),
                ("is_active", models.BooleanField(default=True, verbose_name="Активен")),
            ],
        ),
        migrations.CreateModel(
            name="XpTransaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("week_start", models.DateField(verbose_name="Начало недели")),
                ("week_end", models.DateField(verbose_name="Конец недели")),
                ("xp", models.BigIntegerField(default=0, verbose_name="Опыт")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создан")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="xp_transactions", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="UserQuest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("completed_at", models.DateTimeField(blank=True, null=True, verbose_name="Выполнен")),
                ("xp_awarded", models.PositiveIntegerField(default=0, verbose_name="Выданный опыт")),
                ("quest", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="users", to="api.quest")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="quests", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name="xptransaction",
            constraint=models.UniqueConstraint(fields=("user", "week_start"), name="unique_user_week_xp"),
        ),
        migrations.AddConstraint(
            model_name="userquest",
            constraint=models.UniqueConstraint(fields=("user", "quest"), name="unique_user_quest"),
        ),
    ]

