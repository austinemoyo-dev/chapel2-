"""
Student Portal URL Configuration.
All routes prefixed with /api/portal/
"""
from django.urls import path
from .portal_views import (
    PortalLookupView,
    PortalSetupPasswordView,
    PortalLoginView,
    PortalMeView,
    PortalAttendanceView,
    PortalTodayView,
    PortalFaceStatusView,
)

urlpatterns = [
    # Public — no auth required
    path('lookup/', PortalLookupView.as_view(), name='portal-lookup'),
    path('setup-password/', PortalSetupPasswordView.as_view(), name='portal-setup-password'),
    path('login/', PortalLoginView.as_view(), name='portal-login'),

    # Authenticated — requires X-Portal-Token header
    path('me/', PortalMeView.as_view(), name='portal-me'),
    path('attendance/', PortalAttendanceView.as_view(), name='portal-attendance'),
    path('today/', PortalTodayView.as_view(), name='portal-today'),
    path('face-status/', PortalFaceStatusView.as_view(), name='portal-face-status'),
]
