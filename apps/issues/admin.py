from django.contrib import admin
from .models import IssueReport


@admin.register(IssueReport)
class IssueReportAdmin(admin.ModelAdmin):
    list_display = ('student', 'category', 'status', 'severity', 'resolution_type', 'created_at')
    list_filter = ('status', 'severity', 'category', 'resolution_type')
    search_fields = ('student__full_name', 'student__matric_number', 'description')
    readonly_fields = ('id', 'created_at', 'updated_at')
