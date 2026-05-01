"""
Reports Serializers — Attendance report serialization.
"""
from rest_framework import serializers


class AttendanceReportItemSerializer(serializers.Serializer):
    """Single student row in the attendance report."""
    student_id = serializers.UUIDField()
    student_name = serializers.CharField()
    matric_number = serializers.CharField(allow_null=True)
    system_id = serializers.CharField()
    service_group = serializers.CharField()
    valid_count = serializers.IntegerField()
    total_required = serializers.IntegerField()
    excused_count = serializers.IntegerField()
    percentage = serializers.FloatField()
    below_threshold = serializers.BooleanField()


class AttendanceReportSerializer(serializers.Serializer):
    """Full attendance report response."""
    semester_id = serializers.UUIDField()
    semester_name = serializers.CharField()
    total_students = serializers.IntegerField()
    students_below_threshold = serializers.IntegerField()
    report = AttendanceReportItemSerializer(many=True)
    generated_at = serializers.DateTimeField()
