"""
Sermon URL patterns — public and admin, imported separately by chapel/urls.py.
"""
from django.urls import path
from .sermon_views import (
    SermonPublicListView,
    SermonAdminListCreateView,
    SermonAdminDetailView,
)

# Public — /api/sermons/
public_urlpatterns = [
    path('', SermonPublicListView.as_view()),
]

# Admin — /api/admin/sermons/
admin_urlpatterns = [
    path('',           SermonAdminListCreateView.as_view()),
    path('<uuid:id>/', SermonAdminDetailView.as_view()),
]
