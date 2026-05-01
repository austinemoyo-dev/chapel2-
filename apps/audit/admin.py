from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('action_type', 'actor', 'target_type', 'target_id', 'created_at')
    list_filter = ('action_type', 'target_type')
    search_fields = ('action_type', 'actor__full_name', 'reason_note')
    readonly_fields = (
        'id', 'actor', 'action_type', 'target_type', 'target_id',
        'previous_value', 'new_value', 'reason_note', 'device_id',
        'gps_lat', 'gps_lng', 'created_at'
    )

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False
