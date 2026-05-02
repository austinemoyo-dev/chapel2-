"""
Chapel Attendance Management System — Root URL Configuration.

All API endpoints are organized under /api/ prefix.
Each app has its own URL module for clean separation.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from apps.services.event_urls import public_urlpatterns as event_public_urls
from apps.services.event_urls import admin_urlpatterns as event_admin_urls
from apps.services.sermon_urls import public_urlpatterns as sermon_public_urls
from apps.services.sermon_urls import admin_urlpatterns as sermon_admin_urls

urlpatterns = [
    # Django admin — kept enabled for Superadmin use.
    # In production, restrict /admin/ to your IP address via nginx
    # (see nginx/nginx.conf for the allow/deny block).
    path('sysadmin/', admin.site.urls),

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

    # Chapel Events (Phase 2)
    # GET /api/events/                    — public landing page
    # GET/POST /api/admin/events/         — admin CRUD
    # GET/PATCH/DELETE /api/admin/events/{id}/
    path('api/events/', include((event_public_urls, 'events-public'))),
    path('api/admin/events/', include((event_admin_urls, 'events-admin'))),

    # Sermon Library (Phase 2)
    # GET /api/sermons/                   — public landing page
    # GET/POST /api/admin/sermons/        — admin CRUD
    # GET/PATCH/DELETE /api/admin/sermons/{id}/
    path('api/sermons/', include((sermon_public_urls, 'sermons-public'))),
    path('api/admin/sermons/', include((sermon_admin_urls, 'sermons-admin'))),
]

from django.urls import re_path
from django.views.static import serve

# In this VPS deployment, Nginx (on the host) proxies /media/ and /static/ to Django.
# Therefore, Django must serve these files even when DEBUG=False.
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^static/(?P<path>.*)$', serve, {'document_root': settings.STATIC_ROOT}),
]
