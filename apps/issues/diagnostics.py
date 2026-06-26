"""
Attendance-visibility diagnostics — deterministic, no AI involved.

Given a student and a service, decides whether "I don't see my attendance"
is actually a non-issue (the record is correct, just explain it) or a real
data problem (no record / unexplained invalid record, needs an admin-
approved fix). This is what makes auto-resolution work even with no LLM
configured — the LLM (ai_triage.py) only phrases the reply text and picks
*which* services to check; it never decides the outcome.

The one case that's flagged but not immediately actionable is "no record at
all, and the window already closed" — that's exactly what a student would
claim to get free attendance with zero evidence, so it's marked
`requires_proof=True` and ai_triage.py holds back the suggested fix until
the student has written some justification.
"""
from django.db.models import Q
from django.utils import timezone

from apps.attendance.models import AttendanceRecord
from apps.services.models import Service

from .models import ResolutionTypeChoices


def recent_services_for(student, limit=8):
    """The student's most recent non-cancelled services, newest first."""
    return list(
        Service.objects.filter(
            semester=student.semester,
            is_cancelled=False,
        ).filter(
            Q(service_group=student.service_group) | Q(service_group='all')
        ).order_by('-scheduled_date')[:limit]
    )


def diagnose_service(student, service):
    """
    Returns a dict describing the attendance status for (student, service):
        {
            'resolution': ResolutionTypeChoices.EXPLAINED | FIX_NEEDED,
            'service_id': str,
            'service_label': str,
            'fact': str,                # human-readable, used to build the reply
            'suggested_fix': dict | None,
            'requires_proof': bool,     # True only for "no record at all, window closed"
        }

    `requires_proof` flags the one case ripe for abuse — a student claiming
    they attended a service that has already closed with zero record of
    them at all. The caller (ai_triage.py) must not surface `suggested_fix`
    for that case until the student has provided some justification —
    otherwise this becomes a free, no-evidence way to get attendance added.
    """
    label = service.name or f'{service.get_service_type_display()} ({service.service_group})'
    record = AttendanceRecord.objects.filter(student=student, service=service).first()
    now = timezone.now()

    if record and record.is_valid:
        fact = f'You are marked Present for {label} on {service.scheduled_date}'
        if record.signed_in_at:
            fact += f', signed in at {timezone.localtime(record.signed_in_at).strftime("%I:%M %p")}'
        fact += '.'
        return _result(ResolutionTypeChoices.EXPLAINED, service, label, fact, None)

    if record and not record.is_valid:
        if service.signout_required and not record.signed_out_at:
            fact = (
                f'{label} on {service.scheduled_date} shows "Incomplete" because this '
                f'service requires sign-out and no sign-out was recorded for you.'
            )
            return _result(ResolutionTypeChoices.EXPLAINED, service, label, fact, None)
        fact = (
            f'{label} on {service.scheduled_date} has a record but it is marked invalid '
            f'(sync_validation_result: {record.sync_validation_result or "n/a"}).'
        )
        return _result(ResolutionTypeChoices.FIX_NEEDED, service, label, fact, None)

    if service.window_close_time > now:
        fact = f'{label} on {service.scheduled_date} has not closed yet — attendance is not finalized.'
        return _result(ResolutionTypeChoices.EXPLAINED, service, label, fact, None)

    fact = f'No attendance record was found for {label} on {service.scheduled_date}, and the window has closed.'
    suggested_fix = {
        'action': 'backdate',
        'student_id': str(student.id),
        'service_ids': [str(service.id)],
        'backdate_type': 'valid',
    }
    return _result(ResolutionTypeChoices.FIX_NEEDED, service, label, fact, suggested_fix, requires_proof=True)


def _result(resolution, service, label, fact, suggested_fix, requires_proof=False):
    return {
        'resolution': resolution,
        'service_id': str(service.id),
        'service_label': label,
        'fact': fact,
        'suggested_fix': suggested_fix,
        'requires_proof': requires_proof,
    }
