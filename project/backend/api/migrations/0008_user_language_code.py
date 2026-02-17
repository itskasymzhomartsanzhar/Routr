from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0007_category_fk_for_habit'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='language_code',
            field=models.CharField(blank=True, default='ru', max_length=8, verbose_name='Код языка'),
        ),
    ]
