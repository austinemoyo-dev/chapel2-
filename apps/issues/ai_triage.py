"""
AI-assisted triage for IssueReport.

Called synchronously from the portal view (create/respond) so the student
sees the outcome immediately instead of polling — the deterministic path
(diagnostics.py, keyword fallback) is instant either way, and even the AI
calls are short enough that one extra second on submit is an acceptable
trade for not needing a background job or a refresh.

Two jobs, kept separate on purpose:

1. Decide the *outcome* (auto-resolve vs. ask for proof vs. flag a fix vs.
   route to the admin queue) — always deterministic (diagnostics.py) or a
   plain keyword check, never the LLM's call.
2. Phrase the reply / produce a summary for the admin queue — this is the
   only part that uses Claude, and only when ANTHROPIC_API_KEY is set.
   Everything still works, just less precisely, with no AI configured.
"""
import json
import logging

from django.conf import settings
from django.utils import timezone

from apps.attendance.push import send_push_to_admins
from apps.services.models import Service

from .diagnostics import diagnose_service, recent_services_for
from .models import (
    IssueCategoryChoices,
    IssueSeverityChoices,
    IssueStatusChoices,
    ResolutionTypeChoices,
)

logger = logging.getLogger(__name__)

MODEL = 'claude-haiku-4-5-20251001'

ATTENDANCE_KEYWORDS = (
    'attendance', 'present', 'absent', 'missed', 'not showing', 'not see',
    "don't see", 'not seeing', 'incomplete', 'sign in', 'sign out', 'scan',
    'recorded', 'showing up', 'marked',
)

CLASSIFY_TOOL = {
    'name': 'classify_complaint',
    'description': 'Classify a student complaint about the attendance system.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'category': {'type': 'string', 'enum': [c.value for c in IssueCategoryChoices]},
            'service_ids': {
                'type': 'array',
                'items': {'type': 'string'},
                'description': (
                    'Only meaningful when category is wrong_status: ids (from the '
                    'supplied list) of the services this complaint most likely '
                    'concerns. Leave empty if unclear or not applicable.'
                ),
            },
        },
        'required': ['category', 'service_ids'],
    },
}

GENERAL_TOOL = {
    'name': 'triage_complaint',
    'description': 'Summarize a student complaint for an admin and draft a reply.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'category': {'type': 'string', 'enum': [c.value for c in IssueCategoryChoices]},
            'severity': {'type': 'string', 'enum': [s.value for s in IssueSeverityChoices]},
            'summary': {'type': 'string', 'description': 'One or two sentences for the admin.'},
            'draft_reply': {'type': 'string', 'description': 'A short, warm reply to the student.'},
        },
        'required': ['category', 'severity', 'summary', 'draft_reply'],
    },
}


def run_triage(issue_id):
    """First pass — runs once, right after the student submits."""
    from .models import IssueReport

    try:
        issue = IssueReport.objects.select_related('student', 'student__semester').get(id=issue_id)
    except IssueReport.DoesNotExist:
        return

    try:
        services = recent_services_for(issue.student)
        classification = _classify(issue.description, services)

        if classification['category'] == IssueCategoryChoices.WRONG_STATUS:
            _resolve_attendance_complaint(issue, services, set(classification['service_ids']))
        else:
            issue.category = classification['category']
            _triage_general(issue, services)

        issue.save()
        _notify_admins(issue)
    except Exception:
        logger.exception('Issue triage failed for %s', issue_id)


def run_followup(issue_id):
    """
    Re-evaluation after the student adds proof/justification via the
    respond endpoint. Re-checks the same services already flagged on the
    first pass — no re-classification, since we already know this is an
    attendance complaint and which service(s) it's about.
    """
    from .models import IssueReport

    try:
        issue = IssueReport.objects.select_related('student').get(id=issue_id)
    except IssueReport.DoesNotExist:
        return

    try:
        services = list(Service.objects.filter(id__in=issue.flagged_services))
        candidate_ids = set(issue.flagged_services)
        _resolve_attendance_complaint(issue, services, candidate_ids)
        issue.save()
        _notify_admins(issue)
    except Exception:
        logger.exception('Issue follow-up triage failed for %s', issue_id)


def _notify_admins(issue):
    if issue.severity in (IssueSeverityChoices.HIGH, IssueSeverityChoices.URGENT):
        title = (
            'New attendance complaint'
            if issue.category == IssueCategoryChoices.WRONG_STATUS
            else 'New urgent complaint'
        )
        send_push_to_admins(title, f'{issue.student.full_name}: {issue.description[:120]}')
    elif issue.status == IssueStatusChoices.AUTO_RESOLVED:
        send_push_to_admins(
            'Issue auto-resolved',
            f'{issue.student.full_name}: {issue.ai_summary[:120] or issue.description[:120]}',
        )


def _resolve_attendance_complaint(issue, services, candidate_ids):
    candidates = [s for s in services if str(s.id) in candidate_ids] or services
    results = [diagnose_service(issue.student, s) for s in candidates]
    fix_needed = [r for r in results if r['resolution'] == ResolutionTypeChoices.FIX_NEEDED]
    relevant = fix_needed or results
    facts = ' '.join(r['fact'] for r in relevant)

    issue.category = IssueCategoryChoices.WRONG_STATUS
    issue.flagged_services = [r['service_id'] for r in relevant]
    issue.ai_summary = facts

    needs_proof = [r for r in fix_needed if r['requires_proof']]

    if needs_proof and not issue.student_followup:
        # The one case ripe for abuse: "no record at all, window closed."
        # Hold the suggested fix back until the student justifies it —
        # this is the speed bump against free/late attendance claims.
        issue.resolution_type = ResolutionTypeChoices.AWAITING_PROOF
        issue.status = IssueStatusChoices.AWAITING_PROOF
        issue.suggested_fix = None
        reply = _proof_request_reply(needs_proof)
        issue.ai_draft_reply = reply
        issue.admin_reply = reply
    elif fix_needed:
        issue.resolution_type = ResolutionTypeChoices.FIX_NEEDED
        issue.severity = IssueSeverityChoices.HIGH
        issue.status = IssueStatusChoices.IN_REVIEW
        issue.suggested_fix = fix_needed[0]['suggested_fix']
        if issue.student_followup:
            issue.ai_summary = f'{facts} Student says: "{issue.student_followup}"'
        issue.ai_draft_reply = _phrase_reply(issue.ai_summary, is_problem=True)
    else:
        issue.resolution_type = ResolutionTypeChoices.EXPLAINED
        issue.status = IssueStatusChoices.AUTO_RESOLVED
        reply = _phrase_reply(facts, is_problem=False)
        issue.ai_draft_reply = reply
        issue.admin_reply = reply
        issue.resolved_at = timezone.now()


def _proof_request_reply(needs_proof_results):
    services_text = ', '.join(r['service_label'] for r in needs_proof_results)
    return (
        f"We don't have a record of you attending {services_text}, and the "
        f"attendance window has already closed. Before this can be corrected, "
        f"please reply with more detail — were you there but had a scanning "
        f"issue, were you running late, or is there someone who can confirm "
        f"you attended? Any detail helps us review this fairly."
    )


def _triage_general(issue, services):
    client = _get_client()
    if client is None:
        return  # stays on model defaults — still lands in the admin queue

    context_facts = [diagnose_service(issue.student, s)['fact'] for s in services[:5]]
    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=500,
            system=(
                "You triage complaints submitted to a church attendance system's "
                "student support inbox. Summarize the complaint for an admin and "
                "draft a short, warm reply. Use only the facts given — do not "
                "invent anything about the cause."
            ),
            messages=[{
                'role': 'user',
                'content': (
                    f'Complaint: "{issue.description}"\n\n'
                    f"Student's recent attendance facts: {json.dumps(context_facts)}"
                ),
            }],
            tools=[GENERAL_TOOL],
            tool_choice={'type': 'tool', 'name': 'triage_complaint'},
        )
        data = _tool_input(message)
        if data.get('category') in IssueCategoryChoices.values:
            issue.category = data['category']
        if data.get('severity') in IssueSeverityChoices.values:
            issue.severity = data['severity']
        issue.ai_summary = data.get('summary', '')
        issue.ai_draft_reply = data.get('draft_reply', '')
    except Exception:
        logger.exception('AI general triage failed for issue %s', issue.id)


def _classify(description, services):
    """Returns {'category': ..., 'service_ids': [...]}. service_ids is only
    meaningful for category=wrong_status; empty means "check every recent
    service" (either the AI couldn't tell, or AI isn't configured)."""
    client = _get_client()
    if client is None:
        return _keyword_fallback_classify(description)

    service_options = [
        {'id': str(s.id), 'label': s.name or f'{s.service_type} {s.service_group}', 'date': str(s.scheduled_date)}
        for s in services
    ]
    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=400,
            system=(
                "You triage complaints submitted to a church attendance system's "
                "student support inbox. Classify the complaint and, only if it is "
                "about attendance showing wrong or missing, point to which of the "
                "student's recent services (from the supplied list) it concerns."
            ),
            messages=[{
                'role': 'user',
                'content': (
                    f'Complaint: "{description}"\n\n'
                    f"Student's recent services: {json.dumps(service_options)}"
                ),
            }],
            tools=[CLASSIFY_TOOL],
            tool_choice={'type': 'tool', 'name': 'classify_complaint'},
        )
        data = _tool_input(message)
        category = data.get('category')
        if category not in IssueCategoryChoices.values:
            category = IssueCategoryChoices.OTHER
        valid_ids = {s['id'] for s in service_options}
        service_ids = [sid for sid in data.get('service_ids', []) if sid in valid_ids]
        return {'category': category, 'service_ids': service_ids}
    except Exception:
        logger.exception('AI classification failed — falling back to keyword check')
        return _keyword_fallback_classify(description)


def _keyword_fallback_classify(description):
    text = description.lower()
    if any(kw in text for kw in ATTENDANCE_KEYWORDS):
        return {'category': IssueCategoryChoices.WRONG_STATUS, 'service_ids': []}
    return {'category': IssueCategoryChoices.OTHER, 'service_ids': []}


def _phrase_reply(facts_text, is_problem):
    client = _get_client()
    if client is None:
        if is_problem:
            return facts_text + " We've flagged this for an admin to review and fix."
        return facts_text
    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=200,
            system=(
                'Write a short, warm reply (2-3 sentences) to a student about their '
                'attendance, based only on the facts given. Do not invent anything.'
            ),
            messages=[{'role': 'user', 'content': facts_text}],
        )
        text = ''.join(block.text for block in message.content if block.type == 'text').strip()
        return text or facts_text
    except Exception:
        logger.exception('AI reply phrasing failed — using raw facts')
        return facts_text


def _tool_input(message):
    return next(block.input for block in message.content if block.type == 'tool_use')


def _get_client():
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
    if not api_key:
        return None
    try:
        import anthropic
    except ImportError:
        logger.warning('anthropic package not installed — AI triage disabled.')
        return None
    return anthropic.Anthropic(api_key=api_key)
