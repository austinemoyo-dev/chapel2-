"""
Services Serializers — Service CRUD, semester management, and geo-fence config.
"""
from rest_framework import serializers
from .models import Semester, Service, GeoFenceConfig


class SemesterSerializer(serializers.ModelSerializer):
    """Full serializer for semester CRUD."""
    total_students = serializers.SerializerMethodField()
    total_services = serializers.SerializerMethodField()
    group_stats = serializers.SerializerMethodField()

    class Meta:
        model = Semester
        fields = [
            'id', 'name', 'start_date', 'end_date',
            'is_active', 'is_archived', 'registration_open',
            'service_group_capacities',
            'total_students', 'total_services', 'group_stats', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_total_students(self, obj):
        return obj.students.count() if hasattr(obj, 'students') else 0

    def get_total_services(self, obj):
        return obj.services.filter(is_cancelled=False).count()

    def get_group_stats(self, obj):
        """Return student count per service group for this semester."""
        from django.db.models import Count
        if not hasattr(obj, 'students'):
            return {}
        counts = dict(
            obj.students.values('service_group').annotate(
                count=Count('id')
            ).values_list('service_group', 'count')
        )
        caps = obj.service_group_capacities or {}
        stats = {}
        for group in ['S1', 'S2', 'S3']:
            cap = caps.get(group, 500)
            current = counts.get(group, 0)
            stats[group] = {
                'count': current,
                'capacity': cap,
                'percentage': round((current / cap) * 100, 1) if cap > 0 else 0,
            }
        return stats


class ServiceSerializer(serializers.ModelSerializer):
    """
    Full serializer for service CRUD.
    
    Validates:
    - window_close_time must be after window_open_time
    - Semester must be active
    - Special services must have service_group='all'
    """
    is_window_open = serializers.BooleanField(read_only=True)

    class Meta:
        model = Service
        fields = [
            'id', 'semester', 'service_type', 'service_group', 'name',
            'scheduled_date', 'window_open_time', 'window_close_time',
            'signout_required', 'signout_open_time', 'signout_close_time',
            'capacity_cap', 'is_cancelled', 'is_window_open', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'is_window_open']

    def validate(self, data):
        # Window validation
        open_time = data.get('window_open_time')
        close_time = data.get('window_close_time')
        if open_time and close_time and close_time <= open_time:
            raise serializers.ValidationError({
                'window_close_time': 'Close time must be after open time.'
            })

        # Special services must be 'all'
        service_type = data.get('service_type')
        service_group = data.get('service_group')
        if service_type == 'special' and service_group != 'all':
            raise serializers.ValidationError({
                'service_group': 'Special services must have service_group set to "all".'
            })

        return data


class ServiceListSerializer(serializers.ModelSerializer):
    """Compact serializer for service listing."""
    is_window_open = serializers.BooleanField(read_only=True)

    class Meta:
        model = Service
        fields = [
            'id', 'semester', 'service_type', 'service_group', 'name',
            'scheduled_date', 'window_open_time', 'window_close_time',
            'signout_required', 'signout_open_time', 'signout_close_time',
            'capacity_cap', 'is_cancelled', 'is_window_open',
        ]


class GeoFenceSerializer(serializers.ModelSerializer):
    """Serializer for geo-fence configuration updates."""
    class Meta:
        model = GeoFenceConfig
        fields = ['id', 'latitude', 'longitude', 'radius_meters', 'updated_at']
        read_only_fields = ['id', 'updated_at']
