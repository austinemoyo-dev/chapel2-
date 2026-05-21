"""
Accounts Views — Authentication endpoints and admin user management.
"""
import logging
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.db import transaction

from .models import AdminUser, RoleChoices, PushSubscription
from .serializers import (
    CustomTokenObtainPairSerializer,
    AdminUserSerializer,
    AdminUserListSerializer,
    DeviceBindSerializer,
)
from .permissions import IsSuperadmin, IsAdminOrAbove
from apps.audit.utils import log_action

logger = logging.getLogger(__name__)


# =============================================================================
# AUTH ENDPOINTS
# =============================================================================

class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/

    Authenticates an admin/protocol user and returns JWT access + refresh tokens.
    Token includes custom claims: role, full_name, email.
    No authentication required (public endpoint for login).

    When a protocol member logs in, a push notification is sent to all admin
    subscribers so admins can monitor login punctuality.
    """
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)

        if response.status_code == 200:
            # Identify the user who just logged in
            email = request.data.get('email', '')
            try:
                user = AdminUser.objects.get(email=email)
                if user.role == RoleChoices.PROTOCOL_MEMBER:
                    import threading
                    from django.utils import timezone

                    now_str = timezone.localtime().strftime('%I:%M %p')
                    threading.Thread(
                        target=_send_login_push,
                        args=(user.full_name, now_str),
                        daemon=True,
                    ).start()
            except AdminUser.DoesNotExist:
                pass

        return response


def _send_login_push(full_name: str, time_str: str) -> None:
    from apps.attendance.push import send_push_to_admins
    send_push_to_admins(
        title='Protocol member logged in',
        body=f'{full_name} logged in at {time_str}',
        url='/admin/devices',
    )


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    
    Invalidates the refresh token by adding it to the blacklist.
    Requires: {"refresh": "<refresh_token>"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response(
                    {'error': 'Refresh token is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {'message': 'Logged out successfully.'},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            logger.error(f'Logout error: {e}')
            return Response(
                {'error': 'Invalid or expired token.'},
                status=status.HTTP_400_BAD_REQUEST
            )


# =============================================================================
# ADMIN USER MANAGEMENT (Superadmin only)
# =============================================================================

class AdminUserListCreateView(generics.ListCreateAPIView):
    """
    GET /api/auth/users/ — List all admin users
    POST /api/auth/users/ — Create a new admin user
    
    Superadmin only. Cannot create superadmin accounts via API.
    """
    permission_classes = [IsSuperadmin]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return AdminUserSerializer
        return AdminUserListSerializer

    def get_queryset(self):
        return AdminUser.objects.all().order_by('-created_at')

    @transaction.atomic
    def perform_create(self, serializer):
        user = serializer.save()
        # Audit log: admin account created
        log_action(
            actor=self.request.user,
            action_type='ADMIN_ACCOUNT_CREATED',
            target_type='AdminUser',
            target_id=user.id,
            new_value={
                'email': user.email,
                'role': user.role,
                'full_name': user.full_name,
            },
        )
        logger.info(f'Admin user created: {user.email} with role {user.role}')


class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET /api/auth/users/{id}/ — Retrieve user details
    PATCH /api/auth/users/{id}/ — Update user
    DELETE /api/auth/users/{id}/ — Deactivate user
    
    Superadmin only.
    """
    serializer_class = AdminUserSerializer
    permission_classes = [IsSuperadmin]
    queryset = AdminUser.objects.all()
    lookup_field = 'id'

    @transaction.atomic
    def perform_update(self, serializer):
        old_data = AdminUserListSerializer(self.get_object()).data
        user = serializer.save()
        # Audit log: admin account modified
        log_action(
            actor=self.request.user,
            action_type='ADMIN_ACCOUNT_MODIFIED',
            target_type='AdminUser',
            target_id=user.id,
            previous_value=old_data,
            new_value=AdminUserListSerializer(user).data,
        )

    @transaction.atomic
    def perform_destroy(self, instance):
        """Soft-delete: deactivate the account instead of hard deletion."""
        log_action(
            actor=self.request.user,
            action_type='ADMIN_ACCOUNT_DEACTIVATED',
            target_type='AdminUser',
            target_id=instance.id,
            previous_value={'is_active': True},
            new_value={'is_active': False},
        )
        instance.is_active = False
        instance.save(update_fields=['is_active'])


class DeviceBindView(APIView):
    """
    POST /api/auth/bind-device/
    
    Binds a device to a protocol member account.
    Superadmin only. Used for initial binding and emergency rebinds.
    
    Request: {"protocol_member_id": "<uuid>", "device_id": "<fingerprint>"}
    """
    permission_classes = [IsSuperadmin]

    @transaction.atomic
    def post(self, request):
        serializer = DeviceBindSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        member_id = serializer.validated_data['protocol_member_id']
        new_device_id = serializer.validated_data.get('device_id') or None

        member = AdminUser.objects.get(id=member_id)
        old_device_id = member.bound_device_id

        member.bound_device_id = new_device_id
        member.save(update_fields=['bound_device_id'])

        # Audit log: device binding change
        log_action(
            actor=request.user,
            action_type='DEVICE_REBIND',
            target_type='AdminUser',
            target_id=member.id,
            previous_value={'bound_device_id': old_device_id},
            new_value={'bound_device_id': new_device_id},
        )

        logger.info(
            f'Device bound: {member.email} → {new_device_id} '
            f'(was: {old_device_id})'
        )

        return Response({
            'message': 'Device bound successfully.',
            'protocol_member': str(member.id),
            'device_id': new_device_id,
        }, status=status.HTTP_200_OK)


# =============================================================================
# WEB PUSH SUBSCRIPTIONS
# =============================================================================

class VapidPublicKeyView(APIView):
    """
    GET /api/auth/push/vapid-key/
    Returns the VAPID public key so the browser can subscribe to push.
    Any authenticated user may call this.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.conf import settings
        return Response({'public_key': settings.VAPID_PUBLIC_KEY})


class PushSubscribeView(APIView):
    """
    POST /api/auth/push/subscribe/   — save a push subscription for the current user
    DELETE /api/auth/push/subscribe/ — remove it (called on unsubscribe)

    Only superadmin, admin, and protocol_admin users are subscribed —
    protocol members are the ones *doing* the marking, not the ones being notified.
    """
    permission_classes = [IsAuthenticated]

    NOTIFIABLE_ROLES = {
        RoleChoices.SUPERADMIN,
        RoleChoices.ADMIN,
        RoleChoices.PROTOCOL_ADMIN,
    }

    def post(self, request):
        if request.user.role not in self.NOTIFIABLE_ROLES:
            return Response(
                {'error': 'Push notifications are only available for admin roles.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        endpoint = request.data.get('endpoint', '').strip()
        p256dh   = request.data.get('p256dh', '').strip()
        auth     = request.data.get('auth', '').strip()

        if not endpoint or not p256dh or not auth:
            return Response(
                {'error': 'endpoint, p256dh, and auth are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={'user': request.user, 'p256dh': p256dh, 'auth': auth},
        )
        return Response({'message': 'Subscribed.'}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        endpoint = request.data.get('endpoint', '').strip()
        if endpoint:
            PushSubscription.objects.filter(
                user=request.user, endpoint=endpoint
            ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
