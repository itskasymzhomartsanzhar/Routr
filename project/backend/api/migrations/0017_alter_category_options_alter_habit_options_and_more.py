
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0016_payment'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='category',
            options={'ordering': ('name',), 'verbose_name': 'Категория', 'verbose_name_plural': 'Категории'},
        ),
        migrations.AlterModelOptions(
            name='habit',
            options={'ordering': ('-created_at',), 'verbose_name': 'Привычка', 'verbose_name_plural': 'Привычки'},
        ),
        migrations.AlterModelOptions(
            name='habitcompletion',
            options={'ordering': ('-date', '-id'), 'verbose_name': 'Выполнение привычки', 'verbose_name_plural': 'Выполнения привычек'},
        ),
        migrations.AlterModelOptions(
            name='habitcopy',
            options={'ordering': ('-created_at',), 'verbose_name': 'Копия публичной привычки', 'verbose_name_plural': 'Копии публичных привычек'},
        ),
        migrations.AlterModelOptions(
            name='habitshare',
            options={'ordering': ('-created_at',), 'verbose_name': 'Репост привычки', 'verbose_name_plural': 'Репосты привычек'},
        ),
        migrations.AlterModelOptions(
            name='payment',
            options={'ordering': ('-created_at',), 'verbose_name': 'Платеж', 'verbose_name_plural': 'Платежи'},
        ),
        migrations.AlterModelOptions(
            name='product',
            options={'ordering': ('-created_at',), 'verbose_name': 'Продукт', 'verbose_name_plural': 'Продукты'},
        ),
        migrations.AlterModelOptions(
            name='quest',
            options={'ordering': ('group', 'order', 'id'), 'verbose_name': 'Квест', 'verbose_name_plural': 'Квесты'},
        ),
        migrations.AlterModelOptions(
            name='title',
            options={'ordering': ('order', 'id'), 'verbose_name': 'Должность', 'verbose_name_plural': 'Должности'},
        ),
        migrations.AlterModelOptions(
            name='user',
            options={'ordering': ('-date_joined',), 'verbose_name': 'Пользователь', 'verbose_name_plural': 'Пользователи'},
        ),
        migrations.AlterModelOptions(
            name='userquest',
            options={'ordering': ('-completed_at', '-id'), 'verbose_name': 'Квест пользователя', 'verbose_name_plural': 'Квесты пользователей'},
        ),
        migrations.AlterModelOptions(
            name='xpintervaltransaction',
            options={'ordering': ('-period_start', '-id'), 'verbose_name': 'XP-транзакция (интервал)', 'verbose_name_plural': 'XP-транзакции (интервал)'},
        ),
        migrations.AlterModelOptions(
            name='xptransaction',
            options={'ordering': ('-week_start', '-id'), 'verbose_name': 'XP-транзакция (неделя)', 'verbose_name_plural': 'XP-транзакции (неделя)'},
        ),
    ]
