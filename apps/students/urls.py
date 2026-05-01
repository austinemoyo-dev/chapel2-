"""
Students URL Configuration — Registration and face sample endpoints.
"""
from django.urls import path
from .views import (
    RegistrationStatusView,
    StudentRegistrationView,
    FaceSampleUploadView,
    FaceStatusView,
    MatricUpdateView,
)

urlpatterns = [
    # Public registration endpoints
    path('status/', RegistrationStatusView.as_view(), name='registration-status'),
    path('student/', StudentRegistrationView.as_view(), name='registration-student'),
    path('face-sample/', FaceSampleUploadView.as_view(), name='registration-face-sample'),
    path('face-status/', FaceStatusView.as_view(), name='registration-face-status'),
    path('update-matric/', MatricUpdateView.as_view(), name='registration-update-matric'),
]
