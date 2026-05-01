"""
Reports URL Configuration — Report and export endpoints.
"""
from django.urls import path
from .views import (
    AttendanceReportView,
    ExportPDFView,
    ExportExcelView,
)

urlpatterns = [
    path('attendance/', AttendanceReportView.as_view(), name='reports-attendance'),
    path('export/pdf/', ExportPDFView.as_view(), name='reports-export-pdf'),
    path('export/excel/', ExportExcelView.as_view(), name='reports-export-excel'),
]
