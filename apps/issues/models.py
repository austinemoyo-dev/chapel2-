"""
Issue Reports — student-submitted complaints with AI-assisted triage and
auto-resolution for the attendance-visibility case.

Intake is free text only — category and the related service(s) are filled
in after the fact by triage (apps/issues/ai_triage.py), never chosen by the
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
    EXPLAINED = 'explained', 'Explained'       # no data change needed
    FIX_NEEDED = 'fix_needed', 'Fix Needed'    # needs an admin-approved data change


class IssueReport(models.Model):
    """
    A single student-submitted complaint.

    `category`, `flagged_services`, `severity`, `resolution_type`,
    `suggested_fix`, `ai_summary`, and `ai_draft_reply` are all populated by
    triage after creation — none of them are supplied by the student.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='issue_reports',
        help_text='Student who submitted the report',
    )
    description = models.TextField(
        help_text='Free-text complaint as typed by the student'
    )

    category = models.CharField(
        max_length=20,
        choices=IssueCategoryChoices.choices,
        default=IssueCategoryChoices.OTHER,
        help_text='Assigned by triage after submission — not chosen by the student',
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
        max_length=10,
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

    ai_summary = models.TextField(blank=True, default='')
    ai_draft_reply = models.TextField(blank=True, default='')
    admin_reply = models.TextField(
        blank=True,
        default='',
        help_text='What is actually shown to the student — defaults to the '
                   'auto-generated explanation/draft, editable by admin',
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
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'severity'], name='idx_issue_status_severity'),
            models.Index(fields=['student', 'status'], name='idx_issue_student_status'),
        ]

    def __str__(self):
        return f'Issue({self.student.full_name} — {self.category} [{self.status}])'
