"""
Student Portal URL Configuration for issue reports.
All routes prefixed with /api/portal/issues/
"""
from django.urls import path
from .portal_views import IssuePortalListCreateView, IssuePortalReopenView

urlpatterns = [
    path('', IssuePortalListCreateView.as_view(), name='portal-issues-list-create'),
    path('<uuid:id>/reopen/', IssuePortalReopenView.as_view(), name='portal-issues-reopen'),
]
