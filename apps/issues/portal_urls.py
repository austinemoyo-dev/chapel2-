"""
Student Portal URL Configuration for issue reports.
All routes prefixed with /api/portal/issues/
"""
from django.urls import path
from .portal_views import IssuePortalListCreateView, IssuePortalThreadView, IssuePortalMessageView

urlpatterns = [
    path('', IssuePortalListCreateView.as_view(), name='portal-issues-list-create'),
    path('<uuid:id>/', IssuePortalThreadView.as_view(), name='portal-issues-thread'),
    path('<uuid:id>/messages/', IssuePortalMessageView.as_view(), name='portal-issues-messages'),
]
