from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0020_product_benefits"),
    ]

    operations = [
        migrations.AddField(
            model_name="habit",
            name="end_date",
            field=models.DateField(blank=True, null=True, verbose_name="Дата окончания"),
        ),
        migrations.AddField(
            model_name="habit",
            name="is_archived",
            field=models.BooleanField(default=False, verbose_name="В архиве"),
        ),
        migrations.AddField(
            model_name="habit",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Дата архивации"),
        ),
    ]
