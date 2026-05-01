"""
Geo-fence URL — Separate URL config for the geo-fence endpoint.
"""
from django.urls import path
from .views import GeoFenceView

urlpatterns = [
    path('', GeoFenceView.as_view(), name='geofence'),
]
