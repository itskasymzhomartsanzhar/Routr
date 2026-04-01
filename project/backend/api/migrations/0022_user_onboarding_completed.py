from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0021_habit_end_date_archive"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="onboarding_completed",
            field=models.BooleanField(default=False, verbose_name="Обучение пройдено"),
        ),
    ]
