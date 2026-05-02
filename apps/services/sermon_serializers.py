"""
Sermon Serializers — Public read-only and Admin full-CRUD.
"""
from rest_framework import serializers
from .models import Sermon


class SermonPublicSerializer(serializers.ModelSerializer):
    """Read-only serializer for the public landing page and church website."""
    audio_url     = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Sermon
        fields = [
            'id', 'title', 'speaker', 'description', 'service_date',
            'tag', 'audio_url', 'video_url', 'thumbnail_url',
            'duration_minutes', 'sort_order',
        ]

    def get_audio_url(self, obj):
        if not obj.audio_file:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.audio_file.url)
        return obj.audio_file.url

    def get_thumbnail_url(self, obj):
        if not obj.thumbnail:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.thumbnail.url)
        return obj.thumbnail.url


class SermonAdminSerializer(serializers.ModelSerializer):
    """Full serializer for admin CRUD — includes draft/file controls."""
    audio_url     = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Sermon
        fields = [
            'id', 'title', 'speaker', 'description', 'service_date',
            'tag', 'audio_file', 'audio_url', 'video_url',
            'thumbnail', 'thumbnail_url', 'duration_minutes',
            'is_published', 'sort_order', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'audio_file': {'required': False, 'allow_null': True},
            'thumbnail':  {'required': False, 'allow_null': True},
            'video_url':  {'required': False, 'allow_null': True},
        }

    def get_audio_url(self, obj):
        if not obj.audio_file:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.audio_file.url)
        return obj.audio_file.url

    def get_thumbnail_url(self, obj):
        if not obj.thumbnail:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.thumbnail.url)
        return obj.thumbnail.url
