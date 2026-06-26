"""
Admin Views — issue report inbox: list, thread detail, reply, and resolve.

No endpoint here writes to AttendanceRecord — that always goes through the
existing AttendanceEditView/BackdateView (apps/attendance/views.py), so the
audit trail and reason_note requirement stay exactly as they are today. The
admin UI calls those directly using `suggested_fix`, then calls `resolve`
here once that succeeds.
"""
from django.db.models import Case, When, IntegerField, Q
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.accounts.permissions import IsAdminOrAbove
from apps.audit.utils import log_action

from .models import IssueReport, IssueMessage, IssueMessageSenderChoices, IssueStatusChoices, IssueSeverityChoices
from .serializers import (
    IssueReportAdminListSerializer,
    IssueReportAdminDetailSerializer,
    IssueReportUpdateSerializer,
)

SEVERITY_RANK = {
    IssueSeverityChoices.URGENT: 0,
    IssueSeverityChoices.HIGH: 1,
    IssueSeverityChoices.MEDIUM: 2,
    IssueSeverityChoices.LOW: 3,
}


class IssueAdminListView(generics.ListAPIView):
    """
    GET /api/admin/issues/

    Filterable by status/severity/category/search. Defaults to hiding
    dismissed reports. Ordered by severity (urgent first), then most
    recently active.
    """
    serializer_class = IssueReportAdminListSerializer
    permission_classes = [IsAdminOrAbove]

    def get_queryset(self):
        qs = IssueReport.objects.select_related('student').all()

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        else:
            qs = qs.exclude(status=IssueStatusChoices.DISMISSED)

        severity = self.request.query_params.get('severity')
        if severity:
            qs = qs.filter(severity=severity)

        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(student__full_name__icontains=search) | Q(messages__text__icontains=search)).distinct()

        qs = qs.annotate(
            severity_rank=Case(
                *[When(severity=value, then=rank) for value, rank in SEVERITY_RANK.items()],
                default=4,
                output_field=IntegerField(),
            )
        ).order_by('severity_rank', '-updated_at')
        return qs


class IssueAdminDetailView(APIView):
    """
    GET   /api/admin/issues/{id}/ — full conversation + triage detail
    PATCH /api/admin/issues/{id}/ — update status/severity/category
    """
    permission_classes = [IsAdminOrAbove]

    def get(self, request, id):
        issue = get_object_or_404(IssueReport.objects.select_related('student', 'resolved_by'), id=id)
        return Response(IssueReportAdminDetailSerializer(issue, context={'request': request}).data)

    @transaction.atomic
    def patch(self, request, id):
        issue = get_object_or_404(IssueReport, id=id)
        serializer = IssueReportUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        previous_value = {'status': issue.status, 'severity': issue.severity, 'category': issue.category}

        for field in ('status', 'severity', 'category'):
            if field in data:
                setattr(issue, field, data[field])
        issue.save()

        log_action(
            actor=request.user,
            action_type='ISSUE_UPDATED',
            target_type='IssueReport',
            target_id=issue.id,
            previous_value=previous_value,
            new_value=data,
        )
        return Response(IssueReportAdminDetailSerializer(issue, context={'request': request}).data)


class IssueAdminMessageView(APIView):
    """POST /api/admin/issues/{id}/messages/ — admin reply in the thread."""
    permission_classes = [IsAdminOrAbove]

    def post(self, request, id):
        issue = get_object_or_404(IssueReport, id=id)
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'error': 'Message text is required.'}, status=400)

        IssueMessage.objects.create(
            issue=issue,
            sender=IssueMessageSenderChoices.ADMIN,
            text=text,
            admin=request.user,
        )
        if issue.status not in (IssueStatusChoices.RESOLVED, IssueStatusChoices.DISMISSED):
            issue.status = IssueStatusChoices.IN_REVIEW
            issue.save(update_fields=['status', 'updated_at'])

        return Response(IssueReportAdminDetailSerializer(issue, context={'request': request}).data)


class IssueAdminResolveView(APIView):
    """POST /api/admin/issues/{id}/resolve/ — optionally posts a closing message first."""
    permission_classes = [IsAdminOrAbove]

    @transaction.atomic
    def post(self, request, id):
        issue = get_object_or_404(IssueReport, id=id)

        closing_message = (request.data.get('message') or '').strip()
        if closing_message:
            IssueMessage.objects.create(
                issue=issue,
                sender=IssueMessageSenderChoices.ADMIN,
                text=closing_message,
                admin=request.user,
            )

        issue.status = IssueStatusChoices.RESOLVED
        issue.resolved_by = request.user
        issue.resolved_at = timezone.now()
        issue.save()

        log_action(
            actor=request.user,
            action_type='ISSUE_RESOLVED',
            target_type='IssueReport',
            target_id=issue.id,
            new_value={'message': closing_message},
        )
        return Response(IssueReportAdminDetailSerializer(issue, context={'request': request}).data)
