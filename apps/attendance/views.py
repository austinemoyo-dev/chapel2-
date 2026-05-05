"""
Attendance Views — Sign-in, sign-out, offline sync, embeddings, manual edit, and backdating.

This is the core attendance engine implementing:
1. Multi-layer validation (time window, geo-fence, device binding)
2. 1-to-N face matching scoped by service group
3. Per-student lock via unique constraint
4. Offline sync with per-record validation
5. Manual edit and late resumption backdating
"""
import logging
from datetime import timedelta
from django.db import transaction, IntegrityError
from django.utils import timezone
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import AttendanceRecord, BackdateTypeChoices
from .serializers import (
    SignInSerializer,
    SignOutSerializer,
    OfflineSyncSerializer,
    AttendanceRecordSerializer,
    AttendanceEditSerializer,
    BackdateSerializer,
)
from .utils import (
    validate_time_window,
    validate_signout_window,
    validate_geo_fence,
    validate_device_binding,
    match_face_1_to_n,
    calculate_attendance_percentage,
    get_service_embeddings,
)
from apps.accounts.permissions import IsSuperadmin, IsProtocolMember, IsProtocolMemberOrAbove, IsAdminOrAbove, HasAdminPermission
from apps.services.models import Service
from apps.students.models import Student
from apps.audit.utils import log_action

logger = logging.getLogger(__name__)


class SignInView(APIView):
    """
    POST /api/attendance/sign-in/
    
    Mark student sign-in. Protocol Member only.
    
    Validation pipeline:
    1. Service exists and is not cancelled
    2. Time window is open
    3. GPS is within geo-fence
    4. Device is bound to the protocol member
    5. Face matched via 1-to-N against service pool
    6. Per-student lock check (not already marked for this service)
    7. Create attendance record
    8. Log to audit trail
    """
    permission_classes = [IsProtocolMember]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @transaction.atomic
    def post(self, request):
        serializer = SignInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        service_id = data['service_id']
        device_id = data['device_id']
        gps_lat = data['gps_lat']
        gps_lng = data['gps_lng']

        # 1. Get service
        try:
            service = Service.objects.get(id=service_id)
        except Service.DoesNotExist:
            return Response(
                {'error': 'Service not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 2. Validate time window
        time_valid, time_msg = validate_time_window(service)
        if not time_valid:
            return Response(
                {'error': time_msg, 'validation': 'time_window'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 3. Validate geo-fence
        geo_valid, geo_distance, geo_msg = validate_geo_fence(gps_lat, gps_lng)
        if not geo_valid:
            return Response(
                {'error': geo_msg, 'validation': 'geo_fence', 'distance': geo_distance},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 4. Validate device binding
        device_valid, device_msg = validate_device_binding(request.user, device_id)
        if not device_valid:
            return Response(
                {'error': device_msg, 'validation': 'device_binding'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 5. Face matching — determine student
        student = None
        match_confidence = 0.0

        if data.get('student_id'):
            # Pre-matched (offline or direct ID) — validate student exists and is in pool
            try:
                student = Student.objects.get(id=data['student_id'], is_active=True)
            except Student.DoesNotExist:
                return Response(
                    {'error': 'Student not found or inactive.'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # Server-side face matching
            embedding = data.get('face_embedding')

            if not embedding and data.get('face_image'):
                # Extract embedding from uploaded face image
                embedding = self._extract_embedding(data['face_image'])
                if embedding is None:
                    return Response(
                        {'error': 'Failed to process face image. Please retry.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            if embedding:
                match_result = match_face_1_to_n(embedding, service_id)
                if not match_result['matched']:
                    return Response({
                        'error': match_result['message'],
                        'validation': 'face_match',
                        'confidence': match_result['confidence'],
                    }, status=status.HTTP_400_BAD_REQUEST)

                student = Student.objects.get(id=match_result['student_id'])
                match_confidence = match_result['confidence']
            else:
                return Response(
                    {'error': 'No face data provided for matching.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # 6. Per-student lock — check if already marked
        try:
            record = AttendanceRecord.objects.create(
                student=student,
                service=service,
                protocol_member=request.user,
                device_id=device_id,
                gps_lat=gps_lat,
                gps_lng=gps_lng,
                signed_in_at=timezone.now(),
                is_valid=not service.signout_required,  # Valid immediately if no sign-out needed
                is_offline_record=False,
            )
        except IntegrityError:
            return Response({
                'error': 'Already marked for this service.',
                'student_name': student.full_name,
                'validation': 'per_student_lock',
            }, status=status.HTTP_409_CONFLICT)

        # 7. Audit log
        log_action(
            actor=request.user,
            action_type='ATTENDANCE_SIGN_IN',
            target_type='AttendanceRecord',
            target_id=record.id,
            new_value={
                'student_id': str(student.id),
                'student_name': student.full_name,
                'service_id': str(service.id),
                'confidence': match_confidence,
            },
            device_id=device_id,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
        )

        return Response({
            'message': f'Sign-in recorded for {student.full_name}.',
            'record_id': str(record.id),
            'student_id': str(student.id),
            'student_name': student.full_name,
            'signed_in_at': record.signed_in_at.isoformat(),
            'is_valid': record.is_valid,
            'confidence': match_confidence,
        }, status=status.HTTP_201_CREATED)

    def _extract_embedding(self, face_image):
        """Extract ArcFace embedding from an uploaded face image using InsightFace."""
        from apps.core.face import extract_embedding_from_django_file
        return extract_embedding_from_django_file(face_image)


class SignOutView(APIView):
    """
    POST /api/attendance/sign-out/
    
    Mark student sign-out. Protocol Member only.
    Updates the existing sign-in record with sign-out timestamp.
    Same validation pipeline as sign-in, but updates existing record.
    """
    permission_classes = [IsProtocolMember]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @transaction.atomic
    def post(self, request):
        serializer = SignOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        service_id = data['service_id']
        device_id = data['device_id']
        gps_lat = data['gps_lat']
        gps_lng = data['gps_lng']

        # Get service
        try:
            service = Service.objects.get(id=service_id)
        except Service.DoesNotExist:
            return Response(
                {'error': 'Service not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Validate sign-out window (uses dedicated window if set, else main window)
        time_valid, time_msg = validate_signout_window(service)
        if not time_valid:
            return Response({'error': time_msg}, status=status.HTTP_400_BAD_REQUEST)

        geo_valid, _, geo_msg = validate_geo_fence(gps_lat, gps_lng)
        if not geo_valid:
            return Response({'error': geo_msg}, status=status.HTTP_400_BAD_REQUEST)

        device_valid, device_msg = validate_device_binding(request.user, device_id)
        if not device_valid:
            return Response({'error': device_msg}, status=status.HTTP_400_BAD_REQUEST)

        # Determine student — support student_id, pre-computed embedding, or raw image
        student = None
        if data.get('student_id'):
            try:
                student = Student.objects.get(id=data['student_id'], is_active=True)
            except Student.DoesNotExist:
                return Response(
                    {'error': 'Student not found or inactive.'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            embedding = data.get('face_embedding')
            if not embedding and data.get('face_image'):
                embedding = self._extract_embedding(data['face_image'])
                if embedding is None:
                    return Response(
                        {'error': 'Failed to process face image for sign-out. Please retry.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            if embedding:
                match_result = match_face_1_to_n(embedding, service_id)
                if not match_result['matched']:
                    return Response(
                        {'error': match_result['message']},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                student = Student.objects.get(id=match_result['student_id'])
            else:
                return Response(
                    {'error': 'student_id, face_image, or face_embedding required for sign-out.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Find existing sign-in record
        try:
            record = AttendanceRecord.objects.get(
                student=student,
                service=service,
            )
        except AttendanceRecord.DoesNotExist:
            return Response(
                {'error': 'No sign-in record found for this student at this service.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if record.signed_out_at:
            return Response(
                {'error': 'Student has already been signed out.'},
                status=status.HTTP_409_CONFLICT
            )

        # Update sign-out
        record.signed_out_at = timezone.now()
        record.compute_validity()
        record.save(update_fields=['signed_out_at', 'is_valid'])

        log_action(
            actor=request.user,
            action_type='ATTENDANCE_SIGN_OUT',
            target_type='AttendanceRecord',
            target_id=record.id,
            new_value={
                'student_id': str(student.id),
                'signed_out_at': record.signed_out_at.isoformat(),
                'is_valid': record.is_valid,
            },
            device_id=device_id,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
        )

        return Response({
            'message': f'Sign-out recorded for {student.full_name}.',
            'record_id': str(record.id),
            'student_name': student.full_name,
            'signed_out_at': record.signed_out_at.isoformat(),
            'is_valid': record.is_valid,
        })

    def _extract_embedding(self, face_image):
        """Extract ArcFace embedding from an uploaded face image using InsightFace."""
        from apps.core.face import extract_embedding_from_django_file
        return extract_embedding_from_django_file(face_image)


class OfflineSyncView(APIView):
    """
    POST /api/attendance/sync/
    
    Sync a batch of offline attendance records. Protocol Member only.
    
    Each record is validated independently:
    - Timestamp within service time window
    - GPS within geo-fence
    - Device bound to active protocol member
    - Duplicate check (student not already marked for service)
    
    Returns per-record results (accepted/rejected with reason).
    """
    permission_classes = [IsProtocolMember]

    def post(self, request):
        serializer = OfflineSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        records = serializer.validated_data['records']
        results = []

        for idx, record_data in enumerate(records):
            # Each record gets its own savepoint so that a DB error on one
            # record does not roll back the entire batch.
            try:
                with transaction.atomic():
                    result = self._validate_and_create_record(record_data, request.user)
            except Exception as exc:
                logger.error(f'Unexpected error processing offline record {idx}: {exc}')
                result = {
                    'status': 'rejected',
                    'reason': 'Unexpected server error processing this record.',
                }
            results.append({
                'index': idx,
                **result,
            })

        accepted = sum(1 for r in results if r['status'] == 'accepted')
        rejected = sum(1 for r in results if r['status'] == 'rejected')

        return Response({
            'message': f'Sync complete. {accepted} accepted, {rejected} rejected.',
            'total': len(results),
            'accepted': accepted,
            'rejected': rejected,
            'results': results,
        })

    def _validate_and_create_record(self, record_data, protocol_member):
        """
        Validate a single offline record and create if valid.
        Returns dict with status and details.
        """
        service_id = record_data['service_id']
        student_id = record_data['student_id']
        attendance_type = record_data['attendance_type']
        device_id = record_data['device_id']
        gps_lat = record_data['gps_lat']
        gps_lng = record_data['gps_lng']
        timestamp = record_data['timestamp']

        # Get service
        try:
            service = Service.objects.get(id=service_id)
        except Service.DoesNotExist:
            return {'status': 'rejected', 'reason': 'Service not found.'}

        # Validate timestamp within service window
        if timestamp < service.window_open_time or timestamp > service.window_close_time:
            return {
                'status': 'rejected',
                'reason': 'Timestamp outside valid service time window.',
                'validation': 'time_window',
            }

        # Validate geo-fence
        geo_valid, geo_distance, geo_msg = validate_geo_fence(gps_lat, gps_lng)
        if not geo_valid:
            return {
                'status': 'rejected',
                'reason': geo_msg,
                'validation': 'geo_fence',
            }

        # Validate device binding
        device_valid, device_msg = validate_device_binding(protocol_member, device_id)
        if not device_valid:
            return {
                'status': 'rejected',
                'reason': device_msg,
                'validation': 'device_binding',
            }

        # Get student
        try:
            student = Student.objects.get(id=student_id, is_active=True)
        except Student.DoesNotExist:
            return {'status': 'rejected', 'reason': 'Student not found or inactive.'}

        if attendance_type == 'sign_in':
            # Create sign-in record
            try:
                record = AttendanceRecord.objects.create(
                    student=student,
                    service=service,
                    protocol_member=protocol_member,
                    device_id=device_id,
                    gps_lat=gps_lat,
                    gps_lng=gps_lng,
                    signed_in_at=timestamp,
                    is_valid=not service.signout_required,
                    is_offline_record=True,
                    sync_validation_result='accepted',
                )
                log_action(
                    actor=protocol_member,
                    action_type='ATTENDANCE_SIGN_IN_SYNCED',
                    target_type='AttendanceRecord',
                    target_id=record.id,
                    new_value={
                        'student_id': str(student.id),
                        'offline': True,
                        'original_timestamp': timestamp.isoformat(),
                    },
                    device_id=device_id,
                    gps_lat=gps_lat,
                    gps_lng=gps_lng,
                )
                return {
                    'status': 'accepted',
                    'record_id': str(record.id),
                    'student_name': student.full_name,
                }
            except IntegrityError:
                return {
                    'status': 'rejected',
                    'reason': 'Already marked for this service.',
                    'validation': 'per_student_lock',
                }

        elif attendance_type == 'sign_out':
            # Update existing sign-in record
            try:
                record = AttendanceRecord.objects.get(
                    student=student, service=service
                )
                if record.signed_out_at:
                    return {
                        'status': 'rejected',
                        'reason': 'Already signed out.',
                    }
                record.signed_out_at = timestamp
                record.is_offline_record = True
                record.sync_validation_result = 'accepted'
                record.compute_validity()
                record.save()
                return {
                    'status': 'accepted',
                    'record_id': str(record.id),
                    'student_name': student.full_name,
                }
            except AttendanceRecord.DoesNotExist:
                return {
                    'status': 'rejected',
                    'reason': 'No sign-in record found for this student.',
                }

        return {'status': 'rejected', 'reason': f'Unknown attendance type: {attendance_type}'}


class EmbeddingsDownloadView(APIView):
    """
    GET /api/attendance/embeddings/{service_id}/
    
    Download face embeddings for a service's student pool.
    Used by protocol member devices for offline face matching.
    
    Returns list of {student_id, student_name, embeddings} objects.
    Embeddings are the raw Facenet512 vectors (512-dimensional).
    """
    permission_classes = [IsProtocolMember]

    def get(self, request, service_id):
        try:
            service = Service.objects.get(id=service_id)
        except Service.DoesNotExist:
            return Response(
                {'error': 'Service not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        embeddings = get_service_embeddings(service_id)

        return Response({
            'service_id': str(service.id),
            'service_type': service.service_type,
            'service_group': service.service_group,
            'student_count': len(embeddings),
            'embeddings': embeddings,
        })


class ArcFaceModelView(APIView):
    """
    GET /api/attendance/offline-model/

    Streams the buffalo_l ArcFace ONNX weights file so protocol member devices
    can run face matching locally when offline.
    Requires Protocol Member authentication — the model is not biometric data
    but is restricted to authorised field staff only.
    """
    permission_classes = [IsProtocolMember]

    def get(self, request):
        import os
        from django.http import FileResponse

        model_path = os.path.expanduser(
            '~/.insightface/models/buffalo_l/w600k_r50.onnx'
        )
        if not os.path.exists(model_path):
            return Response(
                {
                    'error': (
                        'Offline model not available yet. '
                        'The backend must complete its first start-up to download '
                        'InsightFace weights (~500 MB). Check backend logs.'
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        file_size = os.path.getsize(model_path)
        response = FileResponse(
            open(model_path, 'rb'),
            content_type='application/octet-stream',
        )
        response['Content-Disposition'] = 'attachment; filename="arcface.onnx"'
        response['Content-Length']      = str(file_size)
        response['Cache-Control']       = 'private, max-age=86400'
        return response


class AttendanceServiceListView(generics.ListAPIView):
    """
    GET /api/attendance/service/{service_id}/
    
    Get all attendance records for a specific service.
    Admin or above only.
    """
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsAdminOrAbove]

    def get_queryset(self):
        service_id = self.kwargs['service_id']
        return AttendanceRecord.objects.filter(
            service_id=service_id
        ).select_related('student', 'service', 'protocol_member').order_by('-signed_in_at')


class AttendanceEditView(APIView):
    """
    PATCH /api/attendance/{id}/edit/
    
    Manual attendance edit by Superadmin or Admin with 'can_edit_attendance' permission.
    Requires mandatory reason_note.
    Used for appeals and corrections.
    """
    permission_classes = [HasAdminPermission]
    required_permission = 'can_edit_attendance'

    @transaction.atomic
    def patch(self, request, id):
        try:
            record = AttendanceRecord.objects.select_related('student', 'service').get(id=id)
        except AttendanceRecord.DoesNotExist:
            return Response(
                {'error': 'Attendance record not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = AttendanceEditSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Capture previous values for audit
        previous_value = {
            'is_valid': record.is_valid,
            'signed_in_at': record.signed_in_at.isoformat() if record.signed_in_at else None,
            'signed_out_at': record.signed_out_at.isoformat() if record.signed_out_at else None,
        }

        # Apply changes
        if 'is_valid' in data:
            record.is_valid = data['is_valid']
        if 'signed_in_at' in data:
            record.signed_in_at = data['signed_in_at']
        if 'signed_out_at' in data:
            record.signed_out_at = data['signed_out_at']

        record.save()

        new_value = {
            'is_valid': record.is_valid,
            'signed_in_at': record.signed_in_at.isoformat() if record.signed_in_at else None,
            'signed_out_at': record.signed_out_at.isoformat() if record.signed_out_at else None,
        }

        log_action(
            actor=request.user,
            action_type='ATTENDANCE_EDIT',
            target_type='AttendanceRecord',
            target_id=record.id,
            previous_value=previous_value,
            new_value=new_value,
            reason_note=data['reason_note'],
        )

        return Response({
            'message': 'Attendance record updated.',
            'record': AttendanceRecordSerializer(record).data,
        })


class BackdateView(APIView):
    """
    POST /api/attendance/backdate/
    
    Late resumption backdating by Superadmin.
    Creates backdated attendance records for specified services.
    
    backdate_type:
    - 'valid': missed services count as attended (% increases)
    - 'excused': missed services excluded from total required (% recalculated)
    
    Mandatory reason_note required.
    """
    permission_classes = [IsSuperadmin]

    @transaction.atomic
    def post(self, request):
        serializer = BackdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        student_id = data['student_id']
        service_ids = data['service_ids']
        backdate_type = data['backdate_type']
        reason_note = data['reason_note']

        try:
            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return Response(
                {'error': 'Student not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        created_records = []
        skipped_services = []

        for service_id in service_ids:
            try:
                service = Service.objects.get(id=service_id)
            except Service.DoesNotExist:
                skipped_services.append({
                    'service_id': str(service_id),
                    'reason': 'Service not found.'
                })
                continue

            # Check if record already exists
            if AttendanceRecord.objects.filter(
                student=student, service=service
            ).exists():
                skipped_services.append({
                    'service_id': str(service_id),
                    'reason': 'Attendance record already exists.'
                })
                continue

            record = AttendanceRecord.objects.create(
                student=student,
                service=service,
                protocol_member=request.user,
                device_id='BACKDATED',
                gps_lat=0,
                gps_lng=0,
                signed_in_at=service.window_open_time,
                signed_out_at=service.window_close_time if service.signout_required else None,
                is_valid=True,
                is_backdated=True,
                backdate_type=backdate_type,
            )
            created_records.append(str(record.id))

        # Audit log
        log_action(
            actor=request.user,
            action_type='ATTENDANCE_BACKDATED',
            target_type='Student',
            target_id=student.id,
            new_value={
                'student_name': student.full_name,
                'backdate_type': backdate_type,
                'service_count': len(created_records),
                'service_ids': [str(s) for s in service_ids],
            },
            reason_note=reason_note,
        )

        # Calculate updated percentage
        percentage_data = calculate_attendance_percentage(student, student.semester_id)

        return Response({
            'message': f'Backdated {len(created_records)} service(s) for {student.full_name}.',
            'created_records': created_records,
            'skipped_services': skipped_services,
            'backdate_type': backdate_type,
            'updated_percentage': percentage_data,
        })


class StudentAttendanceListView(generics.ListAPIView):
    """
    GET /api/attendance/student/<student_id>/

    Get all attendance records for a specific student across all services.
    Admin or above only. Used by the Corrections UI.
    """
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsAdminOrAbove]

    def get_queryset(self):
        student_id = self.kwargs['student_id']
        return AttendanceRecord.objects.filter(
            student_id=student_id
        ).select_related('student', 'service', 'protocol_member').order_by('-signed_in_at')


class ActiveScannersView(APIView):
    """
    GET /api/attendance/active-scanners/<service_id>/

    Returns all protocol members who have scanned in the last 5 minutes
    for a specific service. Used by the Multi-Device Sync Dashboard.
    """
    permission_classes = [IsAdminOrAbove]

    def get(self, request, service_id):
        from collections import defaultdict

        try:
            service = Service.objects.get(id=service_id)
        except Service.DoesNotExist:
            return Response(
                {'error': 'Service not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        five_min_ago = timezone.now() - timedelta(minutes=5)

        recent_records = (
            AttendanceRecord.objects
            .filter(service=service, signed_in_at__gte=five_min_ago)
            .select_related('protocol_member')
            .order_by('-signed_in_at')
        )

        # Group by protocol member
        member_data = defaultdict(lambda: {
            'scan_count': 0,
            'last_scan_at': None,
            'gps_lat': None,
            'gps_lng': None,
            'device_id': '',
        })

        for record in recent_records:
            member_name = record.protocol_member.full_name if record.protocol_member else 'Unknown'
            data = member_data[member_name]
            data['scan_count'] += 1
            if data['last_scan_at'] is None:
                data['last_scan_at'] = record.signed_in_at.isoformat()
                data['gps_lat'] = float(record.gps_lat)
                data['gps_lng'] = float(record.gps_lng)
                data['device_id'] = record.device_id

        scanners = [
            {
                'protocol_member_name': name,
                'device_id': info['device_id'],
                'scan_count': info['scan_count'],
                'last_scan_at': info['last_scan_at'],
                'gps_lat': info['gps_lat'],
                'gps_lng': info['gps_lng'],
            }
            for name, info in member_data.items()
        ]
        scanners.sort(key=lambda x: x['scan_count'], reverse=True)

        return Response({
            'service_id': str(service_id),
            'active_scanners': scanners,
            'total_active': len(scanners),
        })

