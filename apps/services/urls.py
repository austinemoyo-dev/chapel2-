"""
Services URL Configuration — Service, semester, and geo-fence endpoints.
"""
from django.urls import path
from .views import (
    SemesterListCreateView,
    SemesterDetailView,
    ArchiveSemesterView,
    ServiceListCreateView,
    ServiceDetailView,
    ServiceCancelView,
    ServicePrepareView,
    GeoFenceView,
)

urlpatterns = [
    # Semester management
    path('semesters/', SemesterListCreateView.as_view(), name='semesters-list'),
    path('semesters/<uuid:id>/', SemesterDetailView.as_view(), name='semesters-detail'),
    path('semesters/<uuid:id>/archive/', ArchiveSemesterView.as_view(), name='semesters-archive'),

    # Service management
    path('', ServiceListCreateView.as_view(), name='services-list'),
    path('<uuid:id>/', ServiceDetailView.as_view(), name='services-detail'),
    path('<uuid:id>/cancel/', ServiceCancelView.as_view(), name='services-cancel'),
    path('<uuid:id>/prepare/', ServicePrepareView.as_view(), name='services-prepare'),
]
