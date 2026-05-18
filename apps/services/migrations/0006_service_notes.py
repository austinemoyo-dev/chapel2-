from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0005_sermon'),
    ]

    operations = [
        migrations.AddField(
            model_name='service',
            name='notes',
            field=models.TextField(blank=True, default='', help_text='Special notes or instructions for this service (visible to ushers)'),
        ),
    ]
