"""
Student Portal Views — submit, track, and follow up on issue reports.

Auth reuses the existing student portal token (X-Portal-Token), same as
apps/students/portal_views.py. Submission is free text only — no category
or service field; triage runs synchronously so the student sees the
outcome (resolved, asked for more detail, or queued for review) right in
the response, instead of having to refresh.
"""
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.students.portal_views import StudentPortalAuthentication, IsStudentAuthenticated
from apps.attendance.push import send_push_to_admins

from .ai_triage import run_triage, run_followup
from .models import IssueReport, IssueStatusChoices, IssueSeverityChoices
from .serializers import IssueReportPortalSerializer

MIN_DESCRIPTION_LENGTH = 5
MIN_FOLLOWUP_LENGTH = 3


class IssuePortalListCreateView(APIView):
    """
    GET  /api/portal/issues/ — student's own reports
    POST /api/portal/issues/ — submit a new report (description only)
    """
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    throttle_classes = []

    def get(self, request):
        reports = IssueReport.objects.filter(student=request.user).order_by('-created_at')
        serializer = IssueReportPortalSerializer(reports, many=True)
        return Response({'results': serializer.data})

    def post(self, request):
        description = (request.data.get('description') or '').strip()
        if len(description) < MIN_DESCRIPTION_LENGTH:
            return Response(
                {'error': 'Please describe the issue in a bit more detail.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue = IssueReport.objects.create(student=request.user, description=description)
        run_triage(issue.id)
        issue.refresh_from_db()

        return Response(IssueReportPortalSerializer(issue).data, status=status.HTTP_201_CREATED)


class IssuePortalRespondView(APIView):
    """
    POST /api/portal/issues/{id}/respond/ — add justification/proof.

    Only meaningful while status=awaiting_proof (the system asked a
    follow-up question before it will suggest a fix to admin). Re-runs
    triage immediately so the student sees whether it's now queued for
    admin review.
    """
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    throttle_classes = []

    def post(self, request, id):
        try:
            issue = IssueReport.objects.get(id=id, student=request.user)
        except IssueReport.DoesNotExist:
            return Response({'error': 'Report not found.'}, status=status.HTTP_404_NOT_FOUND)

        if issue.status != IssueStatusChoices.AWAITING_PROOF:
            return Response(
                {'error': 'This report is not waiting on a response.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        followup = (request.data.get('response') or '').strip()
        if len(followup) < MIN_FOLLOWUP_LENGTH:
            return Response({'error': 'Please add a bit more detail.'}, status=status.HTTP_400_BAD_REQUEST)

        issue.student_followup = followup
        issue.save(update_fields=['student_followup', 'updated_at'])

        run_followup(issue.id)
        issue.refresh_from_db()

        return Response(IssueReportPortalSerializer(issue).data)


class IssuePortalReopenView(APIView):
    """POST /api/portal/issues/{id}/reopen/ — dispute an auto-resolved/resolved report."""
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    throttle_classes = []

    def post(self, request, id):
        try:
            issue = IssueReport.objects.get(id=id, student=request.user)
        except IssueReport.DoesNotExist:
            return Response({'error': 'Report not found.'}, status=status.HTTP_404_NOT_FOUND)

        if issue.status not in (IssueStatusChoices.AUTO_RESOLVED, IssueStatusChoices.RESOLVED):
            return Response(
                {'error': 'Only auto-resolved or resolved reports can be reopened.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue.status = IssueStatusChoices.IN_REVIEW
        if issue.severity in (IssueSeverityChoices.LOW, IssueSeverityChoices.MEDIUM):
            issue.severity = IssueSeverityChoices.HIGH
        issue.save(update_fields=['status', 'severity', 'updated_at'])

        send_push_to_admins(
            'Issue reopened',
            f'{issue.student.full_name} said this report was not actually resolved.',
        )
        return Response({'id': str(issue.id), 'status': issue.status})
