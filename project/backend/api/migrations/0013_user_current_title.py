from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0012_habit_cached_stats"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="current_title",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="users_with_title",
                to="api.title",
                verbose_name="Текущая должность",
            ),
        ),
    ]
