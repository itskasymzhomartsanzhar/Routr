from django.db import migrations, models
import django.db.models.deletion
from api.models import get_default_category_id


def populate_categories(apps, schema_editor):
    Category = apps.get_model("api", "Category")
    Habit = apps.get_model("api", "Habit")

    default_name = "Личное"
    default_category, _created = Category.objects.get_or_create(name=default_name)

    existing_names = (
        Habit.objects.exclude(category="")
        .values_list("category", flat=True)
        .distinct()
    )
    for name in existing_names:
        Category.objects.get_or_create(name=name)

    for habit in Habit.objects.all():
        name = habit.category or default_name
        category = Category.objects.filter(name=name).first() or default_category
        habit.category_fk = category
        habit.save(update_fields=["category_fk"])


def cleanup_empty_categories(apps, schema_editor):
    Category = apps.get_model("api", "Category")
    default_name = "Личное"
    if not Category.objects.filter(name=default_name).exists():
        Category.objects.create(name=default_name)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0006_habit_habitcompletion"),
    ]

    operations = [
        migrations.CreateModel(
            name="Category",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120, unique=True, verbose_name="Название")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создана")),
            ],
        ),
        migrations.AddField(
            model_name="habit",
            name="category_fk",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET(get_default_category_id),
                related_name="habits",
                to="api.category",
            ),
        ),
        migrations.RunPython(populate_categories, cleanup_empty_categories),
        migrations.RemoveField(
            model_name="habit",
            name="category",
        ),
        migrations.RenameField(
            model_name="habit",
            old_name="category_fk",
            new_name="category",
        ),
        migrations.AlterField(
            model_name="habit",
            name="category",
            field=models.ForeignKey(
                default=get_default_category_id,
                on_delete=django.db.models.deletion.SET(get_default_category_id),
                related_name="habits",
                to="api.category",
            ),
        ),
    ]
