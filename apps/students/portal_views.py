"""
Student Portal Views — Authentication and portal data for the student-facing portal.

Authentication flow:
- Students set up a password via face verification (prevents account hijacking)
- Login with phone (new students) or matric number (old students) + password
- Portal JWT uses Django signing (separate from admin JWT)
- Token passed via X-Portal-Token header to avoid conflict with admin Bearer tokens
"""
import logging
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password
from django.core import signing
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import BasePermission
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import Student, StudentAccount

logger = logging.getLogger(__name__)

PORTAL_TOKEN_SALT = 'student_portal_v1'
PORTAL_TOKEN_MAX_AGE = 60 * 60 * 24 * 7  # 7 days


# =============================================================================
# TOKEN HELPERS
# =============================================================================

def _generate_token(student_id: str) -> str:
    return signing.dumps({'student_id': student_id}, salt=PORTAL_TOKEN_SALT)


def _verify_token(token: str) -> str:
    try:
        data = signing.loads(token, salt=PORTAL_TOKEN_SALT, max_age=PORTAL_TOKEN_MAX_AGE)
        return data['student_id']
    except signing.SignatureExpired:
        raise ValueError('Token expired. Please log in again.')
    except Exception:
        raise ValueError('Invalid token.')


# =============================================================================
# AUTHENTICATION
# =============================================================================

class StudentPortalAuthentication(BaseAuthentication):
    """
    Authenticates student portal requests via X-Portal-Token header.
    Sets request.user to the Student instance on success.
    """
    def authenticate(self, request):
        token = request.META.get('HTTP_X_PORTAL_TOKEN', '').strip()
        if not token:
            return None
        try:
            student_id = _verify_token(token)
            student = (
                Student.objects
                .select_related('account', 'semester')
                .get(id=student_id)
            )
            try:
                if not student.account.is_active:
                    raise AuthenticationFailed('Portal account is deactivated. Contact admin.')
            except StudentAccount.DoesNotExist:
                raise AuthenticationFailed('No portal account found.')
            return (student, token)
        except (Student.DoesNotExist, ValueError) as exc:
            raise AuthenticationFailed(str(exc))

    def authenticate_header(self, request):
        return 'X-Portal-Token'


class IsStudentAuthenticated(BasePermission):
    def has_permission(self, request, view):
        return isinstance(request.user, Student)


# =============================================================================
# HELPERS
# =============================================================================

def _find_student(identifier: str):
    """Find active student by phone number (new) or matric number (old)."""
    identifier = identifier.strip()
    student = Student.objects.filter(
        semester__is_active=True,
        phone_number=identifier,
    ).select_related('semester').first()
    if not student:
        student = Student.objects.filter(
            semester__is_active=True,
            matric_number__iexact=identifier,
        ).select_related('semester').first()
    return student


def _verify_face_against_student(student, image_file):
    """
    Verify uploaded face against student's stored approved embeddings.
    Returns (matched: bool, confidence: float).
    """
    import cv2
    import numpy as np
    from apps.core.face import get_face_app
    from apps.students.models import FaceSample

    try:
        img_bytes = image_file.read()
        np_arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            return False, 0.0

        face_app = get_face_app()
        faces = face_app.get(img)
        if not faces:
            return False, 0.0

        probe = np.array(faces[0].embedding)
        probe = probe / np.linalg.norm(probe)

        samples = FaceSample.objects.filter(
            student=student,
            semester=student.semester,
            status='approved',
        ).values_list('embedding_vector', flat=True)

        if not samples:
            return False, 0.0

        best_sim = 0.0
        for emb in samples:
            vec = np.array(emb)
            vec = vec / np.linalg.norm(vec)
            sim = float(np.dot(probe, vec))
            if sim > best_sim:
                best_sim = sim

        threshold = getattr(settings, 'INSIGHTFACE_MATCH_THRESHOLD', 0.40)
        return best_sim >= threshold, best_sim

    except Exception as exc:
        logger.warning('Portal face verification error: %s', exc)
        return False, 0.0


def _student_token_response(student):
    """Build the standard token + profile response."""
    return {
        'token': _generate_token(str(student.id)),
        'student': {
            'id': str(student.id),
            'full_name': student.full_name,
            'student_type': student.student_type,
            'service_group': student.service_group,
            'department': student.department,
            'faculty': getattr(student, 'faculty', ''),
            'level': student.level,
            'face_registered': student.face_registered,
            'system_id': student.system_id,
        },
    }


# =============================================================================
# PUBLIC ENDPOINTS (no auth)
# =============================================================================

class PortalLookupView(APIView):
    """
    POST /api/portal/lookup/
    Check identifier and return account status so the frontend
    can show the right screen (setup / login / face-capture required).
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        identifier = request.data.get('identifier', '').strip()
        if not identifier:
            return Response({'error': 'Identifier required.'}, status=status.HTTP_400_BAD_REQUEST)

        student = _find_student(identifier)
        if not student:
            return Response(
                {'error': 'No active student found with that phone number or matric number.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        has_account = StudentAccount.objects.filter(student=student).exists()

        return Response({
            'student_id': str(student.id),
            'full_name': student.full_name,
            'student_type': student.student_type,
            'face_registered': student.face_registered,
            'has_account': has_account,
        })


class PortalSetupPasswordView(APIView):
    """
    POST /api/portal/setup-password/
    Set portal password after face verification.
    Works for both first-time setup and forgotten password reset.
    """
    authentication_classes = []
    permission_classes = []
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        identifier = request.data.get('identifier', '').strip()
        password = request.data.get('password', '')
        confirm = request.data.get('confirm_password', '')
        face_image = request.FILES.get('face_image')

        if not all([identifier, password, confirm, face_image]):
            return Response(
                {'error': 'identifier, password, confirm_password, and face_image are all required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if password != confirm:
            return Response({'error': 'Passwords do not match.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 6:
            return Response({'error': 'Password must be at least 6 characters.'}, status=status.HTTP_400_BAD_REQUEST)

        student = _find_student(identifier)
        if not student:
            return Response({'error': 'No active student found.'}, status=status.HTTP_404_NOT_FOUND)

        if not student.face_registered:
            return Response({
                'error': 'You need to complete face capture before setting up your portal password.',
                'requires_face_capture': True,
                'student_id': str(student.id),
            }, status=status.HTTP_403_FORBIDDEN)

        matched, confidence = _verify_face_against_student(student, face_image)
        if not matched:
            return Response(
                {'error': f'Face verification failed (confidence: {confidence:.2f}). Please use your own face clearly in good lighting.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        account, _ = StudentAccount.objects.get_or_create(student=student)
        account.password = make_password(password)
        account.is_active = True
        account.save(update_fields=['password', 'is_active', 'updated_at'])

        logger.info('Portal account set up for student %s', student.id)
        return Response({'message': 'Password set successfully.', **_student_token_response(student)})


class PortalLoginView(APIView):
    """POST /api/portal/login/"""
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        identifier = request.data.get('identifier', '').strip()
        password = request.data.get('password', '')

        if not identifier or not password:
            return Response(
                {'error': 'Identifier and password are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student = _find_student(identifier)
        if not student:
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            account = student.account
        except StudentAccount.DoesNotExist:
            return Response(
                {'error': 'No portal account found. Please set up your password first.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not account.is_active:
            return Response(
                {'error': 'Your portal account has been deactivated. Contact an admin.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not check_password(password, account.password):
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        account.last_login = timezone.now()
        account.save(update_fields=['last_login'])

        return Response(_student_token_response(student))


# =============================================================================
# AUTHENTICATED PORTAL ENDPOINTS
# =============================================================================

class PortalMeView(APIView):
    """GET /api/portal/me/ — Student profile"""
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    throttle_classes = []

    def get(self, request):
        student = request.user
        photo_url = None
        if student.profile_photo:
            try:
                photo_url = request.build_absolute_uri(student.profile_photo.url)
            except Exception:
                pass

        return Response({
            'id': str(student.id),
            'system_id': student.system_id,
            'full_name': student.full_name,
            'phone_number': student.phone_number,
            'matric_number': student.matric_number,
            'department': student.department,
            'faculty': getattr(student, 'faculty', ''),
            'level': student.level,
            'gender': student.gender,
            'student_type': student.student_type,
            'service_group': student.service_group,
            'face_registered': student.face_registered,
            'profile_photo': photo_url,
            'semester': student.semester.name if student.semester else None,
            'last_login': student.account.last_login,
        })


class PortalAttendanceView(APIView):
    """GET /api/portal/attendance/ — Full attendance history with percentage"""
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    throttle_classes = []

    def get(self, request):
        from apps.attendance.utils import calculate_attendance_percentage
        from apps.attendance.models import AttendanceRecord
        from apps.services.models import Service

        student = request.user
        semester = student.semester
        today = timezone.now().date()

        pct_data = calculate_attendance_percentage(student, semester.id)

        services = Service.objects.filter(
            semester=semester,
            is_cancelled=False,
        ).filter(
            Q(service_group=student.service_group) | Q(service_group='all')
        ).order_by('scheduled_date')

        records = {
            str(r.service_id): r
            for r in AttendanceRecord.objects.filter(
                student=student, service__semester=semester
            )
        }

        services_list = []
        for svc in services:
            record = records.get(str(svc.id))
            if record:
                svc_status = 'valid' if record.is_valid else 'invalid'
            elif svc.scheduled_date > today:
                svc_status = 'upcoming'
            else:
                svc_status = 'missed'

            services_list.append({
                'service_id': str(svc.id),
                'service_name': svc.name or f'{svc.service_type.title()} {svc.service_group}',
                'service_type': svc.service_type,
                'scheduled_date': str(svc.scheduled_date),
                'signed_in_at': record.signed_in_at.isoformat() if record else None,
                'signed_out_at': record.signed_out_at.isoformat() if record and record.signed_out_at else None,
                'is_valid': record.is_valid if record else False,
                'status': svc_status,
            })

        return Response({
            'semester_name': semester.name,
            'percentage': pct_data['percentage'],
            'valid_count': pct_data['valid_count'],
            'total_required': pct_data['total_required'],
            'excused_count': pct_data['excused_count'],
            'below_threshold': pct_data['below_threshold'],
            'services': services_list,
        })


class PortalTodayView(APIView):
    """GET /api/portal/today/ — Today's services for the student"""
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    throttle_classes = []

    def get(self, request):
        from apps.services.models import Service
        from apps.attendance.models import AttendanceRecord

        student = request.user
        today = timezone.now().date()

        services = Service.objects.filter(
            semester=student.semester,
            scheduled_date=today,
            is_cancelled=False,
        ).filter(
            Q(service_group=student.service_group) | Q(service_group='all')
        )

        records = {
            str(r.service_id): r
            for r in AttendanceRecord.objects.filter(student=student, service__in=services)
        }

        result = []
        for svc in services:
            record = records.get(str(svc.id))
            result.append({
                'id': str(svc.id),
                'name': svc.name or f'{svc.service_type.title()} {svc.service_group}',
                'service_type': svc.service_type,
                'window_open_time': svc.window_open_time.isoformat(),
                'window_close_time': svc.window_close_time.isoformat(),
                'is_window_open': svc.is_window_open,
                'notes': svc.notes,
                'signout_required': svc.signout_required,
                'signed_in': record is not None,
                'signed_out': record.signed_out_at is not None if record else False,
                'is_valid': record.is_valid if record else False,
            })

        return Response({'services': result, 'date': str(today)})


class PortalFaceStatusView(APIView):
    """GET /api/portal/face-status/ — Face capture progress"""
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    throttle_classes = []

    def get(self, request):
        from apps.students.models import FaceSample

        student = request.user
        samples = FaceSample.objects.filter(student=student, semester=student.semester)
        approved = samples.filter(status='approved').count()
        rejected = samples.filter(status='rejected').values('rejection_reason')

        return Response({
            'face_registered': student.face_registered,
            'approved_samples': approved,
            'rejected_count': rejected.count(),
            'rejection_reasons': list(set(r['rejection_reason'] for r in rejected if r['rejection_reason'])),
            'required_samples': 3,
            'remaining': max(0, 3 - approved),
        })


class PortalVapidKeyView(APIView):
    """
    GET /api/portal/push/vapid-key/
    Returns the VAPID public key so the browser can subscribe to push.
    Same key pair used for admin push — audience is distinguished by which
    subscription table (StudentPushSubscription vs PushSubscription) holds it.
    """
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    throttle_classes = []

    def get(self, request):
        return Response({'public_key': settings.VAPID_PUBLIC_KEY})


class PortalPushSubscribeView(APIView):
    """
    POST /api/portal/push/subscribe/   — save a push subscription for the student
    DELETE /api/portal/push/subscribe/ — remove it (called on unsubscribe)
    """
    authentication_classes = [StudentPortalAuthentication]
    permission_classes = [IsStudentAuthenticated]
    throttle_classes = []

    def post(self, request):
        from apps.students.models import StudentPushSubscription

        endpoint = request.data.get('endpoint', '').strip()
        p256dh   = request.data.get('p256dh', '').strip()
        auth     = request.data.get('auth', '').strip()

        if not endpoint or not p256dh or not auth:
            return Response(
                {'error': 'endpoint, p256dh, and auth are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        StudentPushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={'student': request.user, 'p256dh': p256dh, 'auth': auth},
        )
        return Response({'message': 'Subscribed.'}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        from apps.students.models import StudentPushSubscription

        endpoint = request.data.get('endpoint', '').strip()
        if endpoint:
            StudentPushSubscription.objects.filter(
                student=request.user, endpoint=endpoint
            ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
