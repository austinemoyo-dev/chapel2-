"""
Attendance Serializers — Sign-in, sign-out, offline sync, manual edit, and backdating.
"""
from rest_framework import serializers
from .models import AttendanceRecord, BackdateTypeChoices


class SignInSerializer(serializers.Serializer):
    """
    Serializer for sign-in request from protocol member device.
    
    The face image is processed server-side for 1-to-N matching.
    GPS and device info are captured for validation and audit.
    """
    service_id = serializers.UUIDField()
    face_image = serializers.ImageField(required=False, help_text='Face image for server-side matching')
    face_embedding = serializers.ListField(
        child=serializers.FloatField(),
        required=False,
        help_text='Pre-computed face embedding (for offline-first approach)'
    )
    device_id = serializers.CharField(max_length=255)
    gps_lat = serializers.DecimalField(max_digits=10, decimal_places=7)
    gps_lng = serializers.DecimalField(max_digits=10, decimal_places=7)
    # Optional: pre-matched student_id (for offline matching validation)
    student_id = serializers.UUIDField(required=False)

    def validate(self, data):
        """At least one of face_image, face_embedding, or student_id must be provided."""
        if not data.get('face_image') and not data.get('face_embedding') and not data.get('student_id'):
            raise serializers.ValidationError(
                'At least one of face_image, face_embedding, or student_id is required.'
            )
        return data


class SignOutSerializer(serializers.Serializer):
    """Serializer for sign-out request — same structure as sign-in."""
    service_id = serializers.UUIDField()
    student_id = serializers.UUIDField(required=False)
    face_image = serializers.ImageField(required=False)
    face_embedding = serializers.ListField(
        child=serializers.FloatField(),
        required=False,
    )
    device_id = serializers.CharField(max_length=255)
    gps_lat = serializers.DecimalField(max_digits=10, decimal_places=7)
    gps_lng = serializers.DecimalField(max_digits=10, decimal_places=7)


class OfflineSyncRecordSerializer(serializers.Serializer):
    """Single offline attendance record for sync validation."""
    student_id = serializers.UUIDField()
    service_id = serializers.UUIDField()
    attendance_type = serializers.ChoiceField(choices=['sign_in', 'sign_out'])
    device_id = serializers.CharField(max_length=255)
    gps_lat = serializers.DecimalField(max_digits=10, decimal_places=7)
    gps_lng = serializers.DecimalField(max_digits=10, decimal_places=7)
    timestamp = serializers.DateTimeField()
    protocol_member_id = serializers.UUIDField()


class OfflineSyncSerializer(serializers.Serializer):
    """
    Batch offline sync request.
    Each record is validated independently — some may be accepted while others are rejected.
    """
    records = OfflineSyncRecordSerializer(many=True)


class AttendanceRecordSerializer(serializers.ModelSerializer):
    """Read serializer for attendance records."""
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_matric = serializers.CharField(source='student.matric_number', read_only=True)
    service_info = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceRecord
        fields = [
            'id', 'student', 'student_name', 'student_matric',
            'service', 'service_info', 'protocol_member',
            'device_id', 'gps_lat', 'gps_lng',
            'signed_in_at', 'signed_out_at', 'is_valid',
            'is_offline_record', 'is_backdated', 'backdate_type',
            'sync_validation_result', 'created_at',
        ]

    def get_service_info(self, obj):
        return {
            'service_type': obj.service.service_type,
            'service_group': obj.service.service_group,
            'scheduled_date': str(obj.service.scheduled_date),
        }


class AttendanceEditSerializer(serializers.Serializer):
    """
    Serializer for manual attendance edit by Superadmin.
    Reason note is mandatory.
    """
    is_valid = serializers.BooleanField(required=False)
    signed_in_at = serializers.DateTimeField(required=False)
    signed_out_at = serializers.DateTimeField(required=False, allow_null=True)
    reason_note = serializers.CharField(required=True, min_length=10)


class BackdateSerializer(serializers.Serializer):
    """
    Serializer for late resumption backdating by Superadmin.
    
    Creates backdated attendance records for specified services.
    backdate_type determines how the records affect percentage:
    - 'valid': counts toward attendance %
    - 'excused': excluded from total required count
    """
    student_id = serializers.UUIDField()
    service_ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
    )
    backdate_type = serializers.ChoiceField(choices=BackdateTypeChoices.choices)
    reason_note = serializers.CharField(required=True, min_length=10)
