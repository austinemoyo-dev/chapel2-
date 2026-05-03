"""
Services Views — Service CRUD, semester management, and geo-fence configuration.
"""
import logging
from django.db import transaction
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import Semester, Service, GeoFenceConfig
from .serializers import (
    SemesterSerializer,
    ServiceSerializer,
    ServiceListSerializer,
    GeoFenceSerializer,
)
from apps.accounts.permissions import IsSuperadmin, IsAdminOrAbove, IsProtocolMemberOrAbove
from apps.audit.utils import log_action

logger = logging.getLogger(__name__)


# =============================================================================
# SEMESTER MANAGEMENT
# =============================================================================

class SemesterListCreateView(generics.ListCreateAPIView):
    """
    GET /api/services/semesters/ — List all semesters
    POST /api/services/semesters/ — Create a new semester (Superadmin only)
    """
    serializer_class = SemesterSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSuperadmin()]
        return [IsAdminOrAbove()]

    def get_queryset(self):
        return Semester.objects.all().order_by('-start_date')

    @transaction.atomic
    def perform_create(self, serializer):
        semester = serializer.save()
        log_action(
            actor=self.request.user,
            action_type='SEMESTER_CREATED',
            target_type='Semester',
            target_id=semester.id,
            new_value={'name': semester.name},
        )


class SemesterDetailView(generics.RetrieveUpdateAPIView):
    """
    GET /api/services/semesters/{id}/ — View semester details
    PATCH /api/services/semesters/{id}/ — Update semester (Superadmin only)
    """
    serializer_class = SemesterSerializer
    permission_classes = [IsSuperadmin]
    queryset = Semester.objects.all()
    lookup_field = 'id'


class ArchiveSemesterView(APIView):
    """
    POST /api/services/semesters/{id}/archive/

    Archives a semester:
      1. Marks the semester as is_archived=True, is_active=False,
         registration_open=False
      2. Deletes all face sample image files from disk
      3. Deletes FaceSample DB records for this semester
      4. Resets every student in this semester:
         face_registered=False, is_active=False
      5. Logs the action in the audit trail

    Once archived, the semester is locked — attendance records are retained
    and audit logs are kept indefinitely.
    Superadmin only.
    """
    permission_classes = [IsSuperadmin]

    @transaction.atomic
    def post(self, request, id):
        import os
        import shutil
        from django.conf import settings as django_settings
        from apps.students.models import Student, FaceSample

        try:
            semester = Semester.objects.get(id=id)
        except Semester.DoesNotExist:
            return Response(
                {'error': 'Semester not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if semester.is_archived:
            return Response(
                {'error': 'Semester is already archived.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Lock the semester
        semester.is_archived       = True
        semester.is_active         = False
        semester.registration_open = False
        semester.save(update_fields=['is_archived', 'is_active', 'registration_open'])

        # 2. Delete face sample files from disk for this semester
        face_dir = os.path.join(
            django_settings.MEDIA_ROOT, 'face_samples', str(semester.id)
        )
        if os.path.exists(face_dir):
            shutil.rmtree(face_dir)
            logger.info('Deleted face sample directory: %s', face_dir)

        # 3. Delete FaceSample records from DB
        deleted_samples, _ = FaceSample.objects.filter(semester=semester).delete()
        logger.info('Deleted %d face sample records for semester %s', deleted_samples, semester.id)

        # 4. Reset all students in this semester
        updated_students = Student.objects.filter(semester=semester).update(
            face_registered=False,
            is_active=False,
        )
        logger.info('Reset %d students for semester %s', updated_students, semester.id)

        # 5. Audit log
        log_action(
            actor=request.user,
            action_type='SEMESTER_ARCHIVED',
            target_type='Semester',
            target_id=semester.id,
            new_value={
                'semester_name':     semester.name,
                'trigger':           'manual',
                'deleted_samples':   deleted_samples,
                'students_reset':    updated_students,
            },
        )

        return Response({
            'message':         f'Semester "{semester.name}" has been archived.',
            'deleted_samples': deleted_samples,
            'students_reset':  updated_students,
        })


# =============================================================================
# SERVICE MANAGEMENT
# =============================================================================

class ServiceListCreateView(generics.ListCreateAPIView):
    """
    GET /api/services/ — List services for the current semester
    POST /api/services/ — Create a new service (Superadmin only)
    
    Filters: semester_id, service_type, service_group, is_cancelled
    """
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSuperadmin()]
        return [IsProtocolMemberOrAbove()]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ServiceSerializer
        return ServiceListSerializer

    def get_queryset(self):
        qs = Service.objects.select_related('semester').all()

        semester_id = self.request.query_params.get('semester_id')
        if semester_id:
            qs = qs.filter(semester_id=semester_id)
        else:
            qs = qs.filter(semester__is_active=True)

        service_type = self.request.query_params.get('service_type')
        if service_type:
            qs = qs.filter(service_type=service_type)

        service_group = self.request.query_params.get('service_group')
        if service_group:
            qs = qs.filter(service_group=service_group)

        is_cancelled = self.request.query_params.get('is_cancelled')
        if is_cancelled is not None:
            qs = qs.filter(is_cancelled=is_cancelled.lower() == 'true')

        return qs

    @transaction.atomic
    def perform_create(self, serializer):
        service = serializer.save()
        log_action(
            actor=self.request.user,
            action_type='SERVICE_CREATED',
            target_type='Service',
            target_id=service.id,
            new_value={
                'service_type': service.service_type,
                'service_group': service.service_group,
                'scheduled_date': str(service.scheduled_date),
            },
        )
        logger.info(f'Service created: {service}')


class ServiceDetailView(generics.RetrieveUpdateAPIView):
    """
    GET /api/services/{id}/ — View service details
    PATCH /api/services/{id}/ — Update service (Superadmin only)
    """
    serializer_class = ServiceSerializer
    permission_classes = [IsSuperadmin]
    queryset = Service.objects.all()
    lookup_field = 'id'

    @transaction.atomic
    def perform_update(self, serializer):
        old_data = ServiceSerializer(self.get_object()).data
        service = serializer.save()
        log_action(
            actor=self.request.user,
            action_type='SERVICE_EDITED',
            target_type='Service',
            target_id=service.id,
            previous_value=old_data,
            new_value=ServiceSerializer(service).data,
        )


class ServiceCancelView(APIView):
    """
    DELETE /api/services/{id}/cancel/
    
    Cancel a service (soft delete — sets is_cancelled=True).
    Cancelled services are excluded from attendance percentage calculations.
    Superadmin only.
    """
    permission_classes = [IsSuperadmin]

    @transaction.atomic
    def delete(self, request, id):
        try:
            service = Service.objects.get(id=id)
        except Service.DoesNotExist:
            return Response(
                {'error': 'Service not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if service.is_cancelled:
            return Response(
                {'error': 'Service is already cancelled.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        service.is_cancelled = True
        service.save(update_fields=['is_cancelled'])

        log_action(
            actor=request.user,
            action_type='SERVICE_CANCELLED',
            target_type='Service',
            target_id=service.id,
            previous_value={'is_cancelled': False},
            new_value={'is_cancelled': True},
            reason_note=request.data.get('reason', ''),
        )

        return Response({
            'message': f'Service {service} has been cancelled.',
            'service_id': str(service.id),
        })


# =============================================================================
# GEO-FENCE CONFIGURATION
# =============================================================================

class GeoFenceView(APIView):
    """
    GET    /api/geo-fence/ — View current geo-fence config
    PATCH  /api/geo-fence/ — Update geo-fence config (Superadmin only)
    DELETE /api/geo-fence/ — Reset to unconfigured 0,0 (blocks attendance until reconfigured)
    """
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAdminOrAbove()]
        return [IsSuperadmin()]

    def get(self, request):
        config = GeoFenceConfig.get_config()
        serializer = GeoFenceSerializer(config)
        return Response(serializer.data)

    @transaction.atomic
    def patch(self, request):
        config = GeoFenceConfig.get_config()
        old_data = GeoFenceSerializer(config).data

        serializer = GeoFenceSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        config = serializer.save(updated_by=request.user)

        log_action(
            actor=request.user,
            action_type='GEOFENCE_UPDATED',
            target_type='GeoFenceConfig',
            target_id=config.id,
            previous_value=old_data,
            new_value=GeoFenceSerializer(config).data,
        )

        return Response({
            'message': 'Geo-fence configuration updated.',
            'config': GeoFenceSerializer(config).data,
        })

    @transaction.atomic
    def delete(self, request):
        """
        Reset geo-fence to unconfigured (latitude=0, longitude=0).
        Attendance marking will be blocked until a new location is set.
        """
        config = GeoFenceConfig.get_config()
        old_data = GeoFenceSerializer(config).data

        config.latitude      = 0.0
        config.longitude     = 0.0
        config.radius_meters = 200
        config.updated_by    = request.user
        config.save()

        log_action(
            actor=request.user,
            action_type='GEOFENCE_RESET',
            target_type='GeoFenceConfig',
            target_id=config.id,
            previous_value=old_data,
            new_value={'latitude': 0, 'longitude': 0, 'radius_meters': 200},
            reason_note='Geo-fence reset by Superadmin — attendance marking is blocked until reconfigured.',
        )

        return Response({
            'message': 'Geo-fence reset. Attendance marking is now blocked until you set a new chapel location.',
        })
