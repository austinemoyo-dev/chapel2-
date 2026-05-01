from django.contrib import admin
from .models import Student, FaceSample


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = (
        'full_name', 'student_type', 'matric_number', 'system_id',
        'service_group', 'is_active', 'duplicate_flag', 'face_registered'
    )
    list_filter = ('student_type', 'level', 'gender', 'service_group', 'is_active', 'duplicate_flag')
    search_fields = ('full_name', 'matric_number', 'system_id', 'phone_number')
    readonly_fields = ('id', 'system_id', 'full_name_normalized', 'created_at')


@admin.register(FaceSample)
class FaceSampleAdmin(admin.ModelAdmin):
    list_display = ('student', 'status', 'rejection_reason', 'semester', 'created_at')
    list_filter = ('status', 'semester')
    search_fields = ('student__full_name',)
