"""
Accounts Serializers — Authentication, user management, and JWT customization.
"""
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import AdminUser, RoleChoices
from apps.audit.utils import log_action


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom JWT token serializer that includes role and full_name in the token claims.
    This allows the frontend to determine user role without an extra API call.
    """
    device_id = serializers.CharField(required=False, allow_blank=True)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Add custom claims to the token
        token['role'] = user.role
        token['full_name'] = user.full_name
        token['email'] = user.email
        return token

    def validate(self, attrs):
        # Extract device_id before parent validation (it's not a model field)
        device_id = attrs.pop('device_id', None)
        data = super().validate(attrs)

        # Auto-bind device for Protocol Members
        if self.user.role == RoleChoices.PROTOCOL_MEMBER and device_id:
            if not self.user.bound_device_id:
                # First login — auto-bind this device
                self.user.bound_device_id = device_id
                self.user.save(update_fields=['bound_device_id'])
                log_action(
                    actor=self.user,
                    action_type='DEVICE_AUTO_BIND',
                    target_type='AdminUser',
                    target_id=self.user.id,
                    new_value={'bound_device_id': device_id},
                )
                data['device_bound'] = True
                data['device_message'] = 'Device automatically bound to your account.'
            elif self.user.bound_device_id != device_id:
                # Device mismatch — reject login
                raise serializers.ValidationError(
                    'This account is bound to a different device. '
                    'Contact the Superadmin to rebind your device.'
                )
            else:
                # Same device — all good
                data['device_bound'] = True

        # Include user info in the response body as well
        data['user'] = {
            'id': str(self.user.id),
            'email': self.user.email,
            'full_name': self.user.full_name,
            'role': self.user.role,
            # Include permissions so the frontend can enforce them correctly;
            # empty dict for non-Admin roles.
            'admin_permissions': self.user.admin_permissions or {},
        }
        return data


class LoginSerializer(serializers.Serializer):
    """Login request serializer — validates email and password."""
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class AdminUserSerializer(serializers.ModelSerializer):
    """
    Full serializer for AdminUser CRUD operations by Superadmin.
    Password is write-only and hashed on creation.
    """
    password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = AdminUser
        fields = [
            'id', 'email', 'full_name', 'phone_number', 'role',
            'bound_device_id', 'admin_permissions', 'is_active',
            'password', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_role(self, value):
        """Prevent creation of superadmin via API — must use management command."""
        if value == RoleChoices.SUPERADMIN:
            raise serializers.ValidationError(
                'Superadmin accounts cannot be created via API. '
                'Use the create_superadmin management command.'
            )
        return value

    def validate(self, data):
        """Validate that device binding is only set for protocol members."""
        role = data.get('role', getattr(self.instance, 'role', None))
        bound_device_id = data.get('bound_device_id')
        if bound_device_id and role != RoleChoices.PROTOCOL_MEMBER:
            raise serializers.ValidationError({
                'bound_device_id': 'Device binding is only for Protocol Member accounts.'
            })
        return data

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = AdminUser(**validated_data)
        if password:
            user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class AdminUserListSerializer(serializers.ModelSerializer):
    """Read-only serializer for listing admin users — excludes sensitive fields."""

    class Meta:
        model = AdminUser
        fields = [
            'id', 'email', 'full_name', 'phone_number', 'role',
            'bound_device_id', 'is_active', 'created_at'
        ]


class DeviceBindSerializer(serializers.Serializer):
    """Serializer for binding a device to a protocol member."""
    protocol_member_id = serializers.UUIDField()
    device_id = serializers.CharField(max_length=255, allow_blank=True)

    def validate_protocol_member_id(self, value):
        try:
            user = AdminUser.objects.get(id=value, role=RoleChoices.PROTOCOL_MEMBER)
        except AdminUser.DoesNotExist:
            raise serializers.ValidationError(
                'Protocol member not found or user is not a Protocol Member.'
            )
        return value


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for password change."""
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=8)
