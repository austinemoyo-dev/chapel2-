"""
Audit Serializers — Read-only serialization for audit log entries.
"""
from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    """Read-only serializer for audit log entries."""
    actor_name = serializers.SerializerMethodField()
    actor_email = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            'id', 'actor', 'actor_name', 'actor_email',
            'action_type', 'target_type', 'target_id',
            'previous_value', 'new_value', 'reason_note',
            'device_id', 'gps_lat', 'gps_lng', 'created_at',
        ]

    def get_actor_name(self, obj):
        return obj.actor.full_name if obj.actor else 'SYSTEM'

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor else None
