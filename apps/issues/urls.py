"""
Admin URL Configuration for issue reports.
All routes prefixed with /api/admin/issues/
"""
from django.urls import path
from .views import IssueAdminListView, IssueAdminDetailView, IssueAdminMessageView, IssueAdminResolveView

urlpatterns = [
    path('', IssueAdminListView.as_view(), name='admin-issues-list'),
    path('<uuid:id>/', IssueAdminDetailView.as_view(), name='admin-issues-detail'),
    path('<uuid:id>/messages/', IssueAdminMessageView.as_view(), name='admin-issues-messages'),
    path('<uuid:id>/resolve/', IssueAdminResolveView.as_view(), name='admin-issues-resolve'),
]
