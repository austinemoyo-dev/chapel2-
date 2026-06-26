"""
Chat-turn handling for IssueReport conversations.

Called synchronously, right after a student message is saved, so the
student sees the AI's reply in the same request — this is a real chat, not
a fire-and-forget background job.

Three things this module decides, kept separate on purpose:

1. Whether to *engage* at all — once an admin has replied, the AI stops
   auto-responding; once a closed ticket gets a new message, it's reopened
   for a human, not re-triaged.
2. The attendance-visibility outcome (auto-resolve / ask for proof / escalate)
   — always deterministic (diagnostics.py), never the LLM's call. This is
   what makes the proof-gate against "free attendance" claims reliable even
   when no AI is configured.
3. Everything else — a bounded reply-or-escalate chat loop using whichever
   AI provider is configured (Groq preferred — free, no card needed, same
   key the frontend chatbot already uses; Anthropic supported as a
   fallback). Without either, general complaints can't hold a
   conversation, so they escalate to a ticket immediately instead of
   leaving the student with no response.
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
    IssueMessageSenderChoices,
    ResolutionTypeChoices,
)

logger = logging.getLogger(__name__)

GROQ_MODEL = 'llama-3.3-70b-versatile'
ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'

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

RESPOND_TOOL = {
    'name': 'respond_to_student',
    'description': (
        "Respond to the student in an ongoing support chat, or escalate to a "
        "human admin if you can't resolve it yourself."
    ),
    'input_schema': {
        'type': 'object',
        'properties': {
            'action': {'type': 'string', 'enum': ['reply', 'escalate']},
            'message': {'type': 'string', 'description': 'What to say to the student. Always include this.'},
            'category': {'type': 'string', 'enum': [c.value for c in IssueCategoryChoices]},
            'severity': {'type': 'string', 'enum': [s.value for s in IssueSeverityChoices]},
            'summary': {'type': 'string', 'description': 'One or two sentences for the admin — only needed when escalating.'},
        },
        'required': ['action', 'message', 'category', 'severity'],
    },
}

GENERAL_CHAT_SYSTEM = (
    "You are a support chat assistant for a church attendance tracking app. "
    "A student is messaging you about something other than their attendance "
    "record showing wrong or missing (that case is handled elsewhere, "
    "deterministically). Try to help directly only from general knowledge of "
    "how an app like this works. Never invent specifics about this student's "
    "account, device, or data — you have none. If resolving this needs someone "
    "to actually look at their account or device, or you're not confident, set "
    "action to 'escalate' rather than guessing. Keep replies short and warm."
)


def handle_student_message(issue_id):
    """
    Entry point — call this right after saving the student's IssueMessage.
    Decides and posts the next turn (AI reply, proof request, escalation,
    or silent hand-off if a human admin already has the thread).
    """
    from .models import IssueReport

    try:
        issue = IssueReport.objects.select_related('student', 'student__semester').get(id=issue_id)
    except IssueReport.DoesNotExist:
        return

    try:
        if issue.messages.filter(sender=IssueMessageSenderChoices.ADMIN).exists():
            # A human already took this over — don't auto-reply, just flag it.
            send_push_to_admins(
                'New reply',
                f'{issue.student.full_name} replied on ticket {issue.ticket_code}.',
            )
            return

        if issue.status in (IssueStatusChoices.RESOLVED, IssueStatusChoices.AUTO_RESOLVED, IssueStatusChoices.DISMISSED):
            issue.status = IssueStatusChoices.IN_REVIEW
            issue.resolved_at = None
            issue.resolved_by = None
            issue.save()
            _send_ai_message(issue, "Got it — I've reopened this and flagged it for an admin to take another look.")
            send_push_to_admins('Issue reopened', f'{issue.student.full_name} reopened ticket {issue.ticket_code}.')
            return

        is_first_message = issue.messages.filter(sender=IssueMessageSenderChoices.STUDENT).count() <= 1

        if is_first_message:
            latest = issue.messages.filter(sender=IssueMessageSenderChoices.STUDENT).latest('created_at')
            services = recent_services_for(issue.student)
            classification = _classify(latest.text, services)
            issue.category = classification['category']
            if classification['category'] == IssueCategoryChoices.WRONG_STATUS:
                _advance_attendance_flow(issue, services, set(classification['service_ids']))
            else:
                _advance_general_flow(issue)
        elif issue.category == IssueCategoryChoices.WRONG_STATUS:
            services = list(Service.objects.filter(id__in=issue.flagged_services))
            _advance_attendance_flow(issue, services, set(issue.flagged_services))
        else:
            _advance_general_flow(issue)

        issue.save()
    except Exception:
        logger.exception('Issue chat turn failed for %s', issue_id)


def _advance_attendance_flow(issue, services, candidate_ids):
    candidates = [s for s in services if str(s.id) in candidate_ids] or services
    results = [diagnose_service(issue.student, s) for s in candidates]
    fix_needed = [r for r in results if r['resolution'] == ResolutionTypeChoices.FIX_NEEDED]
    relevant = fix_needed or results
    facts = ' '.join(r['fact'] for r in relevant)

    issue.flagged_services = [r['service_id'] for r in relevant]
    issue.ai_summary = facts

    needs_proof = [r for r in fix_needed if r['requires_proof']]

    if needs_proof:
        if issue.resolution_type == ResolutionTypeChoices.AWAITING_PROOF:
            # Already asked once — this message is the student's answer.
            issue.resolution_type = ResolutionTypeChoices.FIX_NEEDED
            issue.severity = IssueSeverityChoices.HIGH
            issue.status = IssueStatusChoices.IN_REVIEW
            issue.suggested_fix = needs_proof[0]['suggested_fix']
            _send_ai_message(issue, _escalation_message(issue))
            _notify_new_ticket(issue)
        else:
            # The one case ripe for abuse: "no record at all, window closed."
            # Ask before suggesting any fix — the speed bump against
            # free/late attendance claims.
            issue.resolution_type = ResolutionTypeChoices.AWAITING_PROOF
            issue.status = IssueStatusChoices.AWAITING_PROOF
            _send_ai_message(issue, _proof_request_reply(needs_proof))
    elif fix_needed:
        issue.resolution_type = ResolutionTypeChoices.FIX_NEEDED
        issue.severity = IssueSeverityChoices.HIGH
        issue.status = IssueStatusChoices.IN_REVIEW
        _send_ai_message(issue, _escalation_message(issue))
        _notify_new_ticket(issue)
    else:
        issue.resolution_type = ResolutionTypeChoices.EXPLAINED
        issue.status = IssueStatusChoices.AUTO_RESOLVED
        issue.resolved_at = timezone.now()
        _send_ai_message(issue, _phrase_reply(facts, is_problem=False))
        _notify_auto_resolved(issue)


def _advance_general_flow(issue):
    data = _call_tool(
        system=GENERAL_CHAT_SYSTEM,
        messages=_build_history(issue),
        name=RESPOND_TOOL['name'],
        description=RESPOND_TOOL['description'],
        schema=RESPOND_TOOL['input_schema'],
    )
    if data is None:
        # Can't hold a conversation without AI configured (or the call
        # failed) — escalate rather than leaving the student with no reply.
        issue.status = IssueStatusChoices.IN_REVIEW
        _send_ai_message(issue, f"Thanks — I've created ticket {issue.ticket_code} for our admin team. They'll respond here.")
        _notify_new_ticket(issue)
        return

    if data.get('category') in IssueCategoryChoices.values:
        issue.category = data['category']
    if data.get('severity') in IssueSeverityChoices.values:
        issue.severity = data['severity']

    reply_text = data.get('message') or "Could you tell me a bit more about what's going on?"
    if data.get('action') == 'escalate':
        issue.status = IssueStatusChoices.IN_REVIEW
        issue.ai_summary = data.get('summary', '')
        _send_ai_message(issue, f'{reply_text} {_escalation_message(issue)}'.strip())
        _notify_new_ticket(issue)
    else:
        _send_ai_message(issue, reply_text)


def _escalation_message(issue):
    return (
        f"I've created ticket {issue.ticket_code} for our admin team to review — "
        f"they'll respond right here once they've looked into it."
    )


def _proof_request_reply(needs_proof_results):
    services_text = ', '.join(r['service_label'] for r in needs_proof_results)
    return (
        f"We don't have a record of you attending {services_text}, and the "
        f"attendance window has already closed. Before this can be corrected, "
        f"please reply with more detail — were you there but had a scanning "
        f"issue, were you running late, or is there someone who can confirm "
        f"you attended? You can also attach a photo as evidence. Any detail "
        f"helps us review this fairly."
    )


def _build_history(issue):
    """Map the message thread to Anthropic's alternating user/assistant format."""
    turns = []
    for msg in issue.messages.order_by('created_at'):
        if not msg.text:
            continue
        if msg.sender == IssueMessageSenderChoices.AI:
            role, content = 'assistant', msg.text
        elif msg.sender == IssueMessageSenderChoices.ADMIN:
            role, content = 'user', f'[Admin]: {msg.text}'
        else:
            role, content = 'user', msg.text
        if turns and turns[-1]['role'] == role:
            turns[-1]['content'] += '\n' + content
        else:
            turns.append({'role': role, 'content': content})
    return turns


def _send_ai_message(issue, text):
    from .models import IssueMessage
    IssueMessage.objects.create(issue=issue, sender=IssueMessageSenderChoices.AI, text=text)


def _notify_new_ticket(issue):
    send_push_to_admins(
        f'New ticket {issue.ticket_code}',
        f'{issue.student.full_name}: {issue.ai_summary[:120] if issue.ai_summary else "needs review"}',
    )


def _notify_auto_resolved(issue):
    send_push_to_admins(
        'Issue auto-resolved',
        f'{issue.student.full_name}: {issue.ai_summary[:120]}',
    )


def _classify(description, services):
    """Returns {'category': ..., 'service_ids': [...]}. service_ids is only
    meaningful for category=wrong_status; empty means "check every recent
    service" (either the AI couldn't tell, or AI isn't configured)."""
    service_options = [
        {'id': str(s.id), 'label': s.name or f'{s.service_type} {s.service_group}', 'date': str(s.scheduled_date)}
        for s in services
    ]
    data = _call_tool(
        system=(
            "You triage complaints submitted to a church attendance system's "
            "student support chat. Classify the complaint and, only if it is "
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
        name=CLASSIFY_TOOL['name'],
        description=CLASSIFY_TOOL['description'],
        schema=CLASSIFY_TOOL['input_schema'],
    )
    if data is None:
        return _keyword_fallback_classify(description)

    category = data.get('category')
    if category not in IssueCategoryChoices.values:
        category = IssueCategoryChoices.OTHER
    valid_ids = {s['id'] for s in service_options}
    service_ids = [sid for sid in data.get('service_ids', []) if sid in valid_ids]
    return {'category': category, 'service_ids': service_ids}


def _keyword_fallback_classify(description):
    text = description.lower()
    if any(kw in text for kw in ATTENDANCE_KEYWORDS):
        return {'category': IssueCategoryChoices.WRONG_STATUS, 'service_ids': []}
    return {'category': IssueCategoryChoices.OTHER, 'service_ids': []}


def _phrase_reply(facts_text, is_problem):
    text = _call_text(
        system=(
            'Write a short, warm reply (2-3 sentences) to a student about their '
            'attendance, based only on the facts given. Do not invent anything.'
        ),
        messages=[{'role': 'user', 'content': facts_text}],
    )
    if text:
        return text
    if is_problem:
        return facts_text + " We've flagged this for an admin to review and fix."
    return facts_text


def _call_tool(system, messages, name, description, schema):
    """Calls whichever AI provider is configured and returns the parsed
    tool-call arguments as a dict, or None if unconfigured / the call failed."""
    provider = _get_provider()
    if provider is None:
        return None
    try:
        if provider['kind'] == 'groq':
            response = provider['client'].chat.completions.create(
                model=GROQ_MODEL,
                max_tokens=600,
                messages=[{'role': 'system', 'content': system}, *messages],
                tools=[{'type': 'function', 'function': {'name': name, 'description': description, 'parameters': schema}}],
                tool_choice={'type': 'function', 'function': {'name': name}},
            )
            call = response.choices[0].message.tool_calls[0]
            return json.loads(call.function.arguments)

        message = provider['client'].messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=600,
            system=system,
            messages=messages,
            tools=[{'name': name, 'description': description, 'input_schema': schema}],
            tool_choice={'type': 'tool', 'name': name},
        )
        return next(block.input for block in message.content if block.type == 'tool_use')
    except Exception:
        logger.exception('AI tool call (%s) failed', name)
        return None


def _call_text(system, messages):
    """Calls whichever AI provider is configured for a plain text reply, or
    returns None if unconfigured / the call failed."""
    provider = _get_provider()
    if provider is None:
        return None
    try:
        if provider['kind'] == 'groq':
            response = provider['client'].chat.completions.create(
                model=GROQ_MODEL,
                max_tokens=300,
                messages=[{'role': 'system', 'content': system}, *messages],
            )
            return (response.choices[0].message.content or '').strip()

        message = provider['client'].messages.create(
            model=ANTHROPIC_MODEL, max_tokens=300, system=system, messages=messages,
        )
        return ''.join(block.text for block in message.content if block.type == 'text').strip()
    except Exception:
        logger.exception('AI text call failed')
        return None


def _get_provider():
    """Groq preferred (free, already configured for the frontend chatbot);
    Anthropic supported as a fallback if that key is set instead."""
    groq_key = getattr(settings, 'GROQ_API_KEY', '')
    if groq_key:
        try:
            from groq import Groq
        except ImportError:
            logger.warning('groq package not installed — checking for Anthropic instead.')
        else:
            return {'kind': 'groq', 'client': Groq(api_key=groq_key)}

    anthropic_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
    if anthropic_key:
        try:
            import anthropic
        except ImportError:
            logger.warning('anthropic package not installed — AI triage disabled.')
        else:
            return {'kind': 'anthropic', 'client': anthropic.Anthropic(api_key=anthropic_key)}

    return None
