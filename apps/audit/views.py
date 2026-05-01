"""
Audit Views — Searchable, filterable audit log viewer.

Append-only audit trail — no delete/update operations exposed.
Superadmin only access.
"""
from rest_framework import generics
from .models import AuditLog
from .serializers import AuditLogSerializer
from apps.accounts.permissions import IsSuperadmin


class AuditLogListView(generics.ListAPIView):
    """
    GET /api/audit/logs/
    
    List audit log entries. Superadmin only.
    
    Filters:
    - action_type: e.g., ATTENDANCE_EDIT, STUDENT_DELETE
    - target_type: e.g., Student, Service
    - actor_id: UUID of the user who performed the action
    - date_from / date_to: ISO date strings for time range
    - search: free-text search in reason_note
    """
    serializer_class = AuditLogSerializer
    permission_classes = [IsSuperadmin]

    def get_queryset(self):
        qs = AuditLog.objects.select_related('actor').all()

        # Filters
        action_type = self.request.query_params.get('action_type')
        if action_type:
            qs = qs.filter(action_type=action_type)

        target_type = self.request.query_params.get('target_type')
        if target_type:
            qs = qs.filter(target_type=target_type)

        actor_id = self.request.query_params.get('actor_id')
        if actor_id:
            qs = qs.filter(actor_id=actor_id)

        target_id = self.request.query_params.get('target_id')
        if target_id:
            qs = qs.filter(target_id=target_id)

        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(created_at__gte=date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(created_at__lte=date_to)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(reason_note__icontains=search)

        return qs
