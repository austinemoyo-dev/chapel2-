"""
Audit Utilities — Centralized audit log creation used throughout the system.

All audit log writes should go through log_action() to ensure consistency
and atomicity with the actions they log.
"""
import logging
from django.db import transaction

logger = logging.getLogger(__name__)


def log_action(
    actor,
    action_type,
    target_type,
    target_id,
    previous_value=None,
    new_value=None,
    reason_note='',
    device_id='',
    gps_lat=None,
    gps_lng=None,
):
    """
    Create an audit log entry atomically.
    
    This function should be called within a transaction.atomic() block
    together with the action it logs, ensuring that if either the action
    or the log write fails, both are rolled back.
    
    Args:
        actor: AdminUser who performed the action (or None for system actions)
        action_type: String identifier (e.g., 'ATTENDANCE_EDIT', 'STUDENT_DELETE')
        target_type: String type of the affected entity (e.g., 'Student', 'Service')
        target_id: UUID of the affected record
        previous_value: Dict snapshot before the change (optional)
        new_value: Dict snapshot after the change (optional)
        reason_note: Mandatory for manual edits and backdating
        device_id: Device used to perform the action
        gps_lat: Latitude at time of action
        gps_lng: Longitude at time of action
    
    Returns:
        AuditLog instance
    """
    # Import here to avoid circular imports
    from apps.audit.models import AuditLog

    try:
        audit_entry = AuditLog.objects.create(
            actor=actor,
            action_type=action_type,
            target_type=target_type,
            target_id=target_id,
            previous_value=previous_value,
            new_value=new_value,
            reason_note=reason_note,
            device_id=device_id,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
        )
        logger.info(
            f'Audit: [{action_type}] on {target_type}({target_id}) '
            f'by {actor.full_name if actor else "SYSTEM"}'
        )
        return audit_entry
    except Exception as e:
        logger.error(f'Failed to create audit log: {e}')
        raise
