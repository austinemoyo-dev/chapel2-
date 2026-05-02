"""
ChapelEvent Views — Public list and admin CRUD.
"""
import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db import transaction

from .models import ChapelEvent
from .event_serializers import ChapelEventPublicSerializer, ChapelEventAdminSerializer
from apps.accounts.permissions import IsSuperadmin

logger = logging.getLogger(__name__)


class ChapelEventPublicListView(APIView):
    """
    GET /api/events/
    Public endpoint — returns all published events ordered by sort_order, event_date.
    No authentication required.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        events = ChapelEvent.objects.filter(is_published=True)
        serializer = ChapelEventPublicSerializer(
            events, many=True, context={'request': request}
        )
        return Response(serializer.data)


class ChapelEventAdminListCreateView(APIView):
    """
    GET  /api/admin/events/ — List all events (including drafts).
    POST /api/admin/events/ — Create a new event (with optional flyer upload).
    Superadmin only.
    """
    permission_classes = [IsSuperadmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        events = ChapelEvent.objects.all()
        serializer = ChapelEventAdminSerializer(
            events, many=True, context={'request': request}
        )
        return Response(serializer.data)

    @transaction.atomic
    def post(self, request):
        serializer = ChapelEventAdminSerializer(
            data=request.data, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        event = serializer.save()
        logger.info(f'ChapelEvent created: {event.title} by {request.user.email}')
        return Response(
            ChapelEventAdminSerializer(event, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class ChapelEventAdminDetailView(APIView):
    """
    GET    /api/admin/events/{id}/ — Retrieve event detail.
    PATCH  /api/admin/events/{id}/ — Update event (partial update supported).
    DELETE /api/admin/events/{id}/ — Delete event and its flyer file.
    Superadmin only.
    """
    permission_classes = [IsSuperadmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get_event(self, id):
        try:
            return ChapelEvent.objects.get(id=id)
        except ChapelEvent.DoesNotExist:
            return None

    def get(self, request, id):
        event = self._get_event(id)
        if not event:
            return Response({'error': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            ChapelEventAdminSerializer(event, context={'request': request}).data
        )

    @transaction.atomic
    def patch(self, request, id):
        event = self._get_event(id)
        if not event:
            return Response({'error': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Handle flyer removal: if client sends flyer='' or flyer=null, clear the field
        remove_flyer = request.data.get('remove_flyer') in ('true', True, '1', 1)
        if remove_flyer and event.flyer:
            event.flyer.delete(save=False)
            event.flyer = None
            event.save(update_fields=['flyer'])

        serializer = ChapelEventAdminSerializer(
            event, data=request.data, partial=True, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        event = serializer.save()
        logger.info(f'ChapelEvent updated: {event.title} by {request.user.email}')
        return Response(
            ChapelEventAdminSerializer(event, context={'request': request}).data
        )

    @transaction.atomic
    def delete(self, request, id):
        event = self._get_event(id)
        if not event:
            return Response({'error': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

        title = event.title
        # Delete the flyer file from disk before removing the record
        if event.flyer:
            event.flyer.delete(save=False)
        event.delete()
        logger.info(f'ChapelEvent deleted: {title} by {request.user.email}')
        return Response({'message': f'Event "{title}" deleted.'}, status=status.HTTP_200_OK)
