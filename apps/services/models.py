"""
Services Models — Semester lifecycle, Service scheduling, and Geo-fence configuration.

Semester: Controls registration windows, archiving, and scoping all data.
Service: Individual service instances with auto-open/close time windows.
GeoFenceConfig: Singleton config for chapel GPS coordinates and radius.
"""
import uuid
from django.db import models
from django.conf import settings


class Semester(models.Model):
    """
    Semester model controls the lifecycle of all semester-scoped data.
    
    - Registration window open/close is controlled via `registration_open`
    - Archiving moves all attendance data and deletes face samples
    - Only one semester should be active at a time
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    name = models.CharField(
        max_length=100,
        help_text='e.g., "2025/2026 First Semester"'
    )
    start_date = models.DateField(
        help_text='Semester start date'
    )
    end_date = models.DateField(
        help_text='Semester end date — archiving triggers at this date'
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text='Only one semester should be active at a time'
    )
    is_archived = models.BooleanField(
        default=False,
        help_text='Locked after archiving — no further edits allowed'
    )
    registration_open = models.BooleanField(
        default=False,
        help_text='Controls whether student self-registration is accessible'
    )
    service_group_capacities = models.JSONField(
        default=dict,
        blank=True,
        help_text='Capacity cap per service group for student auto-assignment. '
                  'E.g., {"S1": 500, "S2": 500, "S3": 500}'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'semesters'
        ordering = ['-start_date']

    def __str__(self):
        status = 'Active' if self.is_active else ('Archived' if self.is_archived else 'Inactive')
        return f'{self.name} [{status}]'


class ServiceTypeChoices(models.TextChoices):
    MIDWEEK = 'midweek', 'Midweek'
    SUNDAY = 'sunday', 'Sunday'
    SPECIAL = 'special', 'Special'


class ServiceGroupChoices(models.TextChoices):
    S1 = 'S1', 'Service 1'
    S2 = 'S2', 'Service 2'
    S3 = 'S3', 'Service 3'
    ALL = 'all', 'All Students'  # Used for special services


class Service(models.Model):
    """
    Represents a single service instance in a semester.
    
    Time windows auto-open/close attendance marking.
    Capacity cap limits students per service group.
    Cancelled services are excluded from attendance percentage calculations.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    semester = models.ForeignKey(
        Semester,
        on_delete=models.CASCADE,
        related_name='services',
        help_text='Semester this service belongs to'
    )
    service_type = models.CharField(
        max_length=10,
        choices=ServiceTypeChoices.choices,
        help_text='Type of service: midweek, sunday, or special'
    )
    service_group = models.CharField(
        max_length=5,
        choices=ServiceGroupChoices.choices,
        help_text='Service group (S1/S2/S3) or "all" for special services'
    )
    name = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='Optional descriptive name for the service'
    )
    scheduled_date = models.DateField(
        db_index=True,
        help_text='Date the service is scheduled'
    )
    # Attendance window — auto-opens and auto-closes
    window_open_time = models.DateTimeField(
        help_text='Attendance window opens at this time (UTC)'
    )
    window_close_time = models.DateTimeField(
        help_text='Attendance window closes at this time (UTC)'
    )
    signout_required = models.BooleanField(
        default=False,
        help_text='If True, both sign-in and sign-out are required for valid attendance'
    )
    signout_open_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When sign-out marking opens (optional — defaults to window_open_time)'
    )
    signout_close_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When sign-out marking closes (optional — defaults to window_close_time)'
    )
    capacity_cap = models.PositiveIntegerField(
        default=500,
        help_text='Maximum number of students for this service group'
    )
    is_cancelled = models.BooleanField(
        default=False,
        help_text='Cancelled services are excluded from total required count'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'services'
        ordering = ['scheduled_date', 'window_open_time']
        indexes = [
            models.Index(
                fields=['semester', 'is_cancelled'],
                name='idx_service_semester_active'
            ),
        ]

    def __str__(self):
        cancelled = ' [CANCELLED]' if self.is_cancelled else ''
        return f'{self.service_type} {self.service_group} — {self.scheduled_date}{cancelled}'

    @property
    def is_window_open(self):
        """Check if the attendance window is currently open."""
        from django.utils import timezone
        now = timezone.now()
        return self.window_open_time <= now <= self.window_close_time and not self.is_cancelled


class GeoFenceConfig(models.Model):
    """
    Singleton model for chapel geo-fence configuration.
    
    Stores GPS coordinates and radius. All attendance marking by protocol
    members must occur within this geo-fence. Updated by Superadmin only.
    
    Uses a singleton pattern — only one row should exist. The get_config()
    class method handles retrieval and creation.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    latitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        help_text='Chapel latitude coordinate'
    )
    longitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        help_text='Chapel longitude coordinate'
    )
    radius_meters = models.PositiveIntegerField(
        default=200,
        help_text='Radius in meters from chapel center for geo-fence'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='geofence_updates',
        help_text='Superadmin who last updated the geo-fence'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'geofence_config'
        verbose_name = 'Geo-Fence Configuration'
        verbose_name_plural = 'Geo-Fence Configuration'

    def __str__(self):
        return f'GeoFence: ({self.latitude}, {self.longitude}) r={self.radius_meters}m'

    @classmethod
    def get_config(cls):
        """Retrieve the singleton geo-fence config, creating a default if needed."""
        config = cls.objects.first()
        if config is None:
            config = cls.objects.create(
                latitude=0.0,
                longitude=0.0,
                radius_meters=settings.DEFAULT_GEOFENCE_RADIUS_METERS,
            )
        return config

    def save(self, *args, **kwargs):
        """Enforce singleton — delete all other instances before saving."""
        if not self.pk:
            GeoFenceConfig.objects.all().delete()
        super().save(*args, **kwargs)
