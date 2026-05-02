"""
ChapelEvent URL patterns.
Imported by chapel/urls.py for both the public and admin namespaces.
"""
from django.urls import path
from .event_views import (
    ChapelEventPublicListView,
    ChapelEventAdminListCreateView,
    ChapelEventAdminDetailView,
)

# Public — /api/events/
public_urlpatterns = [
    path('', ChapelEventPublicListView.as_view()),
]

# Admin — /api/admin/events/
admin_urlpatterns = [
    path('',          ChapelEventAdminListCreateView.as_view()),
    path('<uuid:id>/', ChapelEventAdminDetailView.as_view()),
]
