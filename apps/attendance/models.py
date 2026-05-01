"""
Attendance Models — AttendanceRecord with per-student lock and offline sync support.

Each record captures: who was marked, by whom, on what device, at what GPS
coordinates, and whether it was an offline-synced or backdated record.
"""
import uuid
from django.db import models
from django.conf import settings


class BackdateTypeChoices(models.TextChoices):
    VALID = 'valid', 'Valid'        # Counts toward attendance percentage
    EXCUSED = 'excused', 'Excused'  # Excluded from total required count


class AttendanceRecord(models.Model):
    """
    Individual attendance record for a student at a specific service.
    
    Key constraints:
    - UniqueConstraint on (student, service) enforces per-student lock
    - is_valid computed based on signout_required rule of the service
    - Offline records validated independently on sync
    - Backdated records track type (valid vs excused) for percentage calc
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='attendance_records',
        help_text='Student who was marked'
    )
    service = models.ForeignKey(
        'services.Service',
        on_delete=models.CASCADE,
        related_name='attendance_records',
        help_text='Service this attendance belongs to'
    )
    protocol_member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='marked_attendances',
        help_text='Protocol member who performed the marking'
    )

    # Device and location tracking for audit purposes
    device_id = models.CharField(
        max_length=255,
        help_text='Device fingerprint/ID of the marking device'
    )
    gps_lat = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        help_text='Latitude at time of marking'
    )
    gps_lng = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        help_text='Longitude at time of marking'
    )

    # Sign-in and sign-out timestamps
    signed_in_at = models.DateTimeField(
        help_text='Timestamp when student was signed in'
    )
    signed_out_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Timestamp when student was signed out (if required)'
    )

    # Validity and status flags
    is_valid = models.BooleanField(
        default=True,
        help_text='Computed based on service signout_required rule'
    )
    is_offline_record = models.BooleanField(
        default=False,
        help_text='True if this record was synced from an offline queue'
    )
    is_backdated = models.BooleanField(
        default=False,
        help_text='True if created via late resumption backdating'
    )
    backdate_type = models.CharField(
        max_length=10,
        choices=BackdateTypeChoices.choices,
        blank=True,
        null=True,
        help_text='Set for backdated records: "valid" or "excused"'
    )
    sync_validation_result = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text='Result of offline sync validation (e.g., "accepted", "rejected: out-of-window")'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'attendance_records'
        ordering = ['-signed_in_at']
        constraints = [
            # Per-student lock: only one attendance record per student per service
            models.UniqueConstraint(
                fields=['student', 'service'],
                name='unique_student_per_service'
            ),
        ]
        indexes = [
            models.Index(
                fields=['service', 'is_valid'],
                name='idx_attendance_service_valid'
            ),
            models.Index(
                fields=['student', 'is_valid'],
                name='idx_attendance_student_valid'
            ),
        ]

    def __str__(self):
        status = 'Valid' if self.is_valid else 'Invalid'
        return f'{self.student} → {self.service} [{status}]'

    def compute_validity(self):
        """
        Recompute is_valid based on the service's signout_required flag.
        
        Rules:
        - signout_required=False → valid on sign-in alone
        - signout_required=True → valid only if both signed_in_at and signed_out_at exist
        - Backdated records with type='excused' are always valid (excluded from total)
        """
        if self.is_backdated and self.backdate_type == BackdateTypeChoices.EXCUSED:
            self.is_valid = True
        elif self.service.signout_required:
            self.is_valid = bool(self.signed_in_at and self.signed_out_at)
        else:
            self.is_valid = bool(self.signed_in_at)
        return self.is_valid
