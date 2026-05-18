import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0002_student_faculty'),
    ]

    operations = [
        migrations.CreateModel(
            name='StudentAccount',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('password', models.CharField(help_text='Hashed password (Django make_password)', max_length=128)),
                ('is_active', models.BooleanField(default=True, help_text='Deactivate to block portal access without deleting the account')),
                ('last_login', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('student', models.OneToOneField(
                    help_text='Student this portal account belongs to',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='account',
                    to='students.student',
                )),
            ],
            options={'db_table': 'student_accounts'},
        ),
    ]
