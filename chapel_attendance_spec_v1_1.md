Chapel Attendance Management System  |  Technical Specification  v1.1**    CONFIDENTIAL**

**CHAPEL ATTENDANCE**

**MANAGEMENT SYSTEM**

**FULL TECHNICAL SPECIFICATION**

Frontend · Backend · Database · Facial Recognition · Offline Sync

| **Version** | 1.1 — Revised |
| --- | --- |
| **Status** | Ready for Development Handoff |
| **Phase** | Phase 1 — Core System |
| **Stack** | Next.js · Django · PostgreSQL · DeepFace |

| **VERSION CHANGELOG** |
| --- |

# **Version History**

| **Version** | **Changes** |
| --- | --- |
| v1.0 | Initial specification covering all core Phase 1 modules. |
| v1.1 | Added: service cap per sub-service, Protocol Admin vs Protocol Member role separation, live attendance monitor, offline face matching via cached embeddings, auto-opening attendance window, fuzzy + phone + name duplicate detection, auto-capitalization on name fields, student add/delete by admin, late resumption backdating, retry on face match failure, secured matric update flow, PWA+web clarification, Superadmin can view student profiles. |

| **SECTION 1 — PROJECT OVERVIEW** |
| --- |

# **1. Project Overview**

## **1.1 Background**

A private university chapel currently manages student attendance using a paper-based system. This approach is error-prone, time-consuming, and vulnerable to fraud — students can mark attendance on behalf of absent peers. The chapel holds two service types per week (midweek and Sunday), each split into three sub-services due to venue capacity constraints. All assignment, tracking, and reporting is done manually.

## **1.2 Objective**

Build a digital Chapel Attendance Management System that:

- Eliminates manual processes and paper records

- Prevents attendance fraud using server-side facial recognition with liveness detection

- Automatically assigns students to services within configurable per-service capacity caps

- Provides administrators with real-time live monitoring, reporting, and full audit trails

- Works offline for protocol members with local face matching and auto-syncs when back online

## **1.3 Success Criteria**

- Students cannot mark attendance on behalf of others

- Protocol members can only mark attendance within authorized geo-fence and time window

- Attendance percentage is calculated accurately in real-time per student per semester

- Any student below 70% cut-off is flagged and blocked from exams

- All admin actions are traceable via audit logs

- Duplicate registrations are detected via fuzzy name matching, phone number, and matric number checks

## **1.4 Deployment**

The system is a Progressive Web App (PWA). A PWA is a standard web application — it runs in any browser and can also be installed on a phone like a native app. There is one codebase that serves both browser users and installed mobile users with no separate app store submission required.

## **1.5 Technology Stack**

| **Layer** | **Technology** | **Rationale** |
| --- | --- | --- |
| Frontend (PWA + Web) | Next.js | SSR, scalable, best AI agent support, clean PWA integration, works in browser and installable on mobile |
| Backend | Django + Django REST Framework | Python-native, pairs seamlessly with DeepFace |
| Database | PostgreSQL | Relational integrity, strong for audit logs and reports |
| Facial Recognition | DeepFace (self-hosted) | Free, Python-native, no external API dependency |
| Offline Sync | IndexedDB + Service Workers | Browser-native PWA offline capability |
| Offline Face Matching | Cached face embeddings on device | Enables local 1-to-N matching when server is unreachable |
| File Storage | Hostinger VPS local storage | Controlled environment, no third-party cost |
| Hosting | Hostinger VPS | Client-managed infrastructure |

| **SECTION 2 — SYSTEM ARCHITECTURE** |
| --- |

# **2. System Architecture**

## **2.1 Module Overview**

| **Module** | **Description** | **Phase** |
| --- | --- | --- |
| Identity & Authentication | Admin login, role-based access, device binding for protocol members | 1 |
| Student Registration | Self-registration + admin-assisted, face capture, duplicate detection, service auto-assignment | 1 |
| Service Management | Semester setup, service schedules, geo-fence, auto time windows | 1 |
| Attendance Engine | Face matching (1-to-N scoped), liveness detection, sign-in/out, per-student lock | 1 |
| Live Attendance Monitor | Real-time dashboard: who signed in, time, device, flags/errors | 1 |
| Offline Sync | Cached embeddings for offline matching, encrypted records, backend conflict resolution | 1 |
| Appeals & Exceptions | Manual Superadmin override, late resumption backdating, mandatory audit note | 1 |
| Reporting & Analytics | Filtered reports, PDF/Excel export, real-time % recalculation | 1 |
| Archiving | Semester-end auto or manual archive, access-controlled history | 1 |
| Audit System | Every action logged: who, when, device, location | 1 |
| Student Portal | Attendance progress, church events, sermon downloads | 2 |
| Notifications | WhatsApp reminders, 70% cut-off warnings | 2 |
| Content/Media Admin | Sermon uploads, event management | 2 |

## **2.2 Data Flow — Registration**

- Student opens PWA in browser or installed app and selects Old or New Student

- Student fills in registration form (name auto-capitalized). System runs duplicate detection on name (fuzzy match), phone number, and matric number simultaneously

- If a potential duplicate is detected, registration is flagged and held for Superadmin review

- Student uploads profile photo and completes face capture (up to 5 samples, min 3 approved to activate)

- System auto-assigns student to a service (S1, S2, or S3) randomly, respecting per-service cap

- Registration record is stored with system-generated ID (new student) or matric number (old student)

## **2.3 Data Flow — Attendance**

- Attendance window opens automatically at the time and day configured by Superadmin — no manual activation needed

- Before service starts (while online), protocol member device downloads face embeddings for that service's student pool

- Student queues; protocol member points phone camera at student

- System issues random liveness challenge to student

- On liveness pass, 1-to-N face match runs against the active service pool (local if offline, server if online)

- On successful match, system checks per-student lock — if not locked, marks sign-in and sets lock

- Attendance record is written with: student ID, protocol member ID, service ID, timestamp, device ID, GPS coordinates

- At service end, sign-out phase runs (if sign-out is configured for this service)

- If device was offline during any part of the session, queued records sync to server on reconnection

| **SECTION 3 — USER ROLES ****&**** PERMISSIONS** |
| --- |

# **3. User Roles ****&**** Permissions**

## **3.1 Role Hierarchy**

There are five distinct roles in the system. All roles below Superadmin are created by and subject to the Superadmin.

| **Role** | **Created By** | **Summary** |
| --- | --- | --- |
| Superadmin | Developer (seeded at deployment) | Unrestricted access to all system functions. Cannot be created via UI. |
| Admin | Superadmin | Student and record management. Permissions explicitly granted by Superadmin. |
| Protocol Admin | Superadmin | Monitoring role. Views live attendance dashboard. Cannot mark attendance. |
| Protocol Member | Superadmin | Field role. Uses bound device to physically mark student attendance. |
| Content/Media Admin | Superadmin | Manages sermons and events. Phase 2 only. |

| **Protocol Admin vs Protocol Member** These are two distinct roles. A Protocol Member is the person in the chapel queue physically scanning student faces to mark attendance. A Protocol Admin is a monitoring role — they watch the live attendance dashboard to see who is being signed in, what device is being used, what time, and whether any errors or flags have occurred. Protocol Admins do not mark attendance. |
| --- |

## **3.2 Superadmin Capabilities**

The Superadmin has unrestricted access to all system functions:

- Create, edit, delete all admin accounts (Admin, Protocol Admin, Protocol Member, Content/Media Admin)

- Grant or revoke specific privileges to Admin accounts

- Open and close student registration windows

- Add students manually (full registration flow applies)

- Delete students (hard delete — all records removed, action logged in audit trail)

- View all student profiles and attendance records

- Manually override any attendance record (with mandatory reason note)

- Authorize student appeals and edit attendance records

- Handle late resumption: backdate attendance as Valid or Excused per case

- Configure service schedules, time windows (auto-open), and geo-fence parameters

- Set and adjust per-service student capacity caps

- Add, edit, or cancel services at any time during the semester

- Manage device bindings for protocol members (add, edit, delete, emergency rebind)

- Generate and export reports (filtered by week, service, semester)

- Monitor live attendance dashboard in real-time

- Trigger semester archiving manually or allow automatic archiving

- View all archived semester records

- Resolve duplicate registration flags

- Generate secure matric number update links for new students

## **3.3 Admin Capabilities**

Admins receive only the permissions explicitly granted by Superadmin. Possible permissions include:

- View student profiles and attendance records (if granted)

- Add students manually — full registration flow applies (if granted)

- Edit student profiles (if granted)

- View reports and analytics (if granted)

- View archived records (if granted)

- Change student service assignment (if granted)

## **3.4 Protocol Admin Capabilities**

- View live attendance monitor dashboard for active services

- See real-time feed: which student was signed in/out, by which protocol member, on which device, at what time

- See error flags and anomaly alerts on the live monitor

- Cannot mark attendance, edit records, or access any other admin feature

- Access granted and scoped by Superadmin

## **3.5 Protocol Member Capabilities**

- Log in exclusively on their registered bound device

- Mark student sign-in and sign-out for their assigned active service

- Access offline attendance mode when connectivity is unavailable (face embeddings cached on device)

- Cannot access monitoring, reporting, or any other admin feature

## **3.6 Superadmin Bootstrap**

| **Important — Initial Superadmin Creation** The Superadmin account cannot be created through the application UI. It must be seeded directly into the database by the developer at deployment time via a secure Django management command (manage.py create_superadmin). After seeding, all other accounts are created through the application by the Superadmin. |
| --- |

| **SECTION 4 — STUDENT REGISTRATION** |
| --- |

# **4. Student Registration**

## **4.1 Registration Window**

- Superadmin opens and closes the registration window from the dashboard

- While closed, the registration form is inaccessible to students

- Superadmin can reopen registration at any time (e.g., for late enrollees or admin-added students)

- Face re-registration is required every semester as part of the registration flow — face data does not carry over between semesters

- If a student begins face capture and registration closes mid-session, the partial data is wiped — they restart when registration reopens

## **4.2 Who Can Register Students**

- Students can self-register when the registration window is open

- Superadmin can manually add a student at any time (registration window does not need to be open)

- Admin can manually add a student if that permission has been granted by Superadmin

- When admin or Superadmin adds a student, the full registration flow applies: form fields, duplicate checks, face capture, service assignment

## **4.3 Student Types**

| **Student Type** | **Description** |
| --- | --- |
| Old Student | Has an existing matric number. Enters matric number during registration. System checks for exact and fuzzy duplicates. |
| New Student | No matric number yet. System generates a unique ID. When matric number is later assigned, Superadmin generates a secure time-limited update link for the student. |

## **4.4 Registration Form Fields**

| **Field** | **Type** | **Notes** |
| --- | --- | --- |
| Student Type | Radio (Old / New) | Determines whether matric field appears |
| Full Name | Text | Required. Auto-capitalized on input and on save to prevent name-variation duplicates. |
| Phone Number | Text | Required. Checked for exact duplicates on submission. |
| Matric Number | Text | Required for Old Students only. Hidden for New Students. Checked for exact duplicates. |
| Department | Text | Required |
| Level | Dropdown | Options: 100, 200, 300, 400 |
| Gender | Dropdown | Male / Female |
| Profile Photo | Image Upload | Separate from face recognition samples. Used for profile display only. |

## **4.5 Duplicate Detection**

The system runs three parallel duplicate checks on every registration submission:

| **Check** | **Method** | **Action on Detection** |
| --- | --- | --- |
| Matric Number | Exact match | Flag as duplicate. Hold registration. Superadmin resolves. |
| Phone Number | Exact match | Flag as duplicate. Hold registration. Superadmin resolves. |
| Full Name | Fuzzy match (similarity threshold) | Flag as potential duplicate for Superadmin review. Not auto-rejected — similar names may be legitimate. |

- Auto-capitalization is applied to all name fields before the duplicate check runs, preventing tricks like 'john doe' vs 'John Doe' vs 'JOHN DOE'

- Fuzzy name matching catches rearrangements like 'John Emmanuel' vs 'Emmanuel John' and typos like 'Jonhn Emmanuel'

- All duplicate flags appear in the Superadmin dashboard for manual resolution

- A flagged registration is not activated until the Superadmin clears or resolves the flag

## **4.6 Service Auto-Assignment**

- Midweek services (S1, S2, S3) and Sunday services (S1, S2, S3) are grouped — a student assigned to S1 attends Midweek S1 AND Sunday S1

- Assignment is random to prevent students from predicting or gaming their service group

- Each service has a Superadmin-configurable student capacity cap (e.g., 500 students per service)

- The system assigns students to the service group with available capacity — if S1 and S2 are full, all new registrations go to S3

- If all services are at capacity, registration is blocked and Superadmin is notified

- Superadmin (or permitted Admin) can manually reassign a student to a different service group

## **4.7 Matric Number Update (New Students)**

- When a new student receives their official matric number, the Superadmin generates a secure, time-limited update link from the dashboard

- The student must provide their system-generated ID AND click the secure link to access the update form — dual verification required

- The time-limited link expires after a configurable window to prevent stale or shared links being misused

- On successful update, the matric number is saved, the system ID is retained as a reference, and the action is logged in the audit trail

- If the entered matric number matches an existing record, the update is blocked and flagged for Superadmin resolution

## **4.8 Student Deletion**

- Superadmin can hard-delete a student record at any time

- Hard delete removes: student profile, face samples, attendance records, and service assignment for that student

- The deletion action itself is logged in the audit trail (who deleted, when, student ID)

- Deleted students' data cannot be recovered — this action is irreversible

- Superadmin should confirm intent before deletion (confirmation dialog in UI)

## **4.9 Late Resumption Handling**

- When a student resumes late in the semester due to a valid reason, Superadmin can backdate their attendance for the missed services

- Superadmin chooses per case whether to mark missed services as Valid (counts toward attendance %) or Excused (excluded from total required services)

- Valid: the missed services are counted as attended — student's percentage increases retroactively

- Excused: the missed services are removed from the student's total required count — percentage is calculated from resumption date onward

- A mandatory reason note must be entered for all late resumption backdating actions

- The backdating action is fully logged in the audit trail

| **SECTION 5 — FACIAL RECOGNITION** |
| --- |

# **5. Facial Recognition**

## **5.1 Face Registration**

- Face registration is part of the semester registration flow — completed by the student using their own phone camera

- The system captures up to 5 face samples per student

- A minimum of 3 approved samples are required to activate the student account

- If fewer than 3 samples are approved, registration remains incomplete until resolved

- Admin or Superadmin can assist a student whose phone camera produces consistently poor-quality captures

## **5.2 Auto-Rejection Rules**

Each capture is evaluated automatically. A capture is rejected and the student is shown the specific reason:

| **Rejection Reason** | **User Feedback Shown** |
| --- | --- |
| No face detected in frame | "No face detected. Position your face in the center of the frame." |
| Face too small (too far from camera) | "Move closer to the camera." |
| Image too dark or too blurry | "Poor lighting or image quality. Move to a brighter area and hold the phone steady." |
| Multiple faces in frame | "Multiple faces detected. Ensure only your face is visible." |
| Eyes closed during capture | "Please keep your eyes open during capture." |

On rejection, the student sees the reason and is prompted to retry. Capturing continues until 5 approved samples are collected or the student stops with at least 3 already approved.

## **5.3 Liveness Detection**

- A liveness challenge is issued once per student per sign-in attempt before face matching proceeds

- The challenge is randomly assigned per person — Student A may get blink, Student B may get smile

- Challenge pool: Blink, Smile, Turn head left, Turn head right, Nod

- Only one challenge is issued per attempt to keep queues moving

- Retry is allowed on both liveness failure AND face match failure

## **5.4 Face Matching at Attendance (1-to-N Scoped)**

- When a service is active, the face matching pool is scoped exclusively to students assigned to that service

- For special services, the matching pool includes all registered students for the current semester

- A student from Service S1 cannot be matched during an S2 or S3 session

- This scoping improves matching speed and reduces false positive risk significantly

## **5.5 Per-Student Lock**

- Once a student is successfully marked for a service instance, a per-student lock is applied

- Any subsequent scan of the same student returns: "Already marked for this service."

- This prevents duplicate marking even when multiple protocol members scan simultaneously

- The lock resets for the next service instance

## **5.6 Offline Face Matching**

| **Offline Matching — How It Works** DeepFace runs server-side. When a protocol member's device is offline, there is no server to send captures to. To handle this, the protocol member device downloads and caches the face embeddings (numerical vectors, not photos) for the active service's student pool before the service begins. If the device goes offline mid-service, face matching runs locally against the cached embeddings. Raw face photos never leave the server. Cached embeddings are encrypted on the device and are wiped automatically after a successful sync. |
| --- |

- Embeddings are downloaded at session start while the device is online

- Local matching uses the same DeepFace model — results are consistent with server-side matching

- Offline records are queued with timestamp, GPS, device ID, and encrypted payload

- On reconnection, all queued records sync to the server for conflict resolution and final validation

- Cached embeddings are deleted from the device after sync confirmation

## **5.7 Face Data Lifecycle**

- Face data is semester-scoped — it is NOT carried over between semesters

- Students re-register their face as part of each new semester's registration flow

- Face samples are stored server-side in a secured directory: /media/face_samples/{semester_id}/{student_id}/

- Face data is deleted when semester archiving is triggered

| **SECTION 6 — SERVICE MANAGEMENT** |
| --- |

# **6. Service Management**

## **6.1 Service Types**

| **Service Type** | **Sub-Services** | **Schedule Example** |
| --- | --- | --- |
| Midweek | S1, S2, S3 | Wednesday (S1), Thursday (S2), Friday (S3) |
| Sunday | S1, S2, S3 | 7:00 AM (S1), 9:00 AM (S2), 11:00 AM (S3) |
| Special (All-Student) | None — all students attend regardless of assigned group | Conferences, revivals, special events |

## **6.2 Semester Setup by Superadmin**

- Superadmin configures the semester schedule at the start of each semester

- For each month, Superadmin specifies: number of midweek services, number of Sunday services, service dates and times, and whether any special services occur

- Superadmin sets a student capacity cap per service group (e.g., max 500 students per S1, S2, S3) — configurable and adjustable

- Superadmin can add, edit, or cancel services at any point during the semester

- If a service is cancelled (e.g., public holiday), Superadmin removes it — it is excluded from the total required count and does not count against students

- All student attendance percentages recalculate automatically in real-time whenever a service is added, edited, or removed

## **6.3 Automatic Attendance Window**

| **Auto-Open Behaviour** Attendance windows open and close automatically based on the date and time configured by Superadmin for each service. Protocol members do not need to wait for manual activation. Superadmin can still manually close a window early or extend it in exceptional circumstances. |
| --- |

- Each service has a configured start time and end time for the attendance window

- The system opens the window at the configured time — protocol members can begin marking immediately

- The system closes the window at the configured end time — no further marking is accepted

- Superadmin can manually override (close early or extend) at any time

## **6.4 Geo-Fence Configuration**

- Superadmin sets chapel GPS coordinates and a radius (in metres) from the admin dashboard

- All attendance marking by protocol members must occur within the configured geo-fence

- Attempts to mark outside the geo-fence are rejected

- Superadmin can update coordinates and radius (e.g., for overflow venues or venue changes)

- GPS snapshot is recorded with every attendance record for audit purposes

## **6.5 Sign-Out Configuration**

- Sign-out is configurable per service by Superadmin

- Sign-out DISABLED: sign-in alone counts as valid attendance

- Sign-out ENABLED: both sign-in AND sign-out are required — a sign-in without a corresponding sign-out is flagged as incomplete and does not count

- Special services: sign-out is disabled by default; Superadmin decides per event

## **6.6 Special Services**

- All-student events — every registered student is expected to attend regardless of their assigned service group

- Face matching pool for special services includes all registered students for the current semester

- Special services count toward the total required services in the attendance percentage calculation

- Superadmin configures sign-out requirement per special service

| **SECTION 7 — ATTENDANCE ENGINE** |
| --- |

# **7. Attendance Engine**

## **7.1 Protocol Member Device Binding**

- Each protocol member account is bound to a specific device identified by device fingerprint/ID

- Attendance marking is only accepted from the registered bound device

- Superadmin manages all bindings: add, edit, delete, or perform emergency rebind

- Emergency rebind: if a protocol member's primary device is unavailable on service day, Superadmin can temporarily bind an alternate device

- All binding changes are logged in the audit trail

## **7.2 Attendance Marking Flow**

- Attendance window opens automatically at the configured time

- Protocol member logs in on their bound device; system verifies device binding, geo-fence, and time window

- While online, device downloads and caches face embeddings for the active service's student pool

- Protocol member points camera at student

- System issues random liveness challenge — student responds

- On liveness pass, 1-to-N face match runs (local if offline, server if online) against the active service pool

- On successful match, system checks per-student lock — if not locked, marks sign-in and sets lock

- Record created: student ID, protocol member ID, service ID, timestamp, device ID, GPS coordinates

- At service end, sign-out phase runs if configured — same face match process marks sign-out

- If any records were captured offline, they sync to server on reconnection and undergo backend validation

## **7.3 Attendance Validity Rules**

| **Validity Rule** Sign-out DISABLED for service: Attendance is valid on sign-in alone. Sign-out ENABLED for service: BOTH sign-in AND sign-out are required. A sign-in with no corresponding sign-out is flagged as incomplete and does not count toward the student's attendance percentage. |
| --- |

## **7.4 Attendance Percentage Calculation**

Formula:  Attendance % = (Valid Attendances / Total Required Services) x 100

- Total Required Services = all services configured for the semester minus any cancelled services

- The 70% figure is a cut-off threshold — students below 70% are ineligible for exams

- Percentages recalculate automatically in real-time when services are added, removed, or modified

- Late resumption backdating (Valid or Excused) triggers an immediate recalculation for the affected student

## **7.5 Student Service Restriction**

- Students can only be matched and marked during the service group they are assigned to

- A student assigned to S1 cannot be marked during an S2 or S3 session — the matching pool enforces this automatically

- Exception: special services — all students are in the matching pool regardless of service group

| **SECTION 8 — LIVE ATTENDANCE MONITOR** |
| --- |

# **8. Live Attendance Monitor**

## **8.1 Overview**

The live attendance monitor is a real-time dashboard available to Superadmin and Protocol Admins. It provides visibility into attendance marking as it happens during an active service, without granting any ability to modify records.

## **8.2 What the Monitor Displays**

- Live feed of each sign-in and sign-out event as it occurs

- For each event: student name and ID, protocol member who marked it, device used, timestamp, and GPS indicator

- Running count: total signed in, total signed out, total assigned to service

- Error and anomaly flags, including: failed liveness attempts, face match failures, out-of-window attempts, out-of-geo-fence rejections, duplicate marking attempts

- Visual indicator for students who were marked offline (pending sync confirmation)

## **8.3 Access**

- Superadmin: always has access to the live monitor for all services

- Protocol Admin: access granted by Superadmin; may be scoped to specific services

- Protocol Member: no access to the monitor

| **SECTION 9 — OFFLINE MODE ****&**** SYNC** |
| --- |

# **9. Offline Mode ****&**** Sync**

## **9.1 Scope**

| **Offline Mode is Exclusively for Protocol Member Devices** The student-facing registration app does not support offline mode. Only the protocol member PWA has offline attendance capability, implemented using IndexedDB for local storage, Service Workers for background sync, and cached face embeddings for local matching. |
| --- |

## **9.2 What Is Stored Offline**

- Student ID (from local face match result)

- Service ID

- Attendance type (sign-in or sign-out)

- Device timestamp (with pre-calculated server time offset applied before going offline)

- Device ID

- GPS coordinates snapshot at time of capture

- Encrypted record payload

- Protocol member ID

## **9.3 Sync Validation**

On reconnection, the background sync submits all queued records. The backend validates each record individually:

| **Validation Check** | **Action on Failure** |
| --- | --- |
| Timestamp within valid service time window? | Record rejected. Logged as out-of-window attempt. |
| GPS within authorized geo-fence at time of capture? | Record rejected. Logged as out-of-zone attempt. |
| Duplicate — student already marked for this service? | Record rejected. "Already marked" returned. |
| Device ID authorized and bound to an active protocol member? | Record rejected. Logged as unauthorized device attempt. |

- Valid records are committed to the database

- Rejected records are logged in the audit trail with the rejection reason

- Protocol member device receives a sync result summary

- Cached face embeddings are deleted from the device after sync confirmation

| **SECTION 10 — ADMIN DASHBOARD** |
| --- |

# **10. Admin Dashboard**

## **10.1 Superadmin Dashboard Views**

- Overview: total students, active semester, services this week, flagged students below 70%, pending duplicate flags

- Student management: list, search, view profiles, edit, add, delete students

- Duplicate flags queue: pending registrations flagged for name, phone, or matric conflicts

- Service management: semester calendar, add/edit/cancel services, set capacity caps

- Protocol member management: accounts, device bindings, emergency rebind

- Registration control: open/close registration, view pending/duplicate flags

- Late resumption management: backdate missed services per student with reason note

- Reports: filtered by week, service, or semester — export as PDF or Excel/CSV

- Appeals / manual edits: edit attendance records with mandatory reason field

- Audit log viewer: searchable, filterable log of all system actions

- Geo-fence settings: GPS coordinates and radius

- Archive management: trigger archiving, view past semester records

## **10.2 Reports ****&**** Exports**

- Reports can be filtered by: specific week, specific service, full semester

- Each report shows: student name, ID, service assignment, attendance count, total required services, percentage

- Students below 70% are visually flagged in reports

- Export formats: PDF (printable, shareable) and Excel/CSV (for further analysis)

- Exported reports reflect real-time data at the time of export

## **10.3 Appeals ****&**** Manual Edits**

- Appeal process is physical — student presents their case directly to Superadmin

- If approved, Superadmin edits the attendance record in the dashboard

- A mandatory reason/note field must be completed before saving any manual edit

- Edit is logged in the audit trail: who, when, what changed, stated reason

## **10.4 Audit Log**

| **Action Type** | **Fields Logged** |
| --- | --- |
| Attendance marked | Student ID, Protocol member ID, Device ID, Service ID, GPS, Timestamp, Type |
| Manual attendance edit / appeal | Admin ID, Student ID, Previous value, New value, Reason note, Timestamp |
| Late resumption backdating | Admin ID, Student ID, Services affected, Type (Valid/Excused), Reason note, Timestamp |
| Student added manually | Admin ID, Student ID, Timestamp |
| Student deleted | Admin ID, Deleted student ID, Timestamp |
| Device binding change | Admin ID, Protocol member ID, Old device, New device, Timestamp |
| Registration opened/closed | Admin ID, Action, Timestamp |
| Duplicate flag resolved | Admin ID, Flag details, Resolution action, Timestamp |
| Service added/edited/cancelled | Admin ID, Service details, Action type, Timestamp |
| Semester archived | Admin ID, Semester ID, Trigger type (auto/manual), Timestamp |
| Admin account created/modified | Superadmin ID, Target account, Changes made, Timestamp |
| Matric number updated | Student ID, Old ID, New matric number, Timestamp |

| **SECTION 11 — DATA MODELS** |
| --- |

# **11. Database Schema**

## **11.1 Students Table**

| **Field** | **Type** | **Notes** |
| --- | --- | --- |
| id | UUID (PK) | System-generated unique identifier |
| student_type | ENUM (old, new) | Determines matric vs system ID |
| matric_number | VARCHAR | Nullable. Required for old students. Unique constraint. |
| system_id | VARCHAR | Auto-generated for new students. Retained after matric update. |
| full_name | VARCHAR | Stored in auto-capitalized form |
| full_name_normalized | VARCHAR | Lowercase, stripped for fuzzy matching |
| phone_number | VARCHAR | Required. Unique constraint. |
| department | VARCHAR | Required |
| level | ENUM (100,200,300,400) | Required |
| gender | ENUM (male, female) | Required |
| profile_photo_url | VARCHAR | Path to uploaded profile image |
| face_registered | BOOLEAN | True when min 3 face samples approved |
| service_group | ENUM (S1, S2, S3) | Assigned service group |
| semester_id | FK → Semester | Current semester |
| is_active | BOOLEAN | False until face registration complete and no duplicate flags |
| duplicate_flag | BOOLEAN | True if flagged pending Superadmin review |
| created_at | TIMESTAMP |  |
| created_by | FK → AdminUsers | Nullable. Set when added manually by admin. |

## **11.2 FaceSamples Table**

| **Field** | **Type** | **Notes** |
| --- | --- | --- |
| id | UUID (PK) |  |
| student_id | FK → Students |  |
| sample_url | VARCHAR | Stored file path — not publicly served |
| embedding_vector | JSONB / ARRAY | DeepFace numerical embedding stored for matching |
| status | ENUM (approved, rejected) | Auto-evaluated on capture |
| rejection_reason | VARCHAR | Nullable. Set when status = rejected |
| semester_id | FK → Semester | Scoped to semester — deleted on archive |
| created_at | TIMESTAMP |  |

## **11.3 Services Table**

| **Field** | **Type** | **Notes** |
| --- | --- | --- |
| id | UUID (PK) |  |
| semester_id | FK → Semester |  |
| service_type | ENUM (midweek, sunday, special) |  |
| service_group | ENUM (S1, S2, S3, all) | "all" for special services |
| scheduled_date | DATE |  |
| window_open_time | DATETIME | Auto-opens attendance window at this time |
| window_close_time | DATETIME | Auto-closes attendance window at this time |
| signout_required | BOOLEAN | Controls validity rule |
| capacity_cap | INTEGER | Max students per service group — set by Superadmin |
| is_cancelled | BOOLEAN | If true, excluded from total count |
| created_at | TIMESTAMP |  |

## **11.4 AttendanceRecords Table**

| **Field** | **Type** | **Notes** |
| --- | --- | --- |
| id | UUID (PK) |  |
| student_id | FK → Students |  |
| service_id | FK → Services |  |
| protocol_member_id | FK → AdminUsers |  |
| device_id | VARCHAR | Bound device identifier |
| gps_lat | DECIMAL | Captured at time of marking |
| gps_lng | DECIMAL | Captured at time of marking |
| signed_in_at | TIMESTAMP |  |
| signed_out_at | TIMESTAMP | Nullable |
| is_valid | BOOLEAN | Computed based on signout_required rule |
| is_offline_record | BOOLEAN | True if synced from offline queue |
| is_backdated | BOOLEAN | True if set via late resumption |
| backdate_type | ENUM (valid, excused) | Nullable. Set for backdated records. |
| sync_validation_result | VARCHAR | Result of offline sync validation |
| created_at | TIMESTAMP |  |

## **11.5 AuditLogs Table**

| **Field** | **Type** | **Notes** |
| --- | --- | --- |
| id | UUID (PK) |  |
| actor_id | FK → AdminUsers | Who performed the action |
| action_type | VARCHAR | e.g., ATTENDANCE_EDIT, DEVICE_REBIND, STUDENT_DELETE |
| target_type | VARCHAR | e.g., Student, Service, ProtocolMember |
| target_id | UUID | ID of the affected record |
| previous_value | JSONB | Nullable. Snapshot before change. |
| new_value | JSONB | Nullable. Snapshot after change. |
| reason_note | TEXT | Mandatory for manual edits and backdating |
| device_id | VARCHAR | Device used for the action |
| gps_lat | DECIMAL | Nullable |
| gps_lng | DECIMAL | Nullable |
| created_at | TIMESTAMP | Append-only — no record can be deleted via UI |

| **SECTION 12 — API CONTRACTS** |
| --- |

# **12. Key API Endpoints**

## **12.1 Authentication**

| **Method** | **Endpoint** | **Description** | **Auth** |
| --- | --- | --- | --- |
| POST | /api/auth/login/ | Admin / Protocol member login | None |
| POST | /api/auth/logout/ | Logout and invalidate session | Required |
| POST | /api/auth/bind-device/ | Bind device to protocol member | Superadmin |

## **12.2 Registration**

| **Method** | **Endpoint** | **Description** | **Auth** |
| --- | --- | --- | --- |
| GET | /api/registration/status/ | Check if registration is open | None |
| POST | /api/registration/student/ | Submit student registration (self or admin) | None / Admin+ |
| POST | /api/registration/face-sample/ | Upload a single face sample | Student token |
| GET | /api/registration/face-status/ | Check approved sample count | Student token |
| PATCH | /api/admin/registration/open/ | Open or close registration window | Superadmin |
| DELETE | /api/admin/students/{id}/ | Hard delete a student | Superadmin |
| POST | /api/admin/matric-update-link/{id}/ | Generate secure matric update link | Superadmin |
| PATCH | /api/registration/update-matric/ | Student updates matric via secure link | Secure token |

## **12.3 Attendance**

| **Method** | **Endpoint** | **Description** | **Auth** |
| --- | --- | --- | --- |
| POST | /api/attendance/sign-in/ | Mark student sign-in | Protocol Member |
| POST | /api/attendance/sign-out/ | Mark student sign-out | Protocol Member |
| POST | /api/attendance/sync/ | Sync offline attendance batch | Protocol Member |
| GET | /api/attendance/embeddings/{service_id}/ | Download face embeddings for service pool | Protocol Member |
| GET | /api/attendance/live/{service_id}/ | Live monitor feed (SSE or polling) | Superadmin / Protocol Admin |
| GET | /api/attendance/service/{id}/ | Get attendance records for a service | Admin+ |
| PATCH | /api/attendance/{id}/edit/ | Manual attendance edit | Superadmin |
| POST | /api/attendance/backdate/ | Late resumption backdating | Superadmin |

## **12.4 Service Management**

| **Method** | **Endpoint** | **Description** | **Auth** |
| --- | --- | --- | --- |
| GET | /api/services/ | List all services for current semester | Admin+ |
| POST | /api/services/ | Create a new service | Superadmin |
| PATCH | /api/services/{id}/ | Edit service details or time window | Superadmin |
| DELETE | /api/services/{id}/cancel/ | Cancel a service | Superadmin |
| PATCH | /api/geo-fence/ | Update chapel coordinates and radius | Superadmin |

## **12.5 Reports**

| **Method** | **Endpoint** | **Description** | **Auth** |
| --- | --- | --- | --- |
| GET | /api/reports/attendance/ | Filtered report (week / service / semester) | Admin+ |
| GET | /api/reports/export/pdf/ | Export as PDF | Admin+ |
| GET | /api/reports/export/excel/ | Export as Excel/CSV | Admin+ |

| **SECTION 13 — SECURITY** |
| --- |

# **13. Security**

## **13.1 Anti-Fraud Layers**

| **Layer** | **Mechanism** |
| --- | --- |
| Identity verification | Server-side facial recognition — face registered at signup, matched at every attendance |
| Liveness detection | Random challenge per student per sign-in prevents photo or video spoofing |
| Device binding | Protocol members can only mark from their registered bound device |
| Geo-fencing | Attendance only accepted within Superadmin-configured chapel GPS radius |
| Auto time window | Attendance only accepted within the configured window — no manual gate-keeping needed |
| Service scoping | Students matched only during their assigned service group session |
| Per-student lock | Duplicate marking blocked across simultaneous protocol members |
| Offline stamping | Offline records include encrypted timestamp, GPS, device ID — validated fully on sync |
| Duplicate detection | Fuzzy name match + exact phone + exact matric checks on every registration |

## **13.2 Data Security**

- Face data stored in a secured, non-public directory on the VPS

- Face embeddings cached on protocol member devices are encrypted and wiped after sync

- All API communication over HTTPS

- Offline attendance records encrypted before storage in IndexedDB

- JWT or session-based auth with role enforcement on every endpoint

- UUIDs as primary keys — no sequential IDs exposed in URLs

- Superadmin bootstrap via CLI only — no UI signup path for the highest privilege role

- Secure, time-limited tokens for matric number update links

## **13.3 Audit Trail Integrity**

- Every destructive or privileged action writes to the AuditLogs table

- Manual attendance edits and backdating require a reason note — cannot be saved without it

- Audit logs are append-only — no record can be deleted through the UI

- Student deletion is logged before execution

| **SECTION 14 — ARCHIVING ****&**** SEMESTER LIFECYCLE** |
| --- |

# **14. Archiving ****&**** Semester Lifecycle**

## **14.1 Archiving Trigger**

- Archiving occurs automatically when the semester end date is reached

- Superadmin can trigger archiving manually at any time

- Once archived, the semester is locked — no further edits to attendance records

## **14.2 What Happens on Archive**

- All attendance records for the semester are moved to the archive partition

- Face samples for all students are deleted (semester-scoped data)

- Student registration status is reset — all students must re-register next semester

- Service schedules for the semester are archived

- Audit logs for the semester are retained indefinitely

- New semester state is initialized, ready for Superadmin setup

## **14.3 Access to Archived Records**

- Students cannot view past semester records

- Superadmin can view all archived semester records

- Admins can view archived records only if Superadmin has explicitly granted that permission

- Archived data can be exported as PDF or Excel/CSV

| **SECTION 15 — PHASE 2 ROADMAP** |
| --- |

# **15. Phase 2 — Future Enhancements**

## **15.1 Student Portal**

- Students log in using their matric number or system-generated ID

- Dashboard shows live attendance percentage with visual progress indicator

- Warning displayed when student is approaching the 70% cut-off

- View attendance history per service per semester

- Church events calendar (read-only)

- Sermon downloads uploaded by Content/Media Admin

## **15.2 WhatsApp Notifications**

- Service reminders sent to students before their assigned service

- Attendance warnings when a student's percentage drops toward the cut-off

- Sent via WhatsApp Business API using registered phone numbers

## **15.3 Content / Media Admin**

- Upload and manage sermon recordings and documents

- Create and manage church event listings

- Content visible to students via the student portal

## **15.4 Student Login ****&**** Password Reset**

- Self-service login using matric number (or system ID) and password

- Password reset via OTP sent to registered phone number

| **SECTION 16 — IMPLEMENTATION NOTES FOR AGENTS** |
| --- |

# **16. Implementation Notes for Development Agents**

## **16.1 Backend Agent (Django)**

- Use Django REST Framework for all API endpoints

- Implement custom permission classes for each role: Superadmin, Admin, Protocol Admin, Protocol Member

- DeepFace: store face embeddings (vectors) in the FaceSamples table at registration; 1-to-N comparison at match time scoped to the active service's student pool

- Offline sync endpoint (/api/attendance/sync/) must validate each record individually and return per-record results

- Attendance percentage must be recalculated via live database query — not cached — to ensure accuracy after service changes

- Audit log writes must be atomic with the action they log — use database transactions

- Superadmin seeding: implement as Django management command (manage.py create_superadmin)

- Face sample storage: /media/face_samples/{semester_id}/{student_id}/ — never served publicly

- Fuzzy name matching: use Python rapidfuzz library for similarity scoring; flag if similarity exceeds configurable threshold

- Auto-capitalization: normalize full_name to title case on save; store lowercase normalized version in full_name_normalized for matching

- Attendance window: implement a scheduled task (Celery or Django-Q) that auto-opens and auto-closes service windows at configured times

- Matric update links: generate signed tokens with expiry (e.g., Django signing framework or JWT with exp claim)

## **16.2 Frontend Agent (Next.js)**

- PWA configuration required: manifest.json, service worker, offline fallback pages

- IndexedDB used to queue offline attendance records on protocol member devices only

- Background Sync API triggers record upload when connectivity is restored

- Offline face matching: load cached embeddings into memory; run DeepFace-compatible JS matching or call a bundled WASM model

- Face capture UI: use device camera API, evaluate capture quality client-side before upload to reduce server load

- Geo-location: request GPS permission on protocol member login; attach to every attendance marking request

- Liveness challenge UI: display the challenge prompt clearly, capture frame for server-side (or local) liveness validation

- Live attendance monitor: implement as Server-Sent Events (SSE) or WebSocket connection to /api/attendance/live/{service_id}/

- Name fields: apply title-case formatting on input blur and before form submission

- All admin UI routes protected by role-based middleware

- Report export buttons call backend export endpoint and trigger browser file download

## **16.3 Shared Constraints**

- All timestamps stored in UTC — display converted to local time in UI

- UUIDs as primary keys throughout — never expose sequential integer IDs in URLs

- All file uploads (face samples, profile photos) validated for type and size before storage

- HTTPS enforced on all endpoints

- Environment variables for all secrets: DB credentials, JWT secret, DeepFace model paths

- Student hard delete: wrap in a database transaction — delete face samples, attendance records, and student record atomically, then write audit log

| **Document Status** This specification (v1.1) is complete for Phase 1 development handoff. All architectural decisions have been finalized through iterative review. Phase 2 features are documented for reference but are out of scope for the initial build. Any deviations from this spec during development should be logged and reviewed against the product owner's intent. |
| --- |

	© Private University Chapel System  v1.1