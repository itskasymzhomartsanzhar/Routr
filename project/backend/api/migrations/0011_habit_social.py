from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0010_seed_titles_quests"),
    ]

    operations = [
        migrations.AddField(
            model_name="habit",
            name="source_habit",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="copies", to="api.habit"),
        ),
        migrations.AddField(
            model_name="habit",
            name="copied_count",
            field=models.PositiveIntegerField(default=0, verbose_name="Добавлений пользователями"),
        ),
        migrations.AddField(
            model_name="habit",
            name="share_count",
            field=models.PositiveIntegerField(default=0, verbose_name="Поделились"),
        ),
        migrations.CreateModel(
            name="HabitCopy",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создан")),
                ("source_habit", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="habit_copies", to="api.habit")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="habit_copies", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="HabitShare",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создан")),
                ("habit", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="shares", to="api.habit")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="habit_shares", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name="habitcopy",
            constraint=models.UniqueConstraint(fields=("user", "source_habit"), name="unique_habit_copy"),
        ),
        migrations.AddConstraint(
            model_name="habitshare",
            constraint=models.UniqueConstraint(fields=("user", "habit"), name="unique_habit_share"),
        ),
    ]

