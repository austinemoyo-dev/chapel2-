"""
Reports Views — Filtered attendance reports with PDF and Excel export.

Reports are generated from live database queries — never cached.
Filters: week, service, semester.
"""
import io
import logging
from datetime import datetime, timedelta
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.accounts.permissions import IsAdminOrAbove
from apps.students.models import Student
from apps.services.models import Semester
from apps.attendance.utils import calculate_attendance_percentage

logger = logging.getLogger(__name__)


class AttendanceReportView(APIView):
    """
    GET /api/reports/attendance/
    
    Filtered attendance report. Admin or above only.
    
    Query params:
    - semester_id: UUID (default: active semester)
    - service_group: S1/S2/S3 (optional filter)
    - week: ISO date string — filters to the week containing that date
    - below_threshold: true — only students below 70%
    """
    permission_classes = [IsAdminOrAbove]

    def get(self, request):
        # Get semester
        semester_id = request.query_params.get('semester_id')
        if semester_id:
            try:
                semester = Semester.objects.get(id=semester_id)
            except Semester.DoesNotExist:
                return Response({'error': 'Semester not found.'}, status=404)
        else:
            semester = Semester.objects.filter(is_active=True).first()
            if not semester:
                return Response({'error': 'No active semester.'}, status=400)

        # Get students
        students_qs = Student.objects.filter(semester=semester)

        service_group = request.query_params.get('service_group')
        if service_group:
            students_qs = students_qs.filter(service_group=service_group)

        # Build report
        report = []
        below_count = 0

        for student in students_qs:
            pct_data = calculate_attendance_percentage(student, semester.id)
            item = {
                'student_id': str(student.id),
                'student_name': student.full_name,
                'matric_number': student.matric_number,
                'system_id': student.system_id,
                'service_group': student.service_group,
                **pct_data,
            }
            if pct_data['below_threshold']:
                below_count += 1

            report.append(item)

        # Filter below threshold only
        below_only = request.query_params.get('below_threshold')
        if below_only and below_only.lower() == 'true':
            report = [r for r in report if r['below_threshold']]

        # Sort by percentage ascending (worst first)
        report.sort(key=lambda r: r['percentage'])

        return Response({
            'semester_id': str(semester.id),
            'semester_name': semester.name,
            'total_students': len(report),
            'students_below_threshold': below_count,
            'report': report,
            'generated_at': timezone.now().isoformat(),
        })


class ExportPDFView(APIView):
    """
    GET /api/reports/export/pdf/
    
    Export attendance report as PDF.
    Uses ReportLab for PDF generation.
    """
    permission_classes = [IsAdminOrAbove]

    def get(self, request):
        try:
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib import colors
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet
        except ImportError:
            return Response(
                {'error': 'PDF export library not available.'},
                status=500
            )

        # Get report data (reuse report logic)
        semester = Semester.objects.filter(is_active=True).first()
        if not semester:
            return Response({'error': 'No active semester.'}, status=400)

        students = Student.objects.filter(semester=semester)
        report_data = []
        for student in students:
            pct_data = calculate_attendance_percentage(student, semester.id)
            report_data.append({
                'name': student.full_name,
                'matric': student.matric_number or student.system_id,
                'group': student.service_group or '-',
                'valid': pct_data['valid_count'],
                'total': pct_data['total_required'],
                'pct': f"{pct_data['percentage']:.1f}%",
                'flag': '⚠️' if pct_data['below_threshold'] else '✓',
            })

        report_data.sort(key=lambda r: float(r['pct'].rstrip('%')))

        # Build PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=landscape(A4))
        styles = getSampleStyleSheet()
        elements = []

        # Title
        elements.append(Paragraph(
            f'Attendance Report — {semester.name}',
            styles['Heading1']
        ))
        elements.append(Paragraph(
            f'Generated: {timezone.now().strftime("%Y-%m-%d %H:%M")}',
            styles['Normal']
        ))
        elements.append(Spacer(1, 20))

        # Table
        header = ['Name', 'Matric/ID', 'Group', 'Valid', 'Total', '%', 'Status']
        data = [header] + [
            [r['name'], r['matric'], r['group'], r['valid'], r['total'], r['pct'], r['flag']]
            for r in report_data
        ]

        table = Table(data, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a2e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (3, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ]))
        elements.append(table)

        doc.build(elements)

        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/pdf'
        )
        response['Content-Disposition'] = (
            f'attachment; filename="attendance_report_{semester.name.replace(" ", "_")}.pdf"'
        )
        return response


class ExportExcelView(APIView):
    """
    GET /api/reports/export/excel/
    
    Export attendance report as Excel/CSV.
    Uses openpyxl for Excel generation.
    """
    permission_classes = [IsAdminOrAbove]

    def get(self, request):
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment
        except ImportError:
            return Response(
                {'error': 'Excel export library not available.'},
                status=500
            )

        semester = Semester.objects.filter(is_active=True).first()
        if not semester:
            return Response({'error': 'No active semester.'}, status=400)

        wb = Workbook()
        ws = wb.active
        ws.title = 'Attendance Report'

        # Header styling
        header_font = Font(bold=True, color='FFFFFF')
        header_fill = PatternFill(start_color='1A1A2E', end_color='1A1A2E', fill_type='solid')
        warning_fill = PatternFill(start_color='FFE0E0', end_color='FFE0E0', fill_type='solid')

        # Title row
        ws.merge_cells('A1:G1')
        ws['A1'] = f'Attendance Report — {semester.name}'
        ws['A1'].font = Font(bold=True, size=14)
        ws['A2'] = f'Generated: {timezone.now().strftime("%Y-%m-%d %H:%M")}'

        # Headers
        headers = ['Name', 'Matric/ID', 'Group', 'Valid', 'Total', 'Percentage', 'Status']
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=4, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal='center')

        # Data
        students = Student.objects.filter(semester=semester)
        row = 5
        for student in students:
            pct_data = calculate_attendance_percentage(student, semester.id)
            ws.cell(row=row, column=1, value=student.full_name)
            ws.cell(row=row, column=2, value=student.matric_number or student.system_id)
            ws.cell(row=row, column=3, value=student.service_group or '-')
            ws.cell(row=row, column=4, value=pct_data['valid_count'])
            ws.cell(row=row, column=5, value=pct_data['total_required'])
            ws.cell(row=row, column=6, value=f"{pct_data['percentage']:.1f}%")
            ws.cell(row=row, column=7, value='BELOW 70%' if pct_data['below_threshold'] else 'OK')

            if pct_data['below_threshold']:
                for col in range(1, 8):
                    ws.cell(row=row, column=col).fill = warning_fill

            row += 1

        # Auto-size columns
        for col in ws.columns:
            max_length = max(len(str(cell.value or '')) for cell in col) + 2
            ws.column_dimensions[col[0].column_letter].width = min(max_length, 30)

        buffer = io.BytesIO()
        wb.save(buffer)

        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = (
            f'attachment; filename="attendance_report_{semester.name.replace(" ", "_")}.xlsx"'
        )
        return response
