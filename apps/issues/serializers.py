"""
Issue Report Serializers — split by audience.

Portal serializers only expose what the student should see (the
conversation itself). Admin serializers expose the full triage picture,
including the AI/diagnostic internals used to drive the inbox UI.
"""
from rest_framework import serializers

from apps.attendance.models import AttendanceRecord
from apps.services.models import Service

from .models import IssueReport, IssueMessage


class IssueMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = IssueMessage
        fields = ['id', 'sender', 'text', 'attachment', 'created_at']
        read_only_fields = fields


class IssueReportPortalListSerializer(serializers.ModelSerializer):
    ticket_code = serializers.ReadOnlyField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = IssueReport
        fields = ['id', 'ticket_code', 'category', 'status', 'last_message', 'created_at', 'updated_at']
        read_only_fields = fields

    def get_last_message(self, obj):
        last = obj.messages.order_by('-created_at').first()
        return last.text if last else ''


class IssueReportPortalDetailSerializer(serializers.ModelSerializer):
    ticket_code = serializers.ReadOnlyField()
    messages = IssueMessageSerializer(many=True, read_only=True)

    class Meta:
        model = IssueReport
        fields = ['id', 'ticket_code', 'category', 'status', 'messages', 'created_at', 'updated_at']
        read_only_fields = fields


class IssueReportAdminListSerializer(serializers.ModelSerializer):
    ticket_code = serializers.ReadOnlyField()
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_identifier = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = IssueReport
        fields = [
            'id', 'ticket_code', 'student', 'student_name', 'student_identifier',
            'last_message', 'category', 'status', 'severity',
            'resolution_type', 'created_at', 'updated_at',
        ]

    def get_student_identifier(self, obj):
        return obj.student.matric_number or obj.student.system_id

    def get_last_message(self, obj):
        last = obj.messages.order_by('-created_at').first()
        return last.text if last else ''


class IssueReportAdminDetailSerializer(serializers.ModelSerializer):
    ticket_code = serializers.ReadOnlyField()
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    student_identifier = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()
    flagged_services_detail = serializers.SerializerMethodField()
    messages = IssueMessageSerializer(many=True, read_only=True)

    class Meta:
        model = IssueReport
        fields = [
            'id', 'ticket_code', 'student', 'student_name', 'student_identifier',
            'messages', 'category', 'status', 'severity',
            'resolution_type', 'suggested_fix', 'flagged_services', 'flagged_services_detail',
            'ai_summary', 'resolved_by', 'resolved_by_name', 'resolved_at',
            'created_at', 'updated_at',
        ]

    def get_student_identifier(self, obj):
        return obj.student.matric_number or obj.student.system_id

    def get_resolved_by_name(self, obj):
        return obj.resolved_by.full_name if obj.resolved_by else None

    def get_flagged_services_detail(self, obj):
        if not obj.flagged_services:
            return []
        services = {str(s.id): s for s in Service.objects.filter(id__in=obj.flagged_services)}
        records = {
            str(r.service_id): r
            for r in AttendanceRecord.objects.filter(student=obj.student, service_id__in=obj.flagged_services)
        }
        detail = []
        for service_id in obj.flagged_services:
            service = services.get(service_id)
            if not service:
                continue
            record = records.get(service_id)
            detail.append({
                'service_id': service_id,
                'label': service.name or f'{service.service_type} {service.service_group}',
                'scheduled_date': str(service.scheduled_date),
                'has_record': record is not None,
                'is_valid': record.is_valid if record else None,
                'sync_validation_result': record.sync_validation_result if record else None,
                'attendance_record_id': str(record.id) if record else None,
            })
        return detail


class IssueReportUpdateSerializer(serializers.Serializer):
    """Admin PATCH — partial update of triage fields."""
    status = serializers.ChoiceField(choices=IssueReport._meta.get_field('status').choices, required=False)
    severity = serializers.ChoiceField(choices=IssueReport._meta.get_field('severity').choices, required=False)
    category = serializers.ChoiceField(choices=IssueReport._meta.get_field('category').choices, required=False)
