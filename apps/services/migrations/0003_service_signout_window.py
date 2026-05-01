from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0002_add_service_group_capacities'),
    ]

    operations = [
        migrations.AddField(
            model_name='service',
            name='signout_open_time',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='When sign-out marking opens (optional — defaults to window_open_time)',
            ),
        ),
        migrations.AddField(
            model_name='service',
            name='signout_close_time',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='When sign-out marking closes (optional — defaults to window_close_time)',
            ),
        ),
    ]
