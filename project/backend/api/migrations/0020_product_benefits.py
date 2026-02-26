from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0019_user_purchase_benefits"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="is_premium",
            field=models.BooleanField(default=False, verbose_name="Премиум доступ"),
        ),
        migrations.AddField(
            model_name="product",
            name="xp_multiplier",
            field=models.DecimalField(decimal_places=2, default=1.0, max_digits=4, verbose_name="Множитель XP"),
        ),
        migrations.AddField(
            model_name="product",
            name="extra_habit_slots",
            field=models.PositiveIntegerField(default=0, verbose_name="Дополнительные слоты привычек"),
        ),
        migrations.AddField(
            model_name="product",
            name="streak_shields",
            field=models.PositiveIntegerField(default=0, verbose_name="Щиты стрика"),
        ),
    ]
