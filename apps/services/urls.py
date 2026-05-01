"""
Services URL Configuration — Service, semester, and geo-fence endpoints.
"""
from django.urls import path
from .views import (
    SemesterListCreateView,
    SemesterDetailView,
    ServiceListCreateView,
    ServiceDetailView,
    ServiceCancelView,
    GeoFenceView,
)

urlpatterns = [
    # Semester management
    path('semesters/', SemesterListCreateView.as_view(), name='semesters-list'),
    path('semesters/<uuid:id>/', SemesterDetailView.as_view(), name='semesters-detail'),

    # Service management
    path('', ServiceListCreateView.as_view(), name='services-list'),
    path('<uuid:id>/', ServiceDetailView.as_view(), name='services-detail'),
    path('<uuid:id>/cancel/', ServiceCancelView.as_view(), name='services-cancel'),
]
