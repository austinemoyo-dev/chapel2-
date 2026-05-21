"""
Web Push — send attendance notifications to subscribed admin/protocol_admin users.
"""
import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def send_push_to_admins(title: str, body: str, url: str = '/admin/attendance') -> None:
    """
    Send a Web Push notification to every admin/protocol_admin who has subscribed.
    Silently skips if VAPID keys are not configured (e.g. local dev without .env).
    Expired subscriptions (HTTP 410) are deleted automatically.
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning('pywebpush not installed — push notifications are disabled.')
        return

    from apps.accounts.models import PushSubscription, RoleChoices

    subscriptions = PushSubscription.objects.filter(
        user__role__in=[RoleChoices.SUPERADMIN, RoleChoices.ADMIN, RoleChoices.PROTOCOL_ADMIN],
        user__is_active=True,
    )

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
