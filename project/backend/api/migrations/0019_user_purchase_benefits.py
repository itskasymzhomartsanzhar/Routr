from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0018_user_payment_offer_accepted"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="extra_habit_slots",
            field=models.PositiveIntegerField(default=0, verbose_name="Дополнительные слоты привычек"),
        ),
        migrations.AddField(
            model_name="user",
            name="streak_shields",
            field=models.PositiveIntegerField(default=0, verbose_name="Щиты для стрика"),
        ),
        migrations.AddField(
            model_name="user",
            name="xp_boost_expires_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Дата окончания бустера XP"),
        ),
        migrations.AddField(
            model_name="user",
            name="xp_boost_multiplier",
            field=models.DecimalField(decimal_places=2, default=1.0, max_digits=4, verbose_name="Множитель XP"),
        ),
    ]
