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

from .models import AdminUser, RoleChoices
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
    """
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]


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
