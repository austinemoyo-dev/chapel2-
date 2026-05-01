"""
Student Utilities — Duplicate detection, service assignment, and system ID generation.

Core business logic for student registration:
1. Exact match on matric number and phone number
2. Fuzzy match on full name using RapidFuzz
3. Random service group assignment respecting capacity caps
"""
import logging
import secrets
from rapidfuzz import fuzz, process as rfprocess
from django.conf import settings
from django.db.models import Count

logger = logging.getLogger(__name__)


def generate_system_id():
    """
    Generate a unique system ID for new students.
    Format: CHP-XXXXXXXX (8 hex chars uppercase)
    """
    from apps.students.models import Student
    while True:
        sid = f'CHP-{secrets.token_hex(4).upper()}'
        if not Student.objects.filter(system_id=sid).exists():
            return sid


def check_duplicate_matric(matric_number, semester_id, exclude_student_id=None):
    """
    Exact match check for matric number within the same semester.
    
    Returns:
        dict or None: Details of the existing student if duplicate found.
    """
    from apps.students.models import Student

    if not matric_number:
        return None

    qs = Student.objects.filter(
        matric_number__iexact=matric_number.strip(),
        semester_id=semester_id,
    )
    if exclude_student_id:
        qs = qs.exclude(id=exclude_student_id)

    existing = qs.first()
    if existing:
        return {
            'type': 'matric_exact',
            'matched_student_id': str(existing.id),
            'matched_name': existing.full_name,
            'matched_matric': existing.matric_number,
            'message': f'Matric number {matric_number} already registered to {existing.full_name}.'
        }
    return None


def check_duplicate_phone(phone_number, semester_id, exclude_student_id=None):
    """
    Exact match check for phone number within the same semester.
    
    Returns:
        dict or None: Details of the existing student if duplicate found.
    """
    from apps.students.models import Student

    if not phone_number:
        return None

    qs = Student.objects.filter(
        phone_number=phone_number.strip(),
        semester_id=semester_id,
    )
    if exclude_student_id:
        qs = qs.exclude(id=exclude_student_id)

    existing = qs.first()
    if existing:
        return {
            'type': 'phone_exact',
            'matched_student_id': str(existing.id),
            'matched_name': existing.full_name,
            'matched_phone': existing.phone_number,
            'message': f'Phone number {phone_number} already registered to {existing.full_name}.'
        }
    return None


def check_fuzzy_name(full_name, semester_id, exclude_student_id=None, threshold=None):
    """
    Fuzzy match on full name using RapidFuzz.
    
    Catches rearrangements ('John Emmanuel' vs 'Emmanuel John') and
    typos ('Jonhn Emmanuel' vs 'John Emmanuel').
    
    Uses token_sort_ratio for rearrangement detection and
    fuzz.ratio for overall similarity.
    
    Args:
        full_name: Name to check (will be normalized to lowercase)
        semester_id: Semester scope for comparison
        exclude_student_id: UUID to exclude from comparison
        threshold: Similarity threshold (default from settings)
    
    Returns:
        list: List of match dicts with similarity scores above threshold.
    """
    from apps.students.models import Student

    if not full_name:
        return []

    if threshold is None:
        threshold = settings.FUZZY_NAME_MATCH_THRESHOLD

    normalized_name = full_name.lower().strip()

    # Get all students in the semester for comparison
    qs = Student.objects.filter(semester_id=semester_id)
    if exclude_student_id:
        qs = qs.exclude(id=exclude_student_id)

    existing_students = qs.values_list('id', 'full_name', 'full_name_normalized')

    matches = []
    for student_id, name, normalized in existing_students:
        # token_sort_ratio handles word rearrangements
        sort_score = fuzz.token_sort_ratio(normalized_name, normalized)
        # partial_ratio handles substrings and typos
        partial_score = fuzz.partial_ratio(normalized_name, normalized)
        # Take the higher of the two scores
        best_score = max(sort_score, partial_score)

        if best_score >= threshold:
            matches.append({
                'type': 'name_fuzzy',
                'matched_student_id': str(student_id),
                'matched_name': name,
                'similarity_score': best_score,
                'message': f'Name "{full_name}" is similar to "{name}" (score: {best_score}%).'
            })

    # Sort by similarity score descending
    matches.sort(key=lambda m: m['similarity_score'], reverse=True)
    return matches


def run_all_duplicate_checks(full_name, phone_number, semester_id,
                              matric_number=None, exclude_student_id=None):
    """
    Run all three duplicate checks in parallel and return consolidated results.
    
    Returns:
        dict: {
            'has_duplicates': bool,
            'checks': {
                'matric': dict or None,
                'phone': dict or None,
                'name': list of matches
            }
        }
    """
    matric_result = check_duplicate_matric(matric_number, semester_id, exclude_student_id)
    phone_result = check_duplicate_phone(phone_number, semester_id, exclude_student_id)
    name_results = check_fuzzy_name(full_name, semester_id, exclude_student_id)

    has_duplicates = bool(matric_result or phone_result or name_results)

    return {
        'has_duplicates': has_duplicates,
        'checks': {
            'matric': matric_result,
            'phone': phone_result,
            'name': name_results,
        }
    }


def assign_service_group(semester_id):
    """
    Randomly assign a student to a service group (S1/S2/S3),
    respecting per-group capacity caps stored on the Semester.
    
    Algorithm:
    1. Read capacity caps from Semester.service_group_capacities
    2. Count students per service group
    3. Filter out full groups
    4. Randomly pick from available groups
    
    Returns:
        str: Assigned service group ('S1', 'S2', or 'S3')
    
    Raises:
        ValueError: If all service groups are at capacity.
    """
    import random
    from apps.students.models import Student
    from apps.services.models import Semester

    # Get the semester and its capacity config
    try:
        semester = Semester.objects.get(id=semester_id)
    except Semester.DoesNotExist:
        raise ValueError('Semester not found.')

    caps = semester.service_group_capacities or {}

    # Count students per service group in this semester
    group_counts = dict(
        Student.objects.filter(
            semester_id=semester_id,
        ).values('service_group').annotate(
            count=Count('id')
        ).values_list('service_group', 'count')
    )

    # Check each group against its capacity
    available_groups = []
    for group in ['S1', 'S2', 'S3']:
        current_count = group_counts.get(group, 0)
        cap = caps.get(group, 500)  # Default 500 if not configured
        if current_count < cap:
            available_groups.append(group)

    if not available_groups:
        raise ValueError(
            'All service groups are at capacity. '
            'Contact Superadmin to increase capacity or reassign students.'
        )

    # Random assignment from available groups
    chosen = random.choice(available_groups)
    logger.info(
        f'Service assignment: {chosen} '
        f'(available: {available_groups}, counts: {group_counts}, caps: {caps})'
    )
    return chosen
