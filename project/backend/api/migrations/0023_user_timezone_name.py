from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0022_user_onboarding_completed"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="timezone_name",
            field=models.CharField(blank=True, default="", max_length=64, verbose_name="Часовой пояс"),
        ),
    ]
