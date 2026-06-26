"""
Issue Reports — student-submitted complaints, held as a chat thread between
the student and the system, with AI-assisted triage and auto-resolution for
the attendance-visibility case.

`IssueReport` is the ticket/conversation container. `IssueMessage` is each
turn in that conversation (student, AI, or admin). `category`,
`flagged_services`, `severity`, `resolution_type`, and `suggested_fix` are
all populated by triage (apps/issues/ai_triage.py) — never chosen by the
student. See diagnostics.py for the deterministic "is this actually a data
problem" checks that drive auto-resolution.
"""
import uuid
from django.db import models
from django.conf import settings


class IssueCategoryChoices(models.TextChoices):
    SCAN_FAILED = 'scan_failed', 'Scan Failed'
    WRONG_STATUS = 'wrong_status', 'Wrong/Missing Attendance Status'
    SYNC_ISSUE = 'sync_issue', 'Sync Issue'
    ACCOUNT_ACCESS = 'account_access', 'Account Access'
    OTHER = 'other', 'Other'


class IssueStatusChoices(models.TextChoices):
    OPEN = 'open', 'Open'
    AWAITING_PROOF = 'awaiting_proof', 'Awaiting Proof'
    IN_REVIEW = 'in_review', 'In Review'
    AUTO_RESOLVED = 'auto_resolved', 'Auto-Resolved'
    RESOLVED = 'resolved', 'Resolved'
    DISMISSED = 'dismissed', 'Dismissed'


class IssueSeverityChoices(models.TextChoices):
    LOW = 'low', 'Low'
    MEDIUM = 'medium', 'Medium'
    HIGH = 'high', 'High'
    URGENT = 'urgent', 'Urgent'


class ResolutionTypeChoices(models.TextChoices):
    NONE = 'none', 'None'
    EXPLAINED = 'explained', 'Explained'                 # no data change needed
    AWAITING_PROOF = 'awaiting_proof', 'Awaiting Proof'  # asked the student to justify before this can become a fix
    FIX_NEEDED = 'fix_needed', 'Fix Needed'              # needs an admin-approved data change


class IssueReport(models.Model):
    """A conversation/ticket between a student and the system about one issue."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='issue_reports',
        help_text='Student who opened this conversation',
    )

    category = models.CharField(
        max_length=20,
        choices=IssueCategoryChoices.choices,
        default=IssueCategoryChoices.OTHER,
        help_text='Assigned by triage after the first message — not chosen by the student',
    )
    flagged_services = models.JSONField(
        default=list,
        blank=True,
        help_text='Service UUIDs triage determined the complaint relates to, if any',
    )

    status = models.CharField(
        max_length=15,
        choices=IssueStatusChoices.choices,
        default=IssueStatusChoices.OPEN,
        db_index=True,
    )
    severity = models.CharField(
        max_length=10,
        choices=IssueSeverityChoices.choices,
        default=IssueSeverityChoices.MEDIUM,
        db_index=True,
    )
    resolution_type = models.CharField(
        max_length=15,
        choices=ResolutionTypeChoices.choices,
        default=ResolutionTypeChoices.NONE,
        help_text='Set by deterministic diagnostics, never by the LLM',
    )
    suggested_fix = models.JSONField(
        null=True,
        blank=True,
        help_text='e.g. {"action": "backdate", "service_ids": [...], "backdate_type": "valid"} '
                   '— pre-fills the existing attendance edit/backdate form for one-click admin approval',
    )
    ai_summary = models.TextField(
        blank=True,
        default='',
        help_text='Admin-facing quick-glance summary of the thread, kept in sync by triage',
    )

    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_issue_reports',
        help_text='Null for auto-resolved tickets',
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'issue_reports'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['status', 'severity'], name='idx_issue_status_severity'),
            models.Index(fields=['student', 'status'], name='idx_issue_student_status'),
        ]

    def __str__(self):
        return f'Issue({self.student.full_name} — {self.category} [{self.status}])'

    @property
    def ticket_code(self):
        """Short human-friendly reference shown when a ticket is escalated, e.g. ISS-260626-3F2A1B."""
        return f'ISS-{self.created_at:%y%m%d}-{str(self.id)[:6].upper()}'


class IssueMessageSenderChoices(models.TextChoices):
    STUDENT = 'student', 'Student'
    AI = 'ai', 'AI'
    ADMIN = 'admin', 'Admin'


class IssueMessage(models.Model):
    """One turn in an IssueReport conversation."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    issue = models.ForeignKey(IssueReport, on_delete=models.CASCADE, related_name='messages')
    sender = models.CharField(max_length=10, choices=IssueMessageSenderChoices.choices)
    text = models.TextField(blank=True, default='')
    attachment = models.ImageField(
        upload_to='issue_attachments/%Y/%m/',
        blank=True,
        null=True,
        help_text='Evidence photo the student attached — e.g. proof they were present',
    )
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='issue_messages',
        help_text='Set when sender=admin',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'issue_messages'
        ordering = ['created_at']

    def __str__(self):
        return f'{self.sender}: {self.text[:60]}'
