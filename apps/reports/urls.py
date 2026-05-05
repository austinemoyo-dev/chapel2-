"""
Reports URL Configuration — Report, export, analytics, and scan metrics endpoints.
"""
from django.urls import path
from .views import (
    AttendanceReportView,
    ExportPDFView,
    ExportExcelView,
    DashboardStatsView,
    SemesterComparisonView,
    StudentTrendView,
    ScanMetricsView,
)

urlpatterns = [
    path('attendance/', AttendanceReportView.as_view(), name='reports-attendance'),
    path('export/pdf/', ExportPDFView.as_view(), name='reports-export-pdf'),
    path('export/excel/', ExportExcelView.as_view(), name='reports-export-excel'),
    path('dashboard-stats/', DashboardStatsView.as_view(), name='reports-dashboard-stats'),
    path('semester-comparison/', SemesterComparisonView.as_view(), name='reports-semester-comparison'),
    path('student-trend/', StudentTrendView.as_view(), name='reports-student-trend'),
    path('scan-metrics/<uuid:service_id>/', ScanMetricsView.as_view(), name='reports-scan-metrics'),
]
