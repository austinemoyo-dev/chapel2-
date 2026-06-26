"""
Student Portal Views — the chat side of an issue report.

Auth reuses the existing student portal token (X-Portal-Token), same as
apps/students/portal_views.py. Every message — the first one (which opens
a new ticket) or a follow-up — goes through the same shape: save the
student's message, run the next AI turn synchronously, return the full
thread so the chat UI can render the reply immediately.
"""
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.students.portal_views import StudentPortalAuthentication, IsStudentAuthenticated

from .ai_triage import handle_student_message
from .models import IssueReport, IssueMessage, IssueMessageSenderChoices
from .serializers import IssueReportPortalListSerializer, IssueReportPortalDetailSerializer

MIN_MESSAGE_LENGTH = 3


class IssuePortalListCreateView(APIView):
    """
    GET  /api/portal/issues/ — student's tickets, most recently active first
    POST /api/portal/issues/ — open a new ticket with a first message
    """
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_classes = []

    def get(self, request):
        reports = IssueReport.objects.filter(student=request.user).order_by('-updated_at')
        return Response({'results': IssueReportPortalListSerializer(reports, many=True).data})

    def post(self, request):
        text = (request.data.get('text') or '').strip()
        if len(text) < MIN_MESSAGE_LENGTH:
            return Response(
                {'error': 'Please describe the issue in a bit more detail.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue = IssueReport.objects.create(student=request.user)
        IssueMessage.objects.create(
            issue=issue,
            sender=IssueMessageSenderChoices.STUDENT,
            text=text,
            attachment=request.data.get('attachment'),
        )
        handle_student_message(issue.id)
        issue.refresh_from_db()

        return Response(
            IssueReportPortalDetailSerializer(issue, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class IssuePortalThreadView(APIView):
    """GET /api/portal/issues/{id}/ — full conversation for one ticket."""
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    throttle_classes = []

    def get(self, request, id):
        try:
            issue = IssueReport.objects.get(id=id, student=request.user)
        except IssueReport.DoesNotExist:
            return Response({'error': 'Ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(IssueReportPortalDetailSerializer(issue, context={'request': request}).data)


class IssuePortalMessageView(APIView):
    """
    POST /api/portal/issues/{id}/messages/ — send a follow-up message.

    Works regardless of the ticket's current status — sending a message on
    a resolved ticket reopens it for human review; sending one while
    awaiting_proof is treated as the student's justification/evidence.
    """
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_classes = []

    def post(self, request, id):
        try:
            issue = IssueReport.objects.get(id=id, student=request.user)
        except IssueReport.DoesNotExist:
            return Response({'error': 'Ticket not found.'}, status=status.HTTP_404_NOT_FOUND)

        text = (request.data.get('text') or '').strip()
        attachment = request.data.get('attachment')
        if len(text) < MIN_MESSAGE_LENGTH and not attachment:
            return Response({'error': 'Please add a bit more detail.'}, status=status.HTTP_400_BAD_REQUEST)

        IssueMessage.objects.create(
            issue=issue,
            sender=IssueMessageSenderChoices.STUDENT,
            text=text,
            attachment=attachment,
        )
        handle_student_message(issue.id)
        issue.refresh_from_db()

        return Response(IssueReportPortalDetailSerializer(issue, context={'request': request}).data)
