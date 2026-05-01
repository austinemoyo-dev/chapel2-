# Chapel Attendance Management System — Backend Guide

## Table of Contents
1. [Setup & Run](#1-setup--run)
2. [Create Superadmin](#2-create-superadmin)
3. [Login & Get Token](#3-login--get-token)
4. [Create Admin Users](#4-create-admin-users)
5. [Semester Setup](#5-semester-setup)
6. [Open Registration](#6-open-registration)
7. [Register a Student](#7-register-a-student)
8. [Upload Face Samples](#8-upload-face-samples)
9. [Create Services](#9-create-services)
10. [Set Up Geo-Fence](#10-set-up-geo-fence)
11. [Bind Device to Protocol Member](#11-bind-device-to-protocol-member)
12. [Mark Attendance (Sign-In)](#12-mark-attendance-sign-in)
13. [Mark Attendance (Sign-Out)](#13-mark-attendance-sign-out)
14. [Offline Sync](#14-offline-sync)
15. [Download Embeddings for Offline Mode](#15-download-embeddings-for-offline-mode)
16. [View Attendance Reports](#16-view-attendance-reports)
17. [Export Reports (PDF / Excel)](#17-export-reports-pdf--excel)
18. [Manual Attendance Edit (Appeals)](#18-manual-attendance-edit-appeals)
19. [Late Resumption Backdating](#19-late-resumption-backdating)
20. [Resolve Duplicate Flags](#20-resolve-duplicate-flags)
21. [Delete a Student](#21-delete-a-student)
22. [Generate Matric Update Link](#22-generate-matric-update-link)
23. [Student Updates Matric Number](#23-student-updates-matric-number)
24. [Cancel a Service](#24-cancel-a-service)
25. [View Audit Logs](#25-view-audit-logs)
26. [All API Endpoints Reference](#26-all-api-endpoints-reference)

---

## 1. Setup & Run

### First Time Setup
Open PowerShell in the project folder (`c:\Users\CEMEX\Videos\chapel2`):

```powershell
# If you get an execution policy error, run this first (one time only):
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# Activate the virtual environment
.\venv\Scripts\Activate.ps1

# Run database migrations (already done, but needed if you add new models)
python manage.py migrate

# Start the server
python manage.py runserver
```

### Every Time You Want to Run
```powershell
# Step 1: Activate virtual environment
.\venv\Scripts\Activate.ps1

# Step 2: Start server
python manage.py runserver
```

The API will be live at: **http://localhost:8000**

### Django Admin Panel
Go to **http://localhost:8000/admin/** in your browser.
Login with the superadmin credentials you created.

---

## 2. Create Superadmin

The superadmin is the highest-level account. It can ONLY be created via command line (not the API).

```powershell
# Interactive mode (will ask you for email, name, password):
python manage.py create_superadmin

# Or one-liner (no prompts):
python manage.py create_superadmin --email admin@chapel.edu --name "Chapel Admin" --password YourPassword123 --noinput
```

**A superadmin was already created during setup:**
- Email: `admin@chapel.edu`
- Password: `Chapel2026!`

---

## 3. Login & Get Token

Every API call (except public ones) needs a token. Here's how to get one:

**Request:**
```
POST http://localhost:8000/api/auth/login/
Content-Type: application/json

{
    "email": "admin@chapel.edu",
    "password": "Chapel2026!"
}
```

**Response:**
```json
{
    "refresh": "eyJ...(long token)...",
    "access": "eyJ...(long token)...",
    "user": {
        "id": "a8457b1d-...",
        "email": "admin@chapel.edu",
        "full_name": "Chapel Admin",
        "role": "superadmin"
    }
}
```

**How to use the token:** Add this header to every request:
```
Authorization: Bearer <access_token>
```

**Using PowerShell to test:**
```powershell
# Login
$response = Invoke-RestMethod -Uri "http://localhost:8000/api/auth/login/" -Method POST -ContentType "application/json" -Body '{"email":"admin@chapel.edu","password":"Chapel2026!"}'

# Save the token
$token = $response.access

# Use the token in other requests
$headers = @{ "Authorization" = "Bearer $token" }
```

**Logout:**
```
POST http://localhost:8000/api/auth/logout/
Authorization: Bearer <access_token>

{
    "refresh": "<refresh_token>"
}
```

---

## 4. Create Admin Users

Only the **Superadmin** can create other users.

**Create an Admin:**
```
POST http://localhost:8000/api/auth/users/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "email": "john@chapel.edu",
    "full_name": "John Admin",
    "password": "SecurePass123",
    "role": "admin",
    "admin_permissions": {
        "can_view_students": true,
        "can_add_students": true,
        "can_edit_students": false,
        "can_view_reports": true,
        "can_view_archived": false
    }
}
```

**Create a Protocol Member (marks attendance):**
```
POST http://localhost:8000/api/auth/users/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "email": "protocol1@chapel.edu",
    "full_name": "Protocol Member One",
    "password": "SecurePass123",
    "role": "protocol_member"
}
```

**Create a Protocol Admin (monitors live attendance):**
```
POST http://localhost:8000/api/auth/users/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "email": "monitor@chapel.edu",
    "full_name": "Protocol Monitor",
    "password": "SecurePass123",
    "role": "protocol_admin"
}
```

**Available roles:** `admin`, `protocol_admin`, `protocol_member`
(You cannot create `superadmin` via API — only via command line)

**List all users:**
```
GET http://localhost:8000/api/auth/users/
Authorization: Bearer <superadmin_token>
```

**Update a user:**
```
PATCH http://localhost:8000/api/auth/users/<user_id>/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "phone_number": "08012345678"
}
```

---

## 5. Semester Setup

You need to create a semester before anything else works.

**Create a semester:**
```
POST http://localhost:8000/api/services/semesters/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "name": "2025/2026 First Semester",
    "start_date": "2025-09-15",
    "end_date": "2026-01-31",
    "is_active": true,
    "registration_open": false
}
```

**List semesters:**
```
GET http://localhost:8000/api/services/semesters/
Authorization: Bearer <token>
```

---

## 6. Open Registration

Students can only register when the registration window is open.

**Open registration:**
```
PATCH http://localhost:8000/api/admin/registration/open/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "registration_open": true
}
```

**Close registration:**
```
PATCH http://localhost:8000/api/admin/registration/open/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "registration_open": false
}
```

**Check if registration is open (no login needed):**
```
GET http://localhost:8000/api/registration/status/
```

---

## 7. Register a Student

**Register an old student (has matric number):**
```
POST http://localhost:8000/api/registration/student/
Content-Type: multipart/form-data

student_type: old
full_name: John Emmanuel
phone_number: 08012345678
matric_number: MAT/2024/001
department: Computer Science
level: 200
gender: male
profile_photo: (optional image file)
```

**Register a new student (no matric yet):**
```
POST http://localhost:8000/api/registration/student/
Content-Type: multipart/form-data

student_type: new
full_name: Jane Doe
phone_number: 08098765432
department: Physics
level: 100
gender: female
```

The system automatically:
- Capitalizes the name (john emmanuel → John Emmanuel)
- Generates a system ID (e.g., CHP-A1B2C3D4)
- Runs duplicate checks (matric, phone, fuzzy name)
- Assigns a service group (S1, S2, or S3)
- Flags duplicates for Superadmin review

**Response includes:**
- `system_id` — save this! New students need it to update their matric later.
- `service_group` — which service group they're assigned to
- `duplicate_flag` — true if flagged for review

**List all students (admin):**
```
GET http://localhost:8000/api/admin/students/
Authorization: Bearer <token>
```

**Filter students:**
```
GET http://localhost:8000/api/admin/students/?service_group=S1
GET http://localhost:8000/api/admin/students/?duplicate_flag=true
GET http://localhost:8000/api/admin/students/?search=john
GET http://localhost:8000/api/admin/students/?is_active=true
```

---

## 8. Upload Face Samples

After registration, the student needs at least **3 approved face samples** to activate their account.

**Upload one face sample:**
```
POST http://localhost:8000/api/registration/face-sample/
Content-Type: multipart/form-data

student_id: <student_uuid>
sample_file: (image file — JPG/PNG of their face)
```

**Response:**
```json
{
    "id": "...",
    "status": "approved",
    "rejection_reason": null,
    "approved_count": 1,
    "total_count": 1,
    "face_registered": false,
    "message": "Face sample approved. (1/3 minimum required)"
}
```

**Possible rejection reasons:**
- "No face detected. Position your face in the center of the frame."
- "Move closer to the camera."
- "Poor lighting or image quality."
- "Multiple faces detected. Ensure only your face is visible."

**Check face registration status:**
```
GET http://localhost:8000/api/registration/face-status/?student_id=<student_uuid>
```

Repeat until 3+ samples are approved. The student account activates automatically.

---

## 9. Create Services

Services are the chapel sessions that students attend.

**Create a midweek service:**
```
POST http://localhost:8000/api/services/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "semester": "<semester_uuid>",
    "service_type": "midweek",
    "service_group": "S1",
    "name": "Midweek Service S1 - Week 1",
    "scheduled_date": "2025-10-01",
    "window_open_time": "2025-10-01T16:30:00Z",
    "window_close_time": "2025-10-01T18:30:00Z",
    "signout_required": false,
    "capacity_cap": 500
}
```

**Create a Sunday service with sign-out required:**
```
POST http://localhost:8000/api/services/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "semester": "<semester_uuid>",
    "service_type": "sunday",
    "service_group": "S2",
    "name": "Sunday Service S2 - Week 1",
    "scheduled_date": "2025-10-05",
    "window_open_time": "2025-10-05T08:00:00Z",
    "window_close_time": "2025-10-05T11:00:00Z",
    "signout_required": true,
    "capacity_cap": 500
}
```

**Create a special service (all students attend):**
```
POST http://localhost:8000/api/services/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "semester": "<semester_uuid>",
    "service_type": "special",
    "service_group": "all",
    "name": "Revival Conference Day 1",
    "scheduled_date": "2025-11-15",
    "window_open_time": "2025-11-15T09:00:00Z",
    "window_close_time": "2025-11-15T13:00:00Z",
    "signout_required": false,
    "capacity_cap": 2000
}
```

**Service types:** `midweek`, `sunday`, `special`
**Service groups:** `S1`, `S2`, `S3`, `all` (all is for special services only)

**List services:**
```
GET http://localhost:8000/api/services/
Authorization: Bearer <token>
```

**Update a service:**
```
PATCH http://localhost:8000/api/services/<service_uuid>/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "window_close_time": "2025-10-01T19:00:00Z"
}
```

---

## 10. Set Up Geo-Fence

The geo-fence ensures attendance is only marked within the chapel premises.

**Set chapel coordinates:**
```
PATCH http://localhost:8000/api/geo-fence/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "latitude": 6.8921,
    "longitude": 3.7184,
    "radius_meters": 200
}
```

**View current geo-fence:**
```
GET http://localhost:8000/api/geo-fence/
Authorization: Bearer <token>
```

---

## 11. Bind Device to Protocol Member

Protocol members can only mark attendance from their registered device.

```
POST http://localhost:8000/api/auth/bind-device/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "protocol_member_id": "<protocol_member_uuid>",
    "device_id": "device-fingerprint-abc123"
}
```

---

## 12. Mark Attendance (Sign-In)

Protocol members mark student sign-in during an active service.

**Option A — With face embedding (server matches):**
```
POST http://localhost:8000/api/attendance/sign-in/
Authorization: Bearer <protocol_member_token>
Content-Type: application/json

{
    "service_id": "<service_uuid>",
    "face_embedding": [0.123, -0.456, ...],
    "device_id": "device-fingerprint-abc123",
    "gps_lat": 6.8921,
    "gps_lng": 3.7184
}
```

**Option B — With face image (server extracts + matches):**
```
POST http://localhost:8000/api/attendance/sign-in/
Authorization: Bearer <protocol_member_token>
Content-Type: multipart/form-data

service_id: <service_uuid>
face_image: (image file)
device_id: device-fingerprint-abc123
gps_lat: 6.8921
gps_lng: 3.7184
```

**Option C — With student_id (pre-matched offline):**
```
POST http://localhost:8000/api/attendance/sign-in/
Authorization: Bearer <protocol_member_token>
Content-Type: application/json

{
    "service_id": "<service_uuid>",
    "student_id": "<student_uuid>",
    "device_id": "device-fingerprint-abc123",
    "gps_lat": 6.8921,
    "gps_lng": 3.7184
}
```

**The system validates:**
1. ✅ Service is not cancelled
2. ✅ Current time is within the attendance window
3. ✅ GPS is within the geo-fence
4. ✅ Device is bound to the protocol member
5. ✅ Face matches a student in the service pool
6. ✅ Student hasn't already been marked (per-student lock)

---

## 13. Mark Attendance (Sign-Out)

Same as sign-in but updates the existing record.

```
POST http://localhost:8000/api/attendance/sign-out/
Authorization: Bearer <protocol_member_token>
Content-Type: application/json

{
    "service_id": "<service_uuid>",
    "student_id": "<student_uuid>",
    "device_id": "device-fingerprint-abc123",
    "gps_lat": 6.8921,
    "gps_lng": 3.7184
}
```

---

## 14. Offline Sync

When a protocol member was offline, they sync all queued records at once.

```
POST http://localhost:8000/api/attendance/sync/
Authorization: Bearer <protocol_member_token>
Content-Type: application/json

{
    "records": [
        {
            "student_id": "<student_uuid>",
            "service_id": "<service_uuid>",
            "attendance_type": "sign_in",
            "device_id": "device-fingerprint-abc123",
            "gps_lat": 6.8921,
            "gps_lng": 3.7184,
            "timestamp": "2025-10-01T17:05:00Z",
            "protocol_member_id": "<protocol_member_uuid>"
        },
        {
            "student_id": "<another_student_uuid>",
            "service_id": "<service_uuid>",
            "attendance_type": "sign_in",
            "device_id": "device-fingerprint-abc123",
            "gps_lat": 6.8921,
            "gps_lng": 3.7184,
            "timestamp": "2025-10-01T17:06:00Z",
            "protocol_member_id": "<protocol_member_uuid>"
        }
    ]
}
```

**Response — each record is validated independently:**
```json
{
    "message": "Sync complete. 2 accepted, 0 rejected.",
    "total": 2,
    "accepted": 2,
    "rejected": 0,
    "results": [
        {"index": 0, "status": "accepted", "student_name": "John Emmanuel"},
        {"index": 1, "status": "accepted", "student_name": "Jane Doe"}
    ]
}
```

---

## 15. Download Embeddings for Offline Mode

Before a service, protocol members download face embeddings for offline matching.

```
GET http://localhost:8000/api/attendance/embeddings/<service_uuid>/
Authorization: Bearer <protocol_member_token>
```

**Response:**
```json
{
    "service_id": "...",
    "student_count": 150,
    "embeddings": [
        {
            "student_id": "...",
            "student_name": "John Emmanuel",
            "embeddings": [[0.123, -0.456, ...], [0.789, ...]]
        }
    ]
}
```

---

## 16. View Attendance Reports

```
GET http://localhost:8000/api/reports/attendance/
Authorization: Bearer <token>
```

**Filter options:**
```
GET http://localhost:8000/api/reports/attendance/?service_group=S1
GET http://localhost:8000/api/reports/attendance/?below_threshold=true
GET http://localhost:8000/api/reports/attendance/?semester_id=<uuid>
```

**Response:**
```json
{
    "semester_name": "2025/2026 First Semester",
    "total_students": 500,
    "students_below_threshold": 23,
    "report": [
        {
            "student_name": "John Emmanuel",
            "matric_number": "MAT/2024/001",
            "service_group": "S1",
            "valid_count": 5,
            "total_required": 12,
            "percentage": 41.67,
            "below_threshold": true
        }
    ]
}
```

---

## 17. Export Reports (PDF / Excel)

**Download as PDF:**
```
GET http://localhost:8000/api/reports/export/pdf/
Authorization: Bearer <token>
```

**Download as Excel:**
```
GET http://localhost:8000/api/reports/export/excel/
Authorization: Bearer <token>
```

Both return file downloads. Open in browser or use a tool like Postman to save the file.

---

## 18. Manual Attendance Edit (Appeals)

Superadmin can edit attendance records (e.g., after a student appeal). Reason is mandatory.

```
PATCH http://localhost:8000/api/attendance/<record_uuid>/edit/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "is_valid": true,
    "reason_note": "Student appealed — was present but face match failed due to poor lighting."
}
```

---

## 19. Late Resumption Backdating

When a student resumes late, Superadmin can backdate their missed services.

```
POST http://localhost:8000/api/attendance/backdate/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "student_id": "<student_uuid>",
    "service_ids": [
        "<service_1_uuid>",
        "<service_2_uuid>",
        "<service_3_uuid>"
    ],
    "backdate_type": "excused",
    "reason_note": "Student resumed late due to medical leave. Documentation verified."
}
```

**backdate_type options:**
- `"valid"` — counts as attended (percentage goes up)
- `"excused"` — excluded from total required (percentage recalculated)

---

## 20. Resolve Duplicate Flags

When a student registration is flagged as a potential duplicate:

**Approve (clear the flag, activate the student):**
```
POST http://localhost:8000/api/admin/duplicates/resolve/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "student_id": "<student_uuid>",
    "action": "approve",
    "reason_note": "Verified — different students with similar names."
}
```

**Reject (delete the flagged registration):**
```
POST http://localhost:8000/api/admin/duplicates/resolve/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "student_id": "<student_uuid>",
    "action": "reject",
    "reason_note": "Confirmed duplicate registration."
}
```

**View all flagged students:**
```
GET http://localhost:8000/api/admin/students/?duplicate_flag=true
Authorization: Bearer <token>
```

---

## 21. Delete a Student

Hard delete — removes student, face samples, and attendance records permanently.

```
DELETE http://localhost:8000/api/admin/students/<student_uuid>/delete/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "reason": "Expelled from university."
}
```

---

## 22. Generate Matric Update Link

When a new student gets their official matric number:

**Step 1 — Superadmin generates a secure token:**
```
POST http://localhost:8000/api/admin/matric-update-link/<student_uuid>/
Authorization: Bearer <superadmin_token>
```

**Response:**
```json
{
    "token": "abc123...(long signed token)",
    "student_name": "Jane Doe",
    "system_id": "CHP-A1B2C3D4",
    "expires_in_hours": 48,
    "message": "Share this token with the student."
}
```

---

## 23. Student Updates Matric Number

**Step 2 — Student uses the token to update:**
```
PATCH http://localhost:8000/api/registration/update-matric/
Content-Type: application/json

{
    "token": "abc123...(the token from Step 1)",
    "system_id": "CHP-A1B2C3D4",
    "matric_number": "MAT/2025/001"
}
```

---

## 24. Cancel a Service

Cancelled services are excluded from attendance percentage calculations.

```
DELETE http://localhost:8000/api/services/<service_uuid>/cancel/
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
    "reason": "Public holiday — service not held."
}
```

---

## 25. View Audit Logs

Every action in the system is logged. Superadmin only.

```
GET http://localhost:8000/api/audit/logs/
Authorization: Bearer <superadmin_token>
```

**Filter options:**
```
GET http://localhost:8000/api/audit/logs/?action_type=STUDENT_DELETED
GET http://localhost:8000/api/audit/logs/?target_type=Student
GET http://localhost:8000/api/audit/logs/?actor_id=<user_uuid>
GET http://localhost:8000/api/audit/logs/?date_from=2025-10-01
GET http://localhost:8000/api/audit/logs/?search=medical
```

---

## 26. All API Endpoints Reference

| Method | Endpoint | Who Can Use It |
|--------|----------|---------------|
| **AUTH** | | |
| POST | `/api/auth/login/` | Anyone |
| POST | `/api/auth/logout/` | Logged in users |
| GET/POST | `/api/auth/users/` | Superadmin |
| GET/PATCH/DELETE | `/api/auth/users/{id}/` | Superadmin |
| POST | `/api/auth/bind-device/` | Superadmin |
| **REGISTRATION** | | |
| GET | `/api/registration/status/` | Anyone |
| POST | `/api/registration/student/` | Anyone (when open) / Admin |
| POST | `/api/registration/face-sample/` | Anyone |
| GET | `/api/registration/face-status/` | Anyone |
| PATCH | `/api/registration/update-matric/` | Anyone (with valid token) |
| **ADMIN** | | |
| PATCH | `/api/admin/registration/open/` | Superadmin |
| GET | `/api/admin/students/` | Admin / Superadmin |
| GET/PATCH | `/api/admin/students/{id}/` | Admin / Superadmin |
| DELETE | `/api/admin/students/{id}/delete/` | Superadmin |
| POST | `/api/admin/duplicates/resolve/` | Superadmin |
| POST | `/api/admin/matric-update-link/{id}/` | Superadmin |
| **SERVICES** | | |
| GET/POST | `/api/services/` | Admin+ / Superadmin |
| GET/PATCH | `/api/services/{id}/` | Superadmin |
| DELETE | `/api/services/{id}/cancel/` | Superadmin |
| GET/POST | `/api/services/semesters/` | Admin+ / Superadmin |
| GET/PATCH | `/api/services/semesters/{id}/` | Superadmin |
| GET/PATCH | `/api/geo-fence/` | Admin+ / Superadmin |
| **ATTENDANCE** | | |
| POST | `/api/attendance/sign-in/` | Protocol Member |
| POST | `/api/attendance/sign-out/` | Protocol Member |
| POST | `/api/attendance/sync/` | Protocol Member |
| GET | `/api/attendance/embeddings/{service_id}/` | Protocol Member |
| GET | `/api/attendance/service/{service_id}/` | Admin+ |
| PATCH | `/api/attendance/{id}/edit/` | Superadmin |
| POST | `/api/attendance/backdate/` | Superadmin |
| **REPORTS** | | |
| GET | `/api/reports/attendance/` | Admin / Superadmin |
| GET | `/api/reports/export/pdf/` | Admin / Superadmin |
| GET | `/api/reports/export/excel/` | Admin / Superadmin |
| **AUDIT** | | |
| GET | `/api/audit/logs/` | Superadmin |

---

## Quick Start Checklist

1. ✅ Activate venv: `.\venv\Scripts\Activate.ps1`
2. ✅ Start server: `python manage.py runserver`
3. ✅ Create superadmin: `python manage.py create_superadmin`
4. ✅ Login → get token
5. ✅ Create a semester
6. ✅ Open registration
7. ✅ Create services for the semester
8. ✅ Set up geo-fence
9. ✅ Create protocol member accounts
10. ✅ Bind devices to protocol members
11. ✅ Students register and upload face samples
12. ✅ Protocol members mark attendance during services
13. ✅ View reports and export

---

## Credentials

| Account | Email | Password |
|---------|-------|----------|
| Superadmin | admin@chapel.edu | Chapel2026! |

## Database

| Setting | Value |
|---------|-------|
| Database | chapel_attendance |
| User | postgres |
| Password | deji |
| Host | localhost |
| Port | 5432 |
