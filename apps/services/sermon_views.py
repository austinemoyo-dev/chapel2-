"""
Sermon Views — Public list and admin CRUD.
"""
import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db import transaction

from .models import Sermon
from .sermon_serializers import SermonPublicSerializer, SermonAdminSerializer
from apps.accounts.permissions import IsSuperadmin

logger = logging.getLogger(__name__)


class SermonPublicListView(APIView):
    """
    GET /api/sermons/
    Public endpoint — returns all published sermons ordered by service_date descending.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        sermons = Sermon.objects.filter(is_published=True)
        serializer = SermonPublicSerializer(
            sermons, many=True, context={'request': request}
        )
        return Response(serializer.data)


class SermonAdminListCreateView(APIView):
    """
    GET  /api/admin/sermons/ — List all sermons (including drafts).
    POST /api/admin/sermons/ — Create a new sermon (with optional file uploads).
    Superadmin only.
    """
    permission_classes = [IsSuperadmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        sermons = Sermon.objects.all()
        serializer = SermonAdminSerializer(
            sermons, many=True, context={'request': request}
        )
        return Response(serializer.data)

    @transaction.atomic
    def post(self, request):
        serializer = SermonAdminSerializer(
            data=request.data, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        sermon = serializer.save()
        logger.info(f'Sermon created: {sermon.title} by {request.user.email}')
        return Response(
            SermonAdminSerializer(sermon, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class SermonAdminDetailView(APIView):
    """
    GET    /api/admin/sermons/{id}/ — Retrieve sermon detail.
    PATCH  /api/admin/sermons/{id}/ — Update sermon (partial update supported).
    DELETE /api/admin/sermons/{id}/ — Delete sermon and its media files.
    Superadmin only.
    """
    permission_classes = [IsSuperadmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get_sermon(self, id):
        try:
            return Sermon.objects.get(id=id)
        except Sermon.DoesNotExist:
            return None

    def get(self, request, id):
        sermon = self._get_sermon(id)
        if not sermon:
            return Response({'error': 'Sermon not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(SermonAdminSerializer(sermon, context={'request': request}).data)

    @transaction.atomic
    def patch(self, request, id):
        sermon = self._get_sermon(id)
        if not sermon:
            return Response({'error': 'Sermon not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Handle explicit removal of audio or thumbnail
        if request.data.get('remove_audio') in ('true', True, '1', 1):
            if sermon.audio_file:
                sermon.audio_file.delete(save=False)
                sermon.audio_file = None
                sermon.save(update_fields=['audio_file'])

        if request.data.get('remove_thumbnail') in ('true', True, '1', 1):
            if sermon.thumbnail:
                sermon.thumbnail.delete(save=False)
                sermon.thumbnail = None
                sermon.save(update_fields=['thumbnail'])

        serializer = SermonAdminSerializer(
            sermon, data=request.data, partial=True, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        sermon = serializer.save()
        logger.info(f'Sermon updated: {sermon.title} by {request.user.email}')
        return Response(SermonAdminSerializer(sermon, context={'request': request}).data)

    @transaction.atomic
    def delete(self, request, id):
        sermon = self._get_sermon(id)
        if not sermon:
            return Response({'error': 'Sermon not found.'}, status=status.HTTP_404_NOT_FOUND)

        title = sermon.title
        if sermon.audio_file:
            sermon.audio_file.delete(save=False)
        if sermon.thumbnail:
            sermon.thumbnail.delete(save=False)
        sermon.delete()
        logger.info(f'Sermon deleted: {title} by {request.user.email}')
        return Response({'message': f'Sermon "{title}" deleted.'}, status=status.HTTP_200_OK)
