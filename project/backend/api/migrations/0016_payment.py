
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0015_habitcopy_api_habitco_source__84f855_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="Payment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(default="robokassa", max_length=32, verbose_name="Провайдер")),
                ("invoice_id", models.BigIntegerField(db_index=True, unique=True, verbose_name="Invoice ID")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=10, verbose_name="Сумма")),
                ("currency", models.CharField(default="RUB", max_length=8, verbose_name="Валюта")),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Ожидает"), ("paid", "Оплачен"), ("failed", "Ошибка")],
                        default="pending",
                        max_length=16,
                        verbose_name="Статус",
                    ),
                ),
                ("metadata", models.JSONField(blank=True, default=dict, verbose_name="Метаданные")),
                ("paid_at", models.DateTimeField(blank=True, null=True, verbose_name="Оплачен")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создан")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Обновлен")),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT, related_name="payments", to="api.product"
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
    ]
