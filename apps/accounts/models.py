"""
Accounts Models — Custom AdminUser model with role-based access control.

Roles:
- superadmin: Unrestricted access. Seeded via management command only.
- admin: Granular permissions granted by Superadmin.
- protocol_admin: Monitoring role. Views live attendance dashboard.
- protocol_member: Field role. Marks attendance on bound device.
"""
import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class RoleChoices(models.TextChoices):
    """System roles with hierarchical access levels."""
    SUPERADMIN = 'superadmin', 'Superadmin'
    ADMIN = 'admin', 'Admin'
    PROTOCOL_ADMIN = 'protocol_admin', 'Protocol Admin'
    PROTOCOL_MEMBER = 'protocol_member', 'Protocol Member'


class AdminUserManager(BaseUserManager):
    """
    Custom manager for AdminUser.
    Email is the unique identifier for authentication instead of username.
    """

    def create_user(self, email, full_name, password=None, **extra_fields):
        if not email:
            raise ValueError('Email address is required')
        if not full_name:
            raise ValueError('Full name is required')

        email = self.normalize_email(email)
        user = self.model(email=email, full_name=full_name, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, full_name, password=None, **extra_fields):
        """Used by Django's createsuperuser command. Sets role to superadmin."""
        extra_fields.setdefault('role', RoleChoices.SUPERADMIN)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('role') != RoleChoices.SUPERADMIN:
            raise ValueError('Superuser must have role=superadmin')
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True')

        return self.create_user(email, full_name, password, **extra_fields)


class AdminUser(AbstractBaseUser, PermissionsMixin):
    """
    Custom user model for all admin/protocol roles.
    
    Uses UUID primary key to avoid exposing sequential IDs.
    Email-based authentication. Role determines access level.
    
    Protocol Members have a bound_device_id for device binding enforcement.
    Admins have a permissions JSONField for granular access control
    granted by Superadmin.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text='Unique identifier for the user'
    )
    email = models.EmailField(
        unique=True,
        db_index=True,
        help_text='Email address used for login'
    )
    full_name = models.CharField(
        max_length=255,
        help_text='Full name of the admin user'
    )
    phone_number = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text='Contact phone number'
    )
    role = models.CharField(
        max_length=20,
        choices=RoleChoices.choices,
        default=RoleChoices.ADMIN,
        db_index=True,
        help_text='Role determines access level and permissions'
    )

    # Device binding for Protocol Members — enforced at attendance time
    bound_device_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text='Device fingerprint/ID for protocol member device binding'
    )

    # Granular permissions for Admin role — set by Superadmin
    # Example: {"can_view_students": true, "can_add_students": true, ...}
    admin_permissions = models.JSONField(
        default=dict,
        blank=True,
        help_text='Granular permission flags for Admin role, set by Superadmin'
    )

    is_active = models.BooleanField(
        default=True,
        help_text='Designates whether this user should be treated as active'
    )
    is_staff = models.BooleanField(
        default=False,
        help_text='Designates whether the user can access Django admin site'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = AdminUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        db_table = 'admin_users'
        verbose_name = 'Admin User'
        verbose_name_plural = 'Admin Users'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.full_name} ({self.role})'

    @property
    def is_superadmin(self):
        return self.role == RoleChoices.SUPERADMIN

    @property
    def is_admin(self):
        return self.role in (RoleChoices.SUPERADMIN, RoleChoices.ADMIN)

    @property
    def is_protocol_admin(self):
        return self.role == RoleChoices.PROTOCOL_ADMIN

    @property
    def is_protocol_member(self):
        return self.role == RoleChoices.PROTOCOL_MEMBER

    def has_admin_permission(self, perm_key):
        """
        Check if an Admin-role user has a specific granular permission.
        Superadmin always returns True. Other roles return False.
        """
        if self.is_superadmin:
            return True
        if self.role == RoleChoices.ADMIN:
            return self.admin_permissions.get(perm_key, False)
        return False
