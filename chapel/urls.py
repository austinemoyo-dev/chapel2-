"""
Chapel Attendance Management System — Root URL Configuration.

All API endpoints are organized under /api/ prefix.
Each app has its own URL module for clean separation.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # Django admin — kept enabled for Superadmin use.
    # In production, restrict /admin/ to your IP address via nginx
    # (see nginx/nginx.conf for the allow/deny block).
    path('admin/', admin.site.urls),

    # =========================================================================
    # API ENDPOINTS
    # =========================================================================

    # Authentication & Admin User Management
    # POST /api/auth/login/
    # POST /api/auth/logout/
    # GET/POST /api/auth/users/
    # GET/PATCH/DELETE /api/auth/users/{id}/
    # POST /api/auth/bind-device/
    path('api/auth/', include('apps.accounts.urls')),

    # Student Registration (public-facing)
    # GET /api/registration/status/
    # POST /api/registration/student/
    # POST /api/registration/face-sample/
    # GET /api/registration/face-status/
    # PATCH /api/registration/update-matric/
    path('api/registration/', include('apps.students.urls')),

    # Admin Student Management
    # PATCH /api/admin/registration/open/
    # GET /api/admin/students/
    # GET/PATCH /api/admin/students/{id}/
    # DELETE /api/admin/students/{id}/delete/
    # POST /api/admin/duplicates/resolve/
    # POST /api/admin/matric-update-link/{id}/
    path('api/admin/', include('apps.students.admin_urls')),

    # Service & Semester Management
    # GET/POST /api/services/
    # GET/PATCH /api/services/{id}/
    # DELETE /api/services/{id}/cancel/
    # GET/POST /api/services/semesters/
    # GET/PATCH /api/services/semesters/{id}/
    path('api/services/', include('apps.services.urls')),

    # Geo-fence Configuration
    # GET/PATCH /api/geo-fence/
    path('api/geo-fence/', include('apps.services.geofence_urls')),

    # Attendance Engine
    # POST /api/attendance/sign-in/
    # POST /api/attendance/sign-out/
    # POST /api/attendance/sync/
    # GET /api/attendance/embeddings/{service_id}/
    # GET /api/attendance/service/{service_id}/
    # PATCH /api/attendance/{id}/edit/
    # POST /api/attendance/backdate/
    path('api/attendance/', include('apps.attendance.urls')),

    # Reports & Exports
    # GET /api/reports/attendance/
    # GET /api/reports/export/pdf/
    # GET /api/reports/export/excel/
    path('api/reports/', include('apps.reports.urls')),

    # Audit Logs
    # GET /api/audit/logs/
    path('api/audit/', include('apps.audit.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
