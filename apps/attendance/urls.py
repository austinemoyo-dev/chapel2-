"""
Attendance URL Configuration — Attendance marking, sync, management, and monitoring endpoints.
"""
from django.urls import path
from .views import (
    SignInView,
    SignOutView,
    OfflineSyncView,
    EmbeddingsDownloadView,
    ArcFaceModelView,
    AttendanceServiceListView,
    AttendanceEditView,
    BackdateView,
    StudentAttendanceListView,
    ActiveScannersView,
    ManualAttendanceView,
    BulkAttendanceView,
    DeviceReadyView,
    DeviceStatusView,
)

urlpatterns = [
    # Protocol Member endpoints
    path('sign-in/', SignInView.as_view(), name='attendance-sign-in'),
    path('sign-out/', SignOutView.as_view(), name='attendance-sign-out'),
    path('sync/', OfflineSyncView.as_view(), name='attendance-sync'),
    path('embeddings/<uuid:service_id>/', EmbeddingsDownloadView.as_view(), name='attendance-embeddings'),
    path('offline-model/', ArcFaceModelView.as_view(), name='attendance-offline-model'),

    # Admin endpoints
    path('service/<uuid:service_id>/', AttendanceServiceListView.as_view(), name='attendance-service-list'),
    path('<uuid:id>/edit/', AttendanceEditView.as_view(), name='attendance-edit'),
    path('backdate/', BackdateView.as_view(), name='attendance-backdate'),
    path('student/<uuid:student_id>/', StudentAttendanceListView.as_view(), name='attendance-student-list'),
    path('active-scanners/<uuid:service_id>/', ActiveScannersView.as_view(), name='attendance-active-scanners'),
    path('manual-sign-in/', ManualAttendanceView.as_view(), name='attendance-manual-sign-in'),
    path('bulk-mark/', BulkAttendanceView.as_view(), name='attendance-bulk-mark'),
    path('device-ready/', DeviceReadyView.as_view(), name='attendance-device-ready'),
    path('device-status/', DeviceStatusView.as_view(), name='attendance-device-status'),
]


