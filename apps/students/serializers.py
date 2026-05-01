"""
Students Serializers — Registration, face samples, and matric update.
"""
import logging
from rest_framework import serializers

from .models import Student, FaceSample, StudentTypeChoices

logger = logging.getLogger(__name__)


class StudentRegistrationSerializer(serializers.ModelSerializer):
    """
    Serializer for student registration (self-registration or admin-added).
    
    Handles:
    - Auto-capitalization of full_name
    - System ID generation for new students
    - Matric number required for old students
    - Duplicate detection results returned in response
    """
    duplicate_results = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Student
        fields = [
            'id', 'student_type', 'matric_number', 'system_id',
            'full_name', 'phone_number', 'department', 'level',
            'gender', 'profile_photo', 'service_group', 'semester',
            'is_active', 'duplicate_flag', 'face_registered',
            'created_at', 'duplicate_results',
        ]
        read_only_fields = [
            'id', 'system_id', 'service_group', 'is_active',
            'duplicate_flag', 'face_registered', 'created_at',
        ]

    def get_duplicate_results(self, obj):
        """Return duplicate detection results if they were stored."""
        return obj.duplicate_details if obj.duplicate_details else None

    def validate(self, data):
        """
        Custom validation:
        - Matric number required for old students
        - Check registration window is open (unless admin is adding)
        """
        student_type = data.get('student_type')
        matric_number = data.get('matric_number')
        request = self.context.get('request')

        # Matric required for old students
        if student_type == StudentTypeChoices.OLD and not matric_number:
            raise serializers.ValidationError({
                'matric_number': 'Matric number is required for old students.'
            })

        # Check registration window (skip for admin/superadmin)
        semester = data.get('semester')
        if semester and not semester.registration_open:
            is_admin = (
                request and request.user
                and request.user.is_authenticated
                and request.user.role in ('superadmin', 'admin')
            )
            if not is_admin:
                raise serializers.ValidationError(
                    'Registration is currently closed. Please try again later.'
                )

        return data

    def validate_full_name(self, value):
        """Auto-capitalize to title case."""
        if value:
            return value.strip().title()
        return value

    def validate_phone_number(self, value):
        """Strip whitespace from phone number."""
        if value:
            return value.strip()
        return value

    def validate_matric_number(self, value):
        """Strip whitespace and uppercase matric number."""
        if value:
            return value.strip().upper()
        return value


class StudentListSerializer(serializers.ModelSerializer):
    """Read-only serializer for listing students."""
    semester_name = serializers.CharField(source='semester.name', read_only=True)

    class Meta:
        model = Student
        fields = [
            'id', 'student_type', 'matric_number', 'system_id',
            'full_name', 'phone_number', 'department', 'level',
            'gender', 'service_group', 'is_active', 'duplicate_flag',
            'face_registered', 'semester', 'semester_name', 'created_at',
        ]


class StudentDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer including face sample count and attendance info."""
    approved_face_samples = serializers.SerializerMethodField()
    semester_name = serializers.CharField(source='semester.name', read_only=True)

    class Meta:
        model = Student
        fields = [
            'id', 'student_type', 'matric_number', 'system_id',
            'full_name', 'full_name_normalized', 'phone_number',
            'department', 'level', 'gender', 'profile_photo',
            'face_registered', 'service_group', 'semester', 'semester_name',
            'is_active', 'duplicate_flag', 'duplicate_details',
            'created_by', 'created_at', 'approved_face_samples',
        ]

    def get_approved_face_samples(self, obj):
        return obj.face_samples.filter(status='approved').count()


class FaceSampleUploadSerializer(serializers.ModelSerializer):
    """
    Serializer for uploading a single face sample.
    
    The view handles DeepFace processing:
    - Face detection and quality validation
    - Embedding extraction (Facenet512)
    - Auto-rejection with specific reasons
    """
    class Meta:
        model = FaceSample
        fields = [
            'id', 'student', 'sample_file', 'embedding_vector',
            'status', 'rejection_reason', 'semester', 'created_at',
        ]
        read_only_fields = [
            'id', 'embedding_vector', 'status', 'rejection_reason', 'created_at',
        ]


class FaceStatusSerializer(serializers.Serializer):
    """Response serializer for face registration status check."""
    student_id = serializers.UUIDField()
    total_samples = serializers.IntegerField()
    approved_samples = serializers.IntegerField()
    rejected_samples = serializers.IntegerField()
    face_registered = serializers.BooleanField()
    is_active = serializers.BooleanField()
    message = serializers.CharField()


class MatricUpdateSerializer(serializers.Serializer):
    """
    Serializer for student matric number update via secure token.
    
    Validates:
    - Token authenticity and expiry
    - System ID matches the student
    - New matric number doesn't conflict with existing records
    """
    token = serializers.CharField()
    system_id = serializers.CharField()
    matric_number = serializers.CharField(max_length=50)

    def validate_matric_number(self, value):
        """Uppercase and check for conflicts."""
        value = value.strip().upper()
        # Conflict check happens in the view with semester context
        return value


class DuplicateResolutionSerializer(serializers.Serializer):
    """Serializer for Superadmin to resolve duplicate flags."""
    student_id = serializers.UUIDField()
    action = serializers.ChoiceField(choices=['approve', 'reject'])
    reason_note = serializers.CharField(required=False, default='')
