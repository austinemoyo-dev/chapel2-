"""
Management Command: create_superadmin

Seeds the initial Superadmin account into the database.
This is the ONLY way to create a Superadmin — it cannot be done via the API or UI.

Usage:
    python manage.py create_superadmin
    python manage.py create_superadmin --email admin@chapel.edu --name "Chapel Admin" --password securepass123
"""
from django.core.management.base import BaseCommand, CommandError
from apps.accounts.models import AdminUser, RoleChoices


class Command(BaseCommand):
    help = 'Create the initial Superadmin account (cannot be created via API)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--email',
            type=str,
            help='Superadmin email address',
        )
        parser.add_argument(
            '--name',
            type=str,
            help='Superadmin full name',
        )
        parser.add_argument(
            '--password',
            type=str,
            help='Superadmin password (prompted if not provided)',
        )
        parser.add_argument(
            '--noinput',
            action='store_true',
            help='Skip interactive prompts (requires --email, --name, --password)',
        )

    def handle(self, *args, **options):
        # Check if a superadmin already exists
        existing = AdminUser.objects.filter(role=RoleChoices.SUPERADMIN).first()
        if existing:
            self.stdout.write(
                self.style.WARNING(
                    f'A Superadmin already exists: {existing.email}\n'
                    f'Only one Superadmin account is expected.'
                )
            )
            if not options.get('noinput'):
                confirm = input('Create another Superadmin? (yes/no): ')
                if confirm.lower() != 'yes':
                    self.stdout.write(self.style.NOTICE('Aborted.'))
                    return

        # Get credentials
        email = options.get('email')
        full_name = options.get('name')
        password = options.get('password')

        if not options.get('noinput'):
            if not email:
                email = input('Email: ').strip()
            if not full_name:
                full_name = input('Full Name: ').strip()
            if not password:
                import getpass
                password = getpass.getpass('Password: ')
                password_confirm = getpass.getpass('Confirm Password: ')
                if password != password_confirm:
                    raise CommandError('Passwords do not match.')

        # Validate inputs
        if not email:
            raise CommandError('Email is required.')
        if not full_name:
            raise CommandError('Full name is required.')
        if not password:
            raise CommandError('Password is required.')
        if len(password) < 8:
            raise CommandError('Password must be at least 8 characters.')

        # Check for email conflict
        if AdminUser.objects.filter(email=email).exists():
            raise CommandError(f'An account with email {email} already exists.')

        # Create the superadmin
        try:
            user = AdminUser.objects.create_superuser(
                email=email,
                full_name=full_name,
                password=password,
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f'\nSuperadmin created successfully!\n'
                    f'  Email: {user.email}\n'
                    f'  Name:  {user.full_name}\n'
                    f'  Role:  {user.role}\n'
                    f'  ID:    {user.id}\n'
                )
            )
        except Exception as e:
            raise CommandError(f'Failed to create Superadmin: {e}')
