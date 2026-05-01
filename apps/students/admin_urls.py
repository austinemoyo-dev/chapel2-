"""
Students Admin URL Configuration — Admin-only student management endpoints.
"""
from django.urls import path
from .views import (
    AdminStudentListView,
    AdminStudentDetailView,
    AdminStudentDeleteView,
    DuplicateResolutionView,
    RegistrationWindowView,
    MatricUpdateLinkView,
)

urlpatterns = [
    # Registration window control
    path('registration/open/', RegistrationWindowView.as_view(), name='admin-registration-window'),

    # Student management
    path('students/', AdminStudentListView.as_view(), name='admin-students-list'),
    path('students/<uuid:id>/', AdminStudentDetailView.as_view(), name='admin-students-detail'),
    path('students/<uuid:id>/delete/', AdminStudentDeleteView.as_view(), name='admin-students-delete'),

    # Duplicate resolution
    path('duplicates/resolve/', DuplicateResolutionView.as_view(), name='admin-duplicates-resolve'),

    # Matric update link generation
    path('matric-update-link/<uuid:id>/', MatricUpdateLinkView.as_view(), name='admin-matric-update-link'),
]
