from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0002_attendancerecord_face_image'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ManualModeConfig',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_enabled', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('allowed_members', models.ManyToManyField(
                    blank=True,
                    help_text='Protocol members who may use manual attendance when mode is on',
                    related_name='manual_mode_grants',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('updated_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='manual_mode_updates',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'manual_mode_config'},
        ),
    ]
