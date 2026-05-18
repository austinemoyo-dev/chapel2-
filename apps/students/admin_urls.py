"""
Students Admin URL Configuration — Admin-only student management endpoints.
"""
from django.urls import path
from .views import (
    AdminStudentListView,
    AdminStudentDetailView,
    AdminStudentDeleteView,
    ResetFaceCaptureView,
    DuplicateResolutionView,
    RegistrationWindowView,
    MatricUpdateLinkView,
    FaceCaptureReportView,
)

urlpatterns = [
    # Registration window control
    path('registration/open/', RegistrationWindowView.as_view(), name='admin-registration-window'),

    # Student management
    path('students/', AdminStudentListView.as_view(), name='admin-students-list'),
    path('students/face-capture-report/', FaceCaptureReportView.as_view(), name='admin-face-capture-report'),
    path('students/<uuid:id>/', AdminStudentDetailView.as_view(), name='admin-students-detail'),
    path('students/<uuid:id>/delete/', AdminStudentDeleteView.as_view(), name='admin-students-delete'),
    path('students/<uuid:id>/reset-face/', ResetFaceCaptureView.as_view(), name='admin-students-reset-face'),

    # Duplicate resolution
    path('duplicates/resolve/', DuplicateResolutionView.as_view(), name='admin-duplicates-resolve'),

    # Matric update link generation
    path('matric-update-link/<uuid:id>/', MatricUpdateLinkView.as_view(), name='admin-matric-update-link'),
]
