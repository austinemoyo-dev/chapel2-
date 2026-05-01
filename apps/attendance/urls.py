"""
Attendance URL Configuration — Attendance marking, sync, and management endpoints.
"""
from django.urls import path
from .views import (
    SignInView,
    SignOutView,
    OfflineSyncView,
    EmbeddingsDownloadView,
    AttendanceServiceListView,
    AttendanceEditView,
    BackdateView,
)

urlpatterns = [
    # Protocol Member endpoints
    path('sign-in/', SignInView.as_view(), name='attendance-sign-in'),
    path('sign-out/', SignOutView.as_view(), name='attendance-sign-out'),
    path('sync/', OfflineSyncView.as_view(), name='attendance-sync'),
    path('embeddings/<uuid:service_id>/', EmbeddingsDownloadView.as_view(), name='attendance-embeddings'),

    # Admin endpoints
    path('service/<uuid:service_id>/', AttendanceServiceListView.as_view(), name='attendance-service-list'),
    path('<uuid:id>/edit/', AttendanceEditView.as_view(), name='attendance-edit'),
    path('backdate/', BackdateView.as_view(), name='attendance-backdate'),
]
