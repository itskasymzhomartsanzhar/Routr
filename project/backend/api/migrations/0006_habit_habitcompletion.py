from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0005_remove_product_image_url_product_image"),
    ]

    operations = [
        migrations.CreateModel(
            name="Habit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255, verbose_name="Название")),
                ("category", models.CharField(blank=True, max_length=120, verbose_name="Категория")),
                ("icon", models.CharField(default="✅", max_length=32, verbose_name="Иконка")),
                ("goal", models.PositiveIntegerField(default=1, verbose_name="Цель в день")),
                ("repeat_days", models.JSONField(blank=True, default=list, verbose_name="Дни повтора")),
                ("reminder", models.BooleanField(default=False, verbose_name="Напоминания включены")),
                ("reminder_times", models.JSONField(blank=True, default=list, verbose_name="Время напоминаний")),
                ("visibility", models.CharField(choices=[("Публичный", "Публичный"), ("Приватный", "Приватный")], default="Приватный", max_length=20, verbose_name="Видимость")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создана")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Обновлена")),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="habits", to="api.user")),
            ],
        ),
        migrations.CreateModel(
            name="HabitCompletion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(verbose_name="Дата")),
                ("count", models.PositiveIntegerField(default=0, verbose_name="Количество")),
                ("habit", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="completions", to="api.habit")),
            ],
        ),
        migrations.AddConstraint(
            model_name="habitcompletion",
            constraint=models.UniqueConstraint(fields=("habit", "date"), name="unique_habit_completion"),
        ),
    ]
