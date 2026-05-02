"""
ChapelEvent Serializers — Public read-only and Admin full-CRUD.
"""
from rest_framework import serializers
from .models import ChapelEvent


class ChapelEventPublicSerializer(serializers.ModelSerializer):
    """Read-only serializer for the public landing page."""
    flyer_url = serializers.SerializerMethodField()

    class Meta:
        model = ChapelEvent
        fields = [
            'id', 'title', 'description', 'event_date', 'event_time',
            'tag', 'flyer_url', 'is_featured', 'sort_order',
        ]

    def get_flyer_url(self, obj):
        if not obj.flyer:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.flyer.url)
        return obj.flyer.url


class ChapelEventAdminSerializer(serializers.ModelSerializer):
    """Full serializer for admin CRUD — includes draft/featured controls."""
    flyer_url = serializers.SerializerMethodField()

    class Meta:
        model = ChapelEvent
        fields = [
            'id', 'title', 'description', 'event_date', 'event_time',
            'tag', 'flyer', 'flyer_url', 'is_published', 'is_featured',
            'sort_order', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'flyer': {'required': False, 'allow_null': True},
        }

    def get_flyer_url(self, obj):
        if not obj.flyer:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.flyer.url)
        return obj.flyer.url
