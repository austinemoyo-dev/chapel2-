"""
Attendance Utilities — Validation, face matching, geo-fencing, and percentage calculation.

Core attendance business logic:
1. Time window validation
2. Geo-fence validation (haversine distance)
3. Device binding validation
4. 1-to-N face matching scoped by service group
5. Attendance percentage calculation (live query, no caching)
"""
import math
import logging
import numpy as np
from django.conf import settings
from django.db.models import Q

logger = logging.getLogger(__name__)


def validate_signout_window(service):
    """
    Check whether the current time is inside the sign-out window.

    If signout_open_time / signout_close_time are configured on the service,
    those are used. Otherwise falls back to the main attendance window so
    services that don't need a separate sign-out period still work.
    """
    from django.utils import timezone
    now = timezone.now()

    if service.is_cancelled:
        return False, 'This service has been cancelled.'

    if service.signout_open_time and service.signout_close_time:
        if now < service.signout_open_time:
            return False, (
                f'Sign-out window has not opened yet. '
                f'Opens at {service.signout_open_time.strftime("%H:%M")} UTC.'
            )
        if now > service.signout_close_time:
            return False, (
                f'Sign-out window has closed. '
                f'Closed at {service.signout_close_time.strftime("%H:%M")} UTC.'
            )
        return True, 'Within sign-out window.'

    # No dedicated sign-out window — fall back to the main attendance window
    return validate_time_window(service)


def validate_time_window(service):
    """
    Check if the current time is within the service's attendance window.
    
    Returns:
        tuple: (is_valid: bool, message: str)
    """
    from django.utils import timezone
    now = timezone.now()

    if service.is_cancelled:
        return False, 'This service has been cancelled.'

    if now < service.window_open_time:
        return False, f'Attendance window has not opened yet. Opens at {service.window_open_time}.'

    if now > service.window_close_time:
        return False, f'Attendance window has closed. Closed at {service.window_close_time}.'

    return True, 'Within time window.'


def haversine_distance(lat1, lng1, lat2, lng2):
    """
    Calculate the great-circle distance between two GPS coordinates
    using the Haversine formula.
    
    Returns:
        float: Distance in meters
    """
    R = 6371000  # Earth's radius in meters

    lat1_rad = math.radians(float(lat1))
    lat2_rad = math.radians(float(lat2))
    dlat = math.radians(float(lat2) - float(lat1))
    dlng = math.radians(float(lng2) - float(lng1))

    a = (math.sin(dlat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) *
         math.sin(dlng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def validate_geo_fence(gps_lat, gps_lng):
    """
    Check if the given GPS coordinates are within the configured geo-fence.
    
    Returns:
        tuple: (is_valid: bool, distance_meters: float, message: str)
    """
    from apps.services.models import GeoFenceConfig

    config = GeoFenceConfig.get_config()

    # If geo-fence coordinates are still at the default (0, 0) the Superadmin
    # has not configured the chapel location yet.  Block all attendance marking
    # rather than silently skipping — this prevents a configuration gap from
    # becoming an open window for fraudulent marking.
    if float(config.latitude) == 0.0 and float(config.longitude) == 0.0:
        logger.error(
            'Geo-fence is not configured. Attendance marking is blocked. '
            'Superadmin must set chapel GPS coordinates via /api/geo-fence/.'
        )
        return False, 0, (
            'Geo-fence is not configured. '
            'Contact Superadmin to set the chapel GPS coordinates before marking attendance.'
        )

    distance = haversine_distance(
        gps_lat, gps_lng,
        config.latitude, config.longitude
    )

    if distance <= config.radius_meters:
        return True, distance, f'Within geo-fence ({distance:.0f}m from center).'
    else:
        return False, distance, (
            f'Outside authorized geo-fence. '
            f'You are {distance:.0f}m from the chapel. '
            f'Maximum allowed: {config.radius_meters}m.'
        )


def validate_device_binding(user, device_id):
    """
    Check if the device_id matches the user's bound device.
    
    Returns:
        tuple: (is_valid: bool, message: str)
    """
    if not user.bound_device_id:
        return False, 'No device bound to your account. Contact Superadmin.'

    if user.bound_device_id != device_id:
        return False, (
            'This device is not authorized for attendance marking. '
            'You must use your registered device.'
        )

    return True, 'Device verified.'


def match_face_1_to_n(face_embedding, service_id):
    """
    Perform 1-to-N face matching against the active service's student pool.
    
    Uses cosine similarity between the input embedding and all stored
    embeddings for students assigned to the service's group.
    
    For special services (service_group='all'), matches against ALL
    registered students in the current semester.
    
    Args:
        face_embedding: list/array — the 512-dimensional Facenet512 embedding
        service_id: UUID — the active service
    
    Returns:
        dict: {
            'matched': bool,
            'student_id': UUID or None,
            'student_name': str or None,
            'confidence': float,
            'message': str
        }
    """
    from apps.services.models import Service
    from apps.students.models import FaceSample

    try:
        service = Service.objects.get(id=service_id)
    except Service.DoesNotExist:
        return {
            'matched': False, 'student_id': None,
            'student_name': None, 'confidence': 0.0,
            'message': 'Service not found.',
        }

    # Determine the matching pool based on service group
    if service.service_group == 'all':
        # Special service — all registered students in the semester
        samples = FaceSample.objects.filter(
            semester=service.semester,
            status='approved',
            student__is_active=True,
        ).select_related('student')
    else:
        # Regular service — only students assigned to this service group
        samples = FaceSample.objects.filter(
            semester=service.semester,
            status='approved',
            student__is_active=True,
            student__service_group=service.service_group,
        ).select_related('student')

    if not samples.exists():
        return {
            'matched': False, 'student_id': None,
            'student_name': None, 'confidence': 0.0,
            'message': 'No face embeddings available for this service pool.',
        }

    # Normalize the probe embedding
    input_embedding = np.array(face_embedding, dtype=np.float64)
    input_norm = np.linalg.norm(input_embedding)
    if input_norm == 0:
        return {
            'matched': False, 'student_id': None,
            'student_name': None, 'confidence': 0.0,
            'message': 'Invalid face embedding.',
        }
    input_embedding = input_embedding / input_norm

    threshold = settings.DEEPFACE_MATCH_THRESHOLD

    # Build a normalized matrix of all stored embeddings in one pass.
    # Skip samples with zero/empty vectors (mock embeddings from before
    # DeepFace was installed) so they never produce false matches.
    valid_samples = []
    rows = []
    for sample in samples:
        if not sample.embedding_vector:
            continue
        vec = np.array(sample.embedding_vector, dtype=np.float64)
        norm = np.linalg.norm(vec)
        if norm == 0:
            continue  # skip mock zero-vector embeddings
        rows.append(vec / norm)
        valid_samples.append(sample)

    if not valid_samples:
        return {
            'matched': False, 'student_id': None,
            'student_name': None, 'confidence': 0.0,
            'message': 'No valid face embeddings in this service pool.',
        }

    # Single BLAS matrix-vector multiply: (N, 512) @ (512,) = (N,)
    # Orders of magnitude faster than a Python loop for large pools.
    matrix = np.vstack(rows)
    similarities = matrix @ input_embedding
    best_idx = int(np.argmax(similarities))
    best_similarity = float(similarities[best_idx])
    best_match = valid_samples[best_idx]

    cosine_distance = 1.0 - best_similarity
    if cosine_distance < threshold:
        return {
            'matched': True,
            'student_id': best_match.student.id,
            'student_name': best_match.student.full_name,
            'confidence': best_similarity,
            'message': f'Matched: {best_match.student.full_name} (confidence: {best_similarity:.4f})',
        }

    return {
        'matched': False,
        'student_id': None,
        'student_name': None,
        'confidence': best_similarity,
        'message': 'No matching face found in the service pool.',
    }


def calculate_attendance_percentage(student, semester_id):
    """
    Calculate attendance percentage for a student in a given semester.
    
    Formula: (Valid Attendances / Total Required Services) x 100
    
    Rules:
    - Total Required = all non-cancelled services applicable to the student
    - Excused backdated records are excluded from the total required count
    - Always calculated live via database query — never cached
    
    Returns:
        dict: {
            'percentage': float,
            'valid_count': int,
            'total_required': int,
            'excused_count': int,
            'below_threshold': bool (True if < 70%)
        }
    """
    from apps.services.models import Service
    from apps.attendance.models import AttendanceRecord

    # Count total required services for this student
    # Regular services: only count services matching the student's group
    # Special services: count all (service_group='all')
    total_services = Service.objects.filter(
        semester_id=semester_id,
        is_cancelled=False,
    ).filter(
        Q(service_group=student.service_group) | Q(service_group='all')
    ).count()

    # Count excused records — these are excluded from total required
    excused_count = AttendanceRecord.objects.filter(
        student=student,
        service__semester_id=semester_id,
        is_backdated=True,
        backdate_type='excused',
    ).count()

    # Adjusted total required
    total_required = total_services - excused_count

    # Count valid attendances (excluding excused)
    valid_count = AttendanceRecord.objects.filter(
        student=student,
        service__semester_id=semester_id,
        is_valid=True,
    ).exclude(
        is_backdated=True, backdate_type='excused'
    ).count()

    # Calculate percentage
    if total_required > 0:
        percentage = (valid_count / total_required) * 100
    else:
        percentage = 0.0

    return {
        'percentage': round(percentage, 2),
        'valid_count': valid_count,
        'total_required': total_required,
        'excused_count': excused_count,
        'below_threshold': percentage < 70.0,
    }


def get_service_embeddings(service_id):
    """
    Get all face embeddings for the service's student pool.
    Used by protocol member devices for offline face matching.
    
    Returns:
        list: [{'student_id': uuid, 'student_name': str, 'embeddings': [...]}]
    """
    from apps.services.models import Service
    from apps.students.models import FaceSample

    try:
        service = Service.objects.get(id=service_id)
    except Service.DoesNotExist:
        return []

    # Determine pool
    if service.service_group == 'all':
        samples = FaceSample.objects.filter(
            semester=service.semester,
            status='approved',
            student__is_active=True,
        ).select_related('student')
    else:
        samples = FaceSample.objects.filter(
            semester=service.semester,
            status='approved',
            student__is_active=True,
            student__service_group=service.service_group,
        ).select_related('student')

    # Group embeddings by student
    student_embeddings = {}
    for sample in samples:
        sid = str(sample.student.id)
        if sid not in student_embeddings:
            student_embeddings[sid] = {
                'student_id': sid,
                'student_name': sample.student.full_name,
                'embeddings': [],
            }
        student_embeddings[sid]['embeddings'].append(sample.embedding_vector)

    return list(student_embeddings.values())
