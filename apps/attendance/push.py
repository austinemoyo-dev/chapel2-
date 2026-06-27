"""
Web Push — send notifications to subscribed admin/protocol_admin users and
to students subscribed via the portal (e.g. issue report replies).
"""
import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _send_to_subscriptions(subscriptions, title: str, body: str, url: str) -> None:
    """
    Shared delivery loop — sends one payload to every subscription, deletes
    any that come back expired (HTTP 410).
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return

    try:
        from pywebpush import webpush
    except ImportError:
        logger.warning('pywebpush not installed — push notifications are disabled.')
        return

    payload = json.dumps({'title': title, 'body': body, 'url': url})

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    'endpoint': sub.endpoint,
                    'keys': {'p256dh': sub.p256dh, 'auth': sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={'sub': f'mailto:{settings.VAPID_ADMIN_EMAIL}'},
            )
        except Exception as exc:
            # 410 Gone = subscription expired/unsubscribed — clean it up
            status_code = getattr(exc, 'response', None) and exc.response.status_code
            if status_code == 410:
                sub.delete()
            else:
                logger.warning('Push failed for %s: %s', sub.endpoint[:60], exc)


def send_push_to_admins(title: str, body: str, url: str = '/admin/attendance') -> None:
    """
    Send a Web Push notification to every admin/protocol_admin who has subscribed.
    Silently skips if VAPID keys are not configured (e.g. local dev without .env).
    """
    from apps.accounts.models import PushSubscription, RoleChoices

    subscriptions = PushSubscription.objects.filter(
        user__role__in=[RoleChoices.SUPERADMIN, RoleChoices.ADMIN, RoleChoices.PROTOCOL_ADMIN],
        user__is_active=True,
    )
    _send_to_subscriptions(subscriptions, title, body, url)


def send_push_to_student(student, title: str, body: str, url: str = '/student/issues') -> None:
    """
    Send a Web Push notification to every browser the given student has
    subscribed from the portal. Silently skips if VAPID keys are unset.
    """
    from apps.students.models import StudentPushSubscription

    subscriptions = StudentPushSubscription.objects.filter(student=student)
    _send_to_subscriptions(subscriptions, title, body, url)
