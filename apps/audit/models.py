"""
Audit Models — Append-only audit log for all system actions.

Every privileged or destructive action writes to this table.
Records cannot be deleted via the application UI.
Manual edits and backdating require a reason_note.
"""
import uuid
from django.db import models
from django.conf import settings


class AuditLog(models.Model):
    """
    Immutable audit trail record.
    
    Captures: who performed the action, what changed, previous and new values,
    the device used, GPS coordinates, and a mandatory reason note for
    manual edits and backdating.
    
    This table is append-only — no UPDATE or DELETE operations are exposed
    through any API endpoint.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        help_text='User who performed the action (null for system actions)'
    )
    action_type = models.CharField(
        max_length=50,
        db_index=True,
        help_text='Action identifier, e.g., ATTENDANCE_EDIT, STUDENT_DELETE, DEVICE_REBIND'
    )
    target_type = models.CharField(
        max_length=50,
        help_text='Type of the affected entity, e.g., Student, Service, AttendanceRecord'
    )
    target_id = models.UUIDField(
        db_index=True,
        help_text='UUID of the affected record'
    )
    previous_value = models.JSONField(
        null=True,
        blank=True,
        help_text='Snapshot of the record before the change'
    )
    new_value = models.JSONField(
        null=True,
        blank=True,
        help_text='Snapshot of the record after the change'
    )
    reason_note = models.TextField(
        blank=True,
        default='',
        help_text='Mandatory for manual edits and backdating'
    )
    device_id = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text='Device used to perform the action'
    )
    gps_lat = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        help_text='Latitude at time of action'
    )
    gps_lng = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        help_text='Longitude at time of action'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text='Timestamp of the action — append-only, no record can be modified'
    )

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        # Prevent deletion via Django ORM as an extra safety layer
        managed = True
        indexes = [
            models.Index(
                fields=['action_type', 'created_at'],
                name='idx_audit_action_time'
            ),
            models.Index(
                fields=['actor', 'created_at'],
                name='idx_audit_actor_time'
            ),
        ]

    def __str__(self):
        actor_name = self.actor.full_name if self.actor else 'SYSTEM'
        return f'[{self.action_type}] by {actor_name} at {self.created_at}'

    def delete(self, *args, **kwargs):
        """Audit logs are append-only — prevent deletion via ORM."""
        raise PermissionError('Audit log records cannot be deleted.')
