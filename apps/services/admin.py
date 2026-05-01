from django.contrib import admin
from .models import Semester, Service, GeoFenceConfig


@admin.register(Semester)
class SemesterAdmin(admin.ModelAdmin):
    list_display = ('name', 'start_date', 'end_date', 'is_active', 'is_archived', 'registration_open')
    list_filter = ('is_active', 'is_archived')


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ('service_type', 'service_group', 'scheduled_date', 'is_cancelled', 'semester')
    list_filter = ('service_type', 'service_group', 'is_cancelled')
    search_fields = ('name',)


@admin.register(GeoFenceConfig)
class GeoFenceConfigAdmin(admin.ModelAdmin):
    list_display = ('latitude', 'longitude', 'radius_meters', 'updated_at')
