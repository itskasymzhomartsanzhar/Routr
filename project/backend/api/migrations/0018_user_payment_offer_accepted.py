
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_alter_category_options_alter_habit_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='payment_offer_accepted',
            field=models.BooleanField(default=False, verbose_name='Согласие с офертой'),
        ),
    ]
