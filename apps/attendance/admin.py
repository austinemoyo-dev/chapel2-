from django.contrib import admin
from .models import AttendanceRecord


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = (
        'student', 'service', 'protocol_member', 'signed_in_at',
        'signed_out_at', 'is_valid', 'is_offline_record', 'is_backdated'
    )
    list_filter = ('is_valid', 'is_offline_record', 'is_backdated', 'service__service_type')
    search_fields = ('student__full_name', 'student__matric_number')
    readonly_fields = ('id', 'created_at')
