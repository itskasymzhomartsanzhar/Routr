
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0014_xpintervaltransaction'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='habitcopy',
            index=models.Index(fields=['source_habit', 'created_at'], name='api_habitco_source__84f855_idx'),
        ),
        migrations.AddIndex(
            model_name='habitcopy',
            index=models.Index(fields=['user'], name='api_habitco_user_id_bc202c_idx'),
        ),
    ]
