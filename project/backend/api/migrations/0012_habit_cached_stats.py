from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0011_habit_social"),
    ]

    operations = [
        migrations.AddField(
            model_name="habit",
            name="completed_total",
            field=models.PositiveIntegerField(default=0, verbose_name="Выполнений за прошлые дни"),
        ),
        migrations.AddField(
            model_name="habit",
            name="stats_rollup_date",
            field=models.DateField(blank=True, null=True, verbose_name="Дата последнего роллапа статистики"),
        ),
        migrations.AddField(
            model_name="habit",
            name="streak_best",
            field=models.PositiveIntegerField(default=0, verbose_name="Рекорд стрик"),
        ),
        migrations.AddField(
            model_name="habit",
            name="streak_current",
            field=models.PositiveIntegerField(default=0, verbose_name="Текущий стрик"),
        ),
        migrations.AddField(
            model_name="habit",
            name="streak_last_date",
            field=models.DateField(blank=True, null=True, verbose_name="Последняя дата стрика"),
        ),
    ]
