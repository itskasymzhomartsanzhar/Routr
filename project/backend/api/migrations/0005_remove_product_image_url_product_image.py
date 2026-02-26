
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0004_product'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='product',
            name='image_url',
        ),
        migrations.AddField(
            model_name='product',
            name='image',
            field=models.ImageField(blank=True, null=True, upload_to='products/', verbose_name='Фото'),
        ),
    ]
