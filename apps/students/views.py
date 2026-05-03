"""
Students Views — Registration, face sample upload, duplicate management, and matric update.
"""
import logging
import os
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser

from .models import Student, FaceSample, StudentTypeChoices
from .serializers import (
    StudentRegistrationSerializer,
    StudentListSerializer,
    StudentDetailSerializer,
    FaceSampleUploadSerializer,
    FaceStatusSerializer,
    MatricUpdateSerializer,
    DuplicateResolutionSerializer,
)
from .utils import (
    run_all_duplicate_checks,
    assign_service_group,
    generate_system_id,
)
from apps.accounts.permissions import IsSuperadmin, IsAdminOrAbove, HasAdminPermission
from apps.services.models import Semester
from apps.audit.utils import log_action
from rest_framework.throttling import AnonRateThrottle


class FaceUploadThrottle(AnonRateThrottle):
    """5 requests/minute per IP for face processing endpoints (CPU-heavy)."""
    scope = 'face_upload'

logger = logging.getLogger(__name__)


# =============================================================================
# REGISTRATION STATUS
# =============================================================================

class RegistrationStatusView(APIView):
    """
    GET /api/registration/status/
    
    Check if registration is currently open. Public endpoint.
    Returns the active semester info and registration status.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        semester = Semester.objects.filter(is_active=True).first()
        if not semester:
            return Response({
                'registration_open': False,
                'message': 'No active semester configured.',
            })

        return Response({
            'registration_open': semester.registration_open,
            'semester_id': str(semester.id),
            'semester_name': semester.name,
            'message': 'Registration is open.' if semester.registration_open
                       else 'Registration is currently closed.',
        })


# =============================================================================
# STUDENT REGISTRATION
# =============================================================================

class StudentRegistrationView(APIView):
    """
    POST /api/registration/student/
    
    Register a new student. Accessible by:
    - Students (when registration window is open)
    - Admin/Superadmin (anytime, if permitted)
    
    Process:
    1. Validate form fields
    2. Auto-capitalize name, generate system_id for new students
    3. Run 3 parallel duplicate checks (matric, phone, fuzzy name)
    4. If duplicate detected → flag registration, set is_active=False
    5. Auto-assign service group (random, respecting capacity)
    6. Create student record
    """
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    @transaction.atomic
    def post(self, request):
        # Determine semester
        semester = Semester.objects.filter(is_active=True).first()
        if not semester:
            return Response(
                {'error': 'No active semester. Contact administrator.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Build data with semester
        data = request.data.copy()
        data['semester'] = str(semester.id)

        serializer = StudentRegistrationSerializer(
            data=data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)

        # Generate system_id for new students
        system_id = generate_system_id()
        full_name = serializer.validated_data['full_name']
        phone_number = serializer.validated_data['phone_number']
        matric_number = serializer.validated_data.get('matric_number')

        # Run duplicate detection
        dup_results = run_all_duplicate_checks(
            full_name=full_name,
            phone_number=phone_number,
            semester_id=semester.id,
            matric_number=matric_number,
        )

        # Block duplicates immediately instead of flagging
        if dup_results['checks']['matric']:
            return Response(
                {'error': 'A student with this Matriculation Number is already registered for this semester.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if dup_results['checks']['phone']:
            return Response(
                {'error': 'A student with this Phone Number is already registered.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if dup_results['checks']['name']:
            return Response(
                {'error': 'A student with the exact same name is already registered. If this is you, please contact the administrator.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        duplicate_flag = False

        # Assign service group
        try:
            service_group = assign_service_group(semester.id)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Set created_by if admin is registering
        created_by = None
        if request.user and request.user.is_authenticated:
            created_by = request.user

        # Create the student
        student = Student(
            student_type=serializer.validated_data['student_type'],
            matric_number=matric_number,
            system_id=system_id,
            full_name=full_name,
            full_name_normalized=full_name.lower().strip(),
            phone_number=phone_number,
            department=serializer.validated_data['department'],
            level=serializer.validated_data['level'],
            gender=serializer.validated_data['gender'],
            profile_photo=serializer.validated_data.get('profile_photo'),
            service_group=service_group,
            semester=semester,
            is_active=False,  # Activated after face registration + no flags
            duplicate_flag=duplicate_flag,
            duplicate_details=dup_results if duplicate_flag else {},
            created_by=created_by,
        )
        student.save()

        # Audit log
        log_action(
            actor=created_by,
            action_type='STUDENT_REGISTERED',
            target_type='Student',
            target_id=student.id,
            new_value={
                'full_name': student.full_name,
                'student_type': student.student_type,
                'system_id': student.system_id,
                'service_group': student.service_group,
                'duplicate_flag': student.duplicate_flag,
            },
        )

        response_data = StudentRegistrationSerializer(student).data
        if duplicate_flag:
            response_data['duplicate_warning'] = (
                'Your registration has been flagged for review. '
                'A duplicate match was detected. An administrator will review your registration.'
            )
            response_data['duplicate_details'] = dup_results

        return Response(response_data, status=status.HTTP_201_CREATED)


# =============================================================================
# FACE SAMPLE UPLOAD
# =============================================================================

class FaceSampleUploadView(APIView):
    """
    POST /api/registration/face-sample/

    Upload a single face sample for a student.

    Process:
    1. Validate file type and size
    2. Check registration window (unless caller is an authenticated admin)
    3. Receive image file
    4. Run DeepFace analysis for quality validation
    5. Extract Facenet512 embedding vector
    6. Auto-reject with specific reasons if quality fails
    7. Reject immediately if face matches another student (400 Bad Request)
    8. Store approved sample with embedding
    9. Update face_registered when 3+ samples approved
    10. Activate student if face_registered=True and duplicate_flag=False
    """
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [FaceUploadThrottle]

    @transaction.atomic
    def post(self, request):
        student_id = request.data.get('student_id')
        sample_file = request.FILES.get('sample_file')

        if not student_id or not sample_file:
            return Response(
                {'error': 'student_id and sample_file are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # --- File type and size validation (before any disk write) ---
        allowed_types = settings.FACE_UPLOAD_ALLOWED_TYPES
        max_size = settings.FACE_UPLOAD_MAX_SIZE_BYTES

        if sample_file.content_type not in allowed_types:
            return Response(
                {'error': 'Invalid file type. Please upload a JPEG, PNG, or WebP image.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if sample_file.size > max_size:
            return Response(
                {'error': 'File too large. Maximum allowed size is 5 MB.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return Response(
                {'error': 'Student not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # --- Registration window check ---
        # Admins and Superadmins can upload face samples at any time.
        # Unauthenticated users (self-registering students) are blocked
        # when the registration window is closed.
        caller_is_admin = (
            request.user
            and request.user.is_authenticated
            and request.user.role in ('superadmin', 'admin')
        )
        if not caller_is_admin:
            semester = student.semester
            if not semester.registration_open:
                return Response(
                    {'error': 'Registration is currently closed. Face upload is not permitted.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        # Check max samples (5)
        existing_count = student.face_samples.count()
        if existing_count >= 5:
            return Response(
                {'error': 'Maximum 5 face samples allowed. You have reached the limit.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Process the face sample with DeepFace
        result = self._process_face_sample(sample_file, student)

        # STRICT FACE UNIQUENESS CHECK
        duplicate_match = None
        if result['status'] == 'approved' and result.get('embedding'):
            duplicate_match = self._check_face_duplicate(
                result['embedding'], student, student.semester
            )
            if duplicate_match:
                result['status'] = 'rejected'
                result['rejection_reason'] = 'Face is already registered to another student.'

        # Create the face sample record
        face_sample = FaceSample(
            student=student,
            sample_file=sample_file,
            embedding_vector=result['embedding'],
            status=result['status'],
            rejection_reason=result.get('rejection_reason'),
            semester=student.semester,
        )
        face_sample.save()

        # Reject immediately if it's a duplicate of another student
        if face_sample.status == 'rejected' and duplicate_match:
            return Response(
                {'error': face_sample.rejection_reason},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if student now has 3+ approved samples
        approved_count = student.face_samples.filter(status='approved').count()
        if approved_count >= 3 and not student.face_registered:
            student.face_registered = True
            student.save(update_fields=['face_registered'])
            # Activate only if no duplicate flags (from initial registration)
            student.update_activation_status()

        message = result.get('rejection_reason') or f'Face sample approved. ({approved_count}/3 minimum required)'

        return Response({
            'id': str(face_sample.id),
            'status': face_sample.status,
            'rejection_reason': face_sample.rejection_reason,
            'approved_count': approved_count,
            'total_count': existing_count + 1,
            'face_registered': student.face_registered,
            'duplicate_flagged': student.duplicate_flag,
            'message': message,
        }, status=status.HTTP_201_CREATED)

    def _check_face_duplicate(self, embedding_vector, current_student, semester):
        """
        Compare a new embedding against every other approved sample in the
        semester using InsightFace/ArcFace cosine similarity.
        Returns match-info dict if a duplicate is found, else None.
        """
        from apps.core.face import check_face_duplicate
        return check_face_duplicate(embedding_vector, current_student, semester)

    def _process_face_sample(self, sample_file, student):
        """
        Process a face sample using InsightFace (ArcFace + RetinaFace).

        1. Write upload to a temp file
        2. Run RetinaFace detection + quality checks
        3. Extract ArcFace 512-dim embedding
        4. Clean up temp file

        Returns:
            dict: {status, embedding, rejection_reason}
        """
        import tempfile
        from apps.core.face import process_face_sample

        temp_path = None
        try:
            suffix = os.path.splitext(sample_file.name)[-1] or '.jpg'
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=suffix, dir=settings.MEDIA_ROOT
            ) as tmp:
                for chunk in sample_file.chunks():
                    tmp.write(chunk)
                temp_path = tmp.name

            return process_face_sample(temp_path)

        except Exception as e:
            logger.error(f'Face sample processing error: {e}')
            return {
                'status': 'rejected',
                'embedding': [],
                'rejection_reason': 'An error occurred during face processing. Please try again.',
            }
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)


# =============================================================================
# FACE STATUS
# =============================================================================

class FaceStatusView(APIView):
    """
    GET /api/registration/face-status/?student_id=<uuid>
    
    Check the current face registration status for a student.
    Returns approved/rejected sample counts and activation status.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        student_id = request.query_params.get('student_id')
        if not student_id:
            return Response(
                {'error': 'student_id query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return Response(
                {'error': 'Student not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        approved = student.face_samples.filter(status='approved').count()
        rejected = student.face_samples.filter(status='rejected').count()
        total = approved + rejected

        if student.face_registered:
            message = 'Face registration complete. Your account is being processed.'
        elif approved >= 3:
            message = f'You have {approved} approved samples. Face registration complete.'
        else:
            remaining = 3 - approved
            message = f'{approved} approved so far. {remaining} more sample(s) needed.'

        return Response({
            'student_id': str(student.id),
            'total_samples': total,
            'approved_samples': approved,
            'rejected_samples': rejected,
            'face_registered': student.face_registered,
            'is_active': student.is_active,
            'message': message,
        })


# =============================================================================
# ADMIN: REGISTRATION WINDOW CONTROL
# =============================================================================

class RegistrationWindowView(APIView):
    """
    PATCH /api/admin/registration/open/
    
    Open or close the registration window for the active semester.
    Superadmin only.
    
    Request: {"registration_open": true/false}
    """
    permission_classes = [IsSuperadmin]

    @transaction.atomic
    def patch(self, request):
        registration_open = request.data.get('registration_open')
        if registration_open is None:
            return Response(
                {'error': 'registration_open field is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        semester = Semester.objects.filter(is_active=True).first()
        if not semester:
            return Response(
                {'error': 'No active semester.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        old_value = semester.registration_open
        semester.registration_open = bool(registration_open)
        semester.save(update_fields=['registration_open'])

        action = 'REGISTRATION_OPENED' if registration_open else 'REGISTRATION_CLOSED'
        log_action(
            actor=request.user,
            action_type=action,
            target_type='Semester',
            target_id=semester.id,
            previous_value={'registration_open': old_value},
            new_value={'registration_open': semester.registration_open},
        )

        return Response({
            'message': f'Registration {"opened" if registration_open else "closed"} successfully.',
            'semester': semester.name,
            'registration_open': semester.registration_open,
        })


# =============================================================================
# ADMIN: STUDENT MANAGEMENT
# =============================================================================

class AdminStudentListView(generics.ListAPIView):
    """
    GET /api/admin/students/
    
    List all students. Filterable by semester, service_group, active status, duplicate flag.
    Admin or Superadmin only.
    """
    serializer_class = StudentListSerializer
    permission_classes = [IsAdminOrAbove]

    def get_queryset(self):
        qs = Student.objects.select_related('semester').all()

        # Filters
        semester_id = self.request.query_params.get('semester_id')
        if semester_id:
            qs = qs.filter(semester_id=semester_id)
        else:
            # Default to active semester
            qs = qs.filter(semester__is_active=True)

        service_group = self.request.query_params.get('service_group')
        if service_group:
            qs = qs.filter(service_group=service_group)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')

        duplicate_flag = self.request.query_params.get('duplicate_flag')
        if duplicate_flag is not None:
            qs = qs.filter(duplicate_flag=duplicate_flag.lower() == 'true')

        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(full_name__icontains=search) |
                Q(matric_number__icontains=search) |
                Q(system_id__icontains=search) |
                Q(phone_number__icontains=search)
            )

        return qs


class AdminStudentDetailView(generics.RetrieveUpdateAPIView):
    """
    GET /api/admin/students/{id}/ — View student profile
    PATCH /api/admin/students/{id}/ — Edit student profile
    """
    serializer_class = StudentDetailSerializer
    permission_classes = [IsAdminOrAbove]
    queryset = Student.objects.all()
    lookup_field = 'id'


class AdminStudentDeleteView(APIView):
    """
    DELETE /api/admin/students/{id}/
    
    Hard delete a student. Superadmin only.
    Removes: student profile, face samples, attendance records.
    Action is logged BEFORE deletion (audit trail preserved).
    """
    permission_classes = [IsSuperadmin]

    @transaction.atomic
    def delete(self, request, id):
        try:
            student = Student.objects.get(id=id)
        except Student.DoesNotExist:
            return Response(
                {'error': 'Student not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Log BEFORE deletion
        log_action(
            actor=request.user,
            action_type='STUDENT_DELETED',
            target_type='Student',
            target_id=student.id,
            previous_value={
                'full_name': student.full_name,
                'matric_number': student.matric_number,
                'system_id': student.system_id,
                'phone_number': student.phone_number,
                'service_group': student.service_group,
            },
            reason_note=request.data.get('reason', 'Hard delete by Superadmin'),
        )

        student_name = student.full_name
        # Cascade delete handles face_samples and attendance_records
        student.delete()

        logger.info(f'Student hard-deleted: {student_name} by {request.user.email}')

        return Response(
            {'message': f'Student "{student_name}" has been permanently deleted.'},
            status=status.HTTP_200_OK
        )


# =============================================================================
# DUPLICATE RESOLUTION
# =============================================================================

class DuplicateResolutionView(APIView):
    """
    POST /api/admin/duplicates/resolve/
    
    Resolve a duplicate flag. Superadmin only.
    Actions: 'approve' (clear flag), 'reject' (delete student).
    """
    permission_classes = [IsSuperadmin]

    @transaction.atomic
    def post(self, request):
        serializer = DuplicateResolutionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        student_id = serializer.validated_data['student_id']
        action = serializer.validated_data['action']
        reason_note = serializer.validated_data.get('reason_note', '')

        try:
            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return Response(
                {'error': 'Student not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if action == 'approve':
            student.duplicate_flag = False
            student.duplicate_details = {}
            student.save(update_fields=['duplicate_flag', 'duplicate_details'])
            student.update_activation_status()

            log_action(
                actor=request.user,
                action_type='DUPLICATE_FLAG_RESOLVED',
                target_type='Student',
                target_id=student.id,
                new_value={'duplicate_flag': False, 'action': 'approved'},
                reason_note=reason_note,
            )

            return Response({
                'message': f'Duplicate flag cleared for {student.full_name}.',
                'is_active': student.is_active,
            })

        elif action == 'reject':
            log_action(
                actor=request.user,
                action_type='DUPLICATE_FLAG_REJECTED',
                target_type='Student',
                target_id=student.id,
                previous_value={'full_name': student.full_name},
                reason_note=reason_note,
            )
            student.delete()
            return Response(
                {'message': 'Flagged student registration rejected and removed.'}
            )

        return Response(
            {'error': f'Unknown action: {action}'},
            status=status.HTTP_400_BAD_REQUEST
        )


# =============================================================================
# MATRIC NUMBER UPDATE
# =============================================================================

class MatricUpdateLinkView(APIView):
    """
    POST /api/admin/matric-update-link/{id}/
    
    Generate a secure, time-limited token for a new student to update
    their matric number. Superadmin only.
    
    Returns a signed token that expires after MATRIC_UPDATE_TOKEN_EXPIRY_HOURS.
    """
    permission_classes = [IsSuperadmin]

    def post(self, request, id):
        try:
            student = Student.objects.get(id=id)
        except Student.DoesNotExist:
            return Response(
                {'error': 'Student not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if student.student_type != StudentTypeChoices.NEW:
            return Response(
                {'error': 'Matric update link is only for new students.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if student.matric_number:
            return Response(
                {'error': 'Student already has a matric number.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Generate signed token
        expiry_seconds = settings.MATRIC_UPDATE_TOKEN_EXPIRY_HOURS * 3600
        token = signing.dumps(
            {'student_id': str(student.id), 'system_id': student.system_id},
            salt='matric-update'
        )

        log_action(
            actor=request.user,
            action_type='MATRIC_UPDATE_LINK_GENERATED',
            target_type='Student',
            target_id=student.id,
            new_value={'system_id': student.system_id},
        )

        return Response({
            'token': token,
            'student_name': student.full_name,
            'system_id': student.system_id,
            'expires_in_hours': settings.MATRIC_UPDATE_TOKEN_EXPIRY_HOURS,
            'message': 'Share this token with the student to update their matric number.',
        })


class MatricUpdateView(APIView):
    """
    PATCH /api/registration/update-matric/
    
    Student updates their matric number using a secure token.
    Requires: token, system_id, matric_number.
    Dual verification: token must match AND system_id must match.
    """
    permission_classes = [AllowAny]

    @transaction.atomic
    def patch(self, request):
        serializer = MatricUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data['token']
        system_id = serializer.validated_data['system_id']
        new_matric = serializer.validated_data['matric_number']

        # Verify token
        expiry_seconds = settings.MATRIC_UPDATE_TOKEN_EXPIRY_HOURS * 3600
        try:
            data = signing.loads(token, salt='matric-update', max_age=expiry_seconds)
        except signing.SignatureExpired:
            return Response(
                {'error': 'This update link has expired. Contact administration for a new link.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except signing.BadSignature:
            return Response(
                {'error': 'Invalid update link.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Dual verification
        if data.get('system_id') != system_id:
            return Response(
                {'error': 'System ID does not match. Verification failed.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            student = Student.objects.get(id=data['student_id'], system_id=system_id)
        except Student.DoesNotExist:
            return Response(
                {'error': 'Student not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check for matric conflict
        conflict = Student.objects.filter(
            matric_number__iexact=new_matric,
            semester=student.semester,
        ).exclude(id=student.id).exists()

        if conflict:
            return Response(
                {'error': f'Matric number {new_matric} is already registered to another student.'},
                status=status.HTTP_409_CONFLICT
            )

        # Update matric number
        old_id = student.system_id
        student.matric_number = new_matric
        student.save(update_fields=['matric_number'])

        log_action(
            actor=None,  # System action triggered by student
            action_type='MATRIC_NUMBER_UPDATED',
            target_type='Student',
            target_id=student.id,
            previous_value={'system_id': old_id, 'matric_number': None},
            new_value={'system_id': old_id, 'matric_number': new_matric},
        )

        return Response({
            'message': 'Matric number updated successfully.',
            'matric_number': new_matric,
            'system_id': student.system_id,
        })
