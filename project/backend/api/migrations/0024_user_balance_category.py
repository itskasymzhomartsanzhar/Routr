from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0023_user_timezone_name"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserBalanceCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("category_name", models.CharField(max_length=120, verbose_name="Категория")),
                ("public_total", models.PositiveIntegerField(default=0, verbose_name="Публичные выполнения")),
                ("private_total", models.PositiveIntegerField(default=0, verbose_name="Приватные выполнения")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Обновлена")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="balance_category_totals", to="api.user")),
            ],
            options={
                "verbose_name": "Итог колеса баланса",
                "verbose_name_plural": "Итоги колеса баланса",
                "ordering": ("user_id", "category_name"),
            },
        ),
        migrations.AddIndex(
            model_name="userbalancecategory",
            index=models.Index(fields=["user", "category_name"], name="api_userbal_user_id_76d5ef_idx"),
        ),
        migrations.AddConstraint(
            model_name="userbalancecategory",
            constraint=models.UniqueConstraint(fields=("user", "category_name"), name="unique_user_balance_category"),
        ),
    ]
