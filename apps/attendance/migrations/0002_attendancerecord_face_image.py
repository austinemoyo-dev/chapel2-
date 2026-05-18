from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendancerecord',
            name='face_image',
            field=models.ImageField(blank=True, null=True, upload_to='attendance_faces/%Y/%m/', help_text='Face image captured at sign-in time for audit purposes'),
        ),
    ]
