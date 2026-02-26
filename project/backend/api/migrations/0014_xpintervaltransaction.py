
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0013_user_current_title'),
    ]

    operations = [
        migrations.CreateModel(
            name='XpIntervalTransaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('period_start', models.DateTimeField(verbose_name='Начало интервала')),
                ('period_end', models.DateTimeField(verbose_name='Конец интервала')),
                ('xp', models.BigIntegerField(default=0, verbose_name='Опыт')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Создан')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='xp_interval_transactions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [models.Index(fields=['period_start'], name='api_xpinter_period__9bcf9a_idx'), models.Index(fields=['period_end'], name='api_xpinter_period__e86338_idx'), models.Index(fields=['user', 'period_start'], name='api_xpinter_user_id_38c664_idx')],
                'constraints': [models.UniqueConstraint(fields=('user', 'period_start'), name='unique_user_xp_interval')],
            },
        ),
    ]
