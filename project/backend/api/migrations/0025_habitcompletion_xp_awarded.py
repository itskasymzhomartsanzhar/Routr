from django.db import migrations, models
from django.db.models import F


def mark_existing_awarded(apps, schema_editor):
    HabitCompletion = apps.get_model("api", "HabitCompletion")
    HabitCompletion.objects.filter(count__gte=F("habit__goal")).update(xp_awarded=True)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0024_user_balance_category"),
    ]

    operations = [
        migrations.AddField(
            model_name="habitcompletion",
            name="xp_awarded",
            field=models.BooleanField(default=False, verbose_name="XP начислен"),
        ),
        migrations.RunPython(mark_existing_awarded, migrations.RunPython.noop),
    ]
