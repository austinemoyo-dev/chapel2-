"""
Attendance signals — push notifications for admin monitoring.

Fires in two situations only:
1. A protocol member makes their FIRST scan of a service session (started attendance).
2. (Login notification is handled directly in LoginView.)
"""
import threading
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import AttendanceRecord


@receiver(post_save, sender=AttendanceRecord)
def notify_on_session_start(sender, instance, created, **kwargs):
    """Fire only when a protocol member scans for the FIRST time in a service."""
    if not created or not instance.protocol_member:
        return

    # Check if this is the first record this member has made for this service.
    count = AttendanceRecord.objects.filter(
        protocol_member=instance.protocol_member,
        service=instance.service,
    ).count()
    if count != 1:
        return  # Not the first scan — ignore

    try:
        member_name   = instance.protocol_member.full_name
        service_label = str(instance.service)
        window_open   = instance.service.window_open_time
    except Exception:
        return

    now        = timezone.now()
    diff_secs  = int((now - window_open).total_seconds())
    mode       = 'offline' if instance.is_offline_record else 'online'

    if diff_secs < -60:
        timing = f'{abs(diff_secs) // 60} min early'
    elif diff_secs <= 300:
        timing = 'on time'
    else:
        mins = diff_secs // 60
        timing = f'{mins} min late'

    title = 'Attendance started'
    body  = f'{member_name} started scanning for {service_label} — {timing} ({mode})'

    threading.Thread(target=_push, args=(title, body), daemon=True).start()


def _push(title: str, body: str) -> None:
    from .push import send_push_to_admins
    send_push_to_admins(title, body)
