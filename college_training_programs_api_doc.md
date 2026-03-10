# College Training Programs — Frontend Documentation

## Overview

These 7 endpoints allow college admins/TPO to manage pre-placement training programs—create programs, list/view them, update details, change status through a lifecycle, view enrolled students with progress, and update individual enrollments.

**Base URL:** `/api/college`  
**Auth:** JWT HttpOnly cookie (college admin or TPO role)  
**Content-Type:** `application/json`

### Database Tables Used

| Table | Purpose |
|---|---|
| `training_programs` | Program details, schedule, targeting, status |
| `training_enrollments` | Student enrollment, progress, completion, feedback |

---

## Table of Contents

1. [API #89 — Create Training Program](#api-89--create-training-program)
2. [API #90 — List All Training Programs](#api-90--list-all-training-programs)
3. [API #91 — Get Training Program Details](#api-91--get-training-program-details)
4. [API #92 — Update Training Program](#api-92--update-training-program)
5. [API #93 — Toggle Training Status](#api-93--toggle-training-status)
6. [API #94 — Get Training Enrollments](#api-94--get-training-enrollments)
7. [API #95 — Update Enrollment](#api-95--update-enrollment)
8. [Integration Guide](#integration-guide--data-flow--entity-relationships)
9. [Status Lifecycle & Transitions](#status-lifecycle--transitions)
10. [Edge Case Test Scenarios](#edge-case-test-scenarios)

---

## API #89 — Create Training Program

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/college/create_training_program` |
| **Auth** | JWT — COLLEGEADMIN or TPO |
| **Rate Limit** | Yes (apiLimiter) |

### Request Body

| Field | Type | Required | Input Type | Validation | Notes |
|---|---|---|---|---|---|
| `program_name` | string | **Yes** | Single-line input | 2–200 chars | Unique per college (case-insensitive) |
| `program_description` | string | No | Textarea | Max 3000 chars | Rich description of what the program covers |
| `program_type` | string | **Yes** | Dropdown | See types below | Category of training |
| `trainer_name` | string | No | Single-line input | Max 200 chars | External or internal trainer name |
| `trainer_organization` | string | No | Single-line input | Max 200 chars | Trainer's company/org |
| `start_date` | date | No | Date picker | ISO date (YYYY-MM-DD) | When the program starts |
| `end_date` | date | No | Date picker | Must be ≥ start_date | When the program ends |
| `total_sessions` | number | No | Number input | 1–500 | Total number of sessions planned |
| `session_duration_hours` | number | No | Number input | 0.5–24 | Duration per session in hours |
| `target_dept_ids` | UUID[] | No | Multi-select dropdown | Valid dept UUIDs in college | Which departments this targets |
| `target_passout_year` | number | No | Dropdown (year) | 2020–2040 | Target batch year |
| `max_enrollment` | number | No | Number input | 1–10000 | Cap on enrollments |
| `enrollment_deadline` | date | No | Date picker | ISO date | Last date to enroll |
| `program_status` | string | No | Dropdown | See statuses below | Defaults to `upcoming` |

### Program Types (Dropdown Values)

| Value | Display Label |
|---|---|
| `aptitude` | Aptitude Training |
| `coding` | Coding / DSA |
| `soft_skills` | Soft Skills |
| `interview_prep` | Interview Preparation |
| `resume_building` | Resume Building |
| `technical` | Technical Training |
| `group_discussion` | Group Discussion |
| `other` | Other |

### Program Statuses

| Value | Display | Color |
|---|---|---|
| `upcoming` | Upcoming | Blue |
| `enrollment_open` | Enrollment Open | Green |
| `in_progress` | In Progress | Amber |
| `completed` | Completed | Gray |
| `cancelled` | Cancelled | Red |

### Postman Example

```json
POST /api/college/create_training_program

{
  "program_name": "Pre-Placement Aptitude Training 2026",
  "program_description": "Comprehensive aptitude training covering quantitative, reasoning, and verbal sections for upcoming placement drives.",
  "program_type": "aptitude",
  "trainer_name": "Dr. Priya Mehta",
  "trainer_organization": "SkillEdge Academy",
  "start_date": "2026-04-01",
  "end_date": "2026-04-30",
  "total_sessions": 20,
  "session_duration_hours": 2,
  "target_passout_year": 2027,
  "max_enrollment": 200,
  "enrollment_deadline": "2026-03-25"
}
```

### Success Response (201)

```json
{
  "success": true,
  "message": "Training program created",
  "data": {
    "program_id": "uuid",
    "college_id": "uuid",
    "program_name": "Pre-Placement Aptitude Training 2026",
    "program_description": "Comprehensive aptitude training...",
    "program_type": "aptitude",
    "trainer_name": "Dr. Priya Mehta",
    "trainer_organization": "SkillEdge Academy",
    "start_date": "2026-04-01",
    "end_date": "2026-04-30",
    "total_sessions": 20,
    "session_duration_hours": 2,
    "target_dept_ids": null,
    "target_passout_year": 2027,
    "max_enrollment": 200,
    "enrollment_deadline": "2026-03-25",
    "program_status": "upcoming",
    "created_by": "uuid",
    "created_by_name": null,
    "created_at": "2026-03-08T10:00:00Z",
    "updated_at": "2026-03-08T10:00:00Z"
  }
}
```

### Error Responses

| Status | Message | When |
|---|---|---|
| 400 | Joi validation errors | Missing required fields, invalid types |
| 400 | `One or more department IDs are invalid...` | Invalid dept UUIDs |
| 409 | `Training program "X" already exists` | Duplicate name in same college |

### Frontend Notes

- **Form layout:** Two-column layout with essential fields on left, optional on right
- **Department multi-select:** Load options from `GET /api/college/get_all_departments` (active only)
- **Passout year dropdown:** Generate years from 2020 to current+5
- **Date pickers:** end_date should be disabled or validated to be ≥ start_date
- **Character counters:** Show on description textarea (e.g. "245/3000")
- After creation, redirect to program list or detail page

---

## API #90 — List All Training Programs

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/college/get_all_training_programs` |
| **Auth** | JWT — COLLEGEADMIN or TPO |
| **Rate Limit** | None (GET) |

### Query Parameters

| Parameter | Type | Required | Default | Input Type | Notes |
|---|---|---|---|---|---|
| `program_status` | string | No | — | Dropdown / Tabs | Filter by status |
| `program_type` | string | No | — | Dropdown | Filter by type |
| `target_passout_year` | number | No | — | Dropdown | Filter by target batch |
| `search` | string | No | — | Search input | Searches name, description, trainer |
| `sort_by` | string | No | `created_at` | Dropdown | `program_name`, `created_at`, `start_date`, `end_date`, `program_type`, `program_status` |
| `sort_order` | string | No | `desc` | Toggle | `asc` / `desc` |
| `page` | number | No | `1` | Pagination | Min: 1 |
| `limit` | number | No | `10` | Pagination | Max: 100 |

### Success Response (200)

```json
{
  "success": true,
  "message": "Training programs retrieved successfully",
  "data": [
    {
      "program_id": "uuid",
      "program_name": "Pre-Placement Aptitude Training 2026",
      "program_type": "aptitude",
      "trainer_name": "Dr. Priya Mehta",
      "trainer_organization": "SkillEdge Academy",
      "start_date": "2026-04-01",
      "end_date": "2026-04-30",
      "total_sessions": 20,
      "program_status": "enrollment_open",
      "target_passout_year": 2027,
      "max_enrollment": 200,
      "enrollment_deadline": "2026-03-25",
      "created_by_name": "Admin User",
      "enrolled_count": 85,
      "completed_count": 0,
      "dropped_count": 2,
      "avg_rating": null,
      "created_at": "2026-03-08T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1
  }
}
```

### Frontend Notes

- **Status tabs/filters:** Use status badges with colors as defined above
- **Card/table layout:** Show program name, type badge, dates, enrolled/max, status
- **Enrollment progress bar:** `enrolled_count / max_enrollment` (if max_enrollment set)
- **Quick actions:** View details, Edit, Change status buttons per row

---

## API #91 — Get Training Program Details

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/college/get_training_program/:programId` |
| **Auth** | JWT — COLLEGEADMIN or TPO |
| **Rate Limit** | None (GET) |

### Path Parameters

| Parameter | Type | Required |
|---|---|---|
| `programId` | UUID | Yes |

### Success Response (200)

```json
{
  "success": true,
  "message": "Training program retrieved successfully",
  "data": {
    "program_id": "uuid",
    "program_name": "Pre-Placement Aptitude Training 2026",
    "program_description": "Comprehensive aptitude training...",
    "program_type": "aptitude",
    "trainer_name": "Dr. Priya Mehta",
    "trainer_organization": "SkillEdge Academy",
    "start_date": "2026-04-01",
    "end_date": "2026-04-30",
    "total_sessions": 20,
    "session_duration_hours": 2,
    "target_dept_ids": ["dept-uuid-1", "dept-uuid-2"],
    "target_passout_year": 2027,
    "max_enrollment": 200,
    "enrollment_deadline": "2026-03-25",
    "program_status": "in_progress",
    "created_by": "user-uuid",
    "created_by_name": "Admin User",
    "target_dept_names": [
      { "dept_id": "dept-uuid-1", "dept_name": "Computer Engineering" },
      { "dept_id": "dept-uuid-2", "dept_name": "Information Technology" }
    ],
    "enrollment_stats": {
      "enrolled_count": 150,
      "completed_count": 45,
      "in_progress_count": 95,
      "dropped_count": 8,
      "failed_count": 2,
      "avg_rating": 4.2,
      "avg_completion_percentage": 62.5,
      "avg_sessions_attended": 12.3
    },
    "created_at": "2026-03-08T10:00:00Z",
    "updated_at": "2026-03-15T14:00:00Z"
  }
}
```

### Error Responses

| Status | Message | When |
|---|---|---|
| 404 | `Training program not found` | Invalid ID or belongs to another college |

### Frontend Notes

- **Detail page sections:**
  - **Header:** Program name, type badge, status badge, action buttons (Edit, Change Status)
  - **Info card:** Description, trainer info, dates, session details
  - **Target section:** Department names (resolved from UUIDs) + passout year
  - **Enrollment card:** Stats with donut chart (enrolled/in-progress/completed/dropped/failed)
  - **Quick stats:** avg_rating (stars), avg_completion (progress bar), avg_sessions
- **Navigation:** "View Enrollments" button → links to API #94

---

## API #92 — Update Training Program

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | `/api/college/update_training_program/:programId` |
| **Auth** | JWT — COLLEGEADMIN or TPO |
| **Rate Limit** | Yes (apiLimiter) |

### Request Body

Same fields as Create (API #89), but **all fields are optional** (at least one required). The `program_status` field is **excluded** from update — use Toggle Status (API #93) instead.

### Error Responses

| Status | Message | When |
|---|---|---|
| 400 | `Cannot update a cancelled training program` | Program is cancelled |
| 400 | `End date must be on or after the start date` | Invalid date range |
| 400 | `One or more department IDs are invalid...` | Bad dept UUIDs |
| 400 | `No valid fields to update` | Empty update body |
| 404 | `Training program not found` | Invalid ID or wrong college |
| 409 | `Training program "X" already exists` | Duplicate name |

### Postman Example

```json
PUT /api/college/update_training_program/:programId

{
  "program_name": "Advanced Aptitude Training 2026",
  "total_sessions": 25,
  "max_enrollment": 250,
  "end_date": "2026-05-10"
}
```

### Frontend Notes

- **Edit form:** Pre-populate all fields from GET detail response
- **Status cannot be changed here** — use the dedicated status toggle
- **Disable edit for cancelled programs** — show a message explaining why

---

## API #93 — Toggle Training Status

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `/api/college/toggle_training_status/:programId` |
| **Auth** | JWT — COLLEGEADMIN or TPO |
| **Rate Limit** | Yes (apiLimiter) |

### Request Body

| Field | Type | Required | Input Type |
|---|---|---|---|
| `program_status` | string | **Yes** | Dropdown (filtered by valid transitions) |

### Valid Status Transitions

```
upcoming ──────────► enrollment_open ──────► in_progress ──────► completed
    │                       │                      │
    └──► cancelled ◄────────┘──────────────────────┘
              │
              └──► upcoming (reopen)
```

| Current Status | Allowed Transitions |
|---|---|
| `upcoming` | `enrollment_open`, `cancelled` |
| `enrollment_open` | `in_progress`, `cancelled` |
| `in_progress` | `completed`, `cancelled` |
| `completed` | _(terminal — no transitions)_ |
| `cancelled` | `upcoming` (reopen) |

### Error Responses

| Status | Message | When |
|---|---|---|
| 400 | `Cannot change status from "X" to "Y". Allowed: ...` | Invalid transition |
| 404 | `Training program not found` | Invalid ID or wrong college |

### Postman Example

```json
PATCH /api/college/toggle_training_status/:programId

{
  "program_status": "enrollment_open"
}
```

### Frontend Notes

- **Confirmation dialog:** "Change program status from '{{current}}' to '{{new}}'?"
- **Dynamic dropdown:** Only show valid next statuses based on current status
- **Color transition:** Update the status badge color immediately after success
- **Completed is terminal:** Hide the status change button for completed programs

---

## API #94 — Get Training Enrollments

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/college/get_training_enrollments/:programId` |
| **Auth** | JWT — COLLEGEADMIN or TPO |
| **Rate Limit** | None (GET) |

### Query Parameters

| Parameter | Type | Required | Default | Input Type | Notes |
|---|---|---|---|---|---|
| `completion_status` | string | No | — | Dropdown | Filter: enrolled, in_progress, completed, dropped, failed |
| `search` | string | No | — | Search input | Searches student name or email |
| `sort_by` | string | No | `enrolled_at` | Dropdown | `enrolled_at`, `sessions_attended`, `completion_percentage`, `student_name`, `student_rating` |
| `sort_order` | string | No | `desc` | Toggle | `asc` / `desc` |
| `page` | number | No | `1` | Pagination | |
| `limit` | number | No | `10` | Pagination | Max: 100 |

### Success Response (200)

```json
{
  "success": true,
  "message": "Enrollments retrieved successfully",
  "data": {
    "program": {
      "program_id": "uuid",
      "program_name": "Pre-Placement Aptitude Training 2026",
      "total_sessions": 20
    },
    "enrollments": [
      {
        "enrollment_id": "uuid",
        "program_id": "uuid",
        "student_id": "uuid",
        "student_name": "Rahul Sharma",
        "student_email": "rahul@example.com",
        "dept_name": "Computer Engineering",
        "passout_year": 2027,
        "enrolled_at": "2026-03-10T10:00:00Z",
        "sessions_attended": 12,
        "completion_status": "in_progress",
        "completion_percentage": 60,
        "certificate_issued": false,
        "certificate_url": null,
        "student_feedback": null,
        "student_rating": null,
        "completed_at": null,
        "created_at": "2026-03-10T10:00:00Z",
        "updated_at": "2026-03-20T14:00:00Z"
      }
    ],
    "summary": {
      "total_enrolled": 150,
      "enrolled_count": 5,
      "in_progress_count": 95,
      "completed_count": 45,
      "dropped_count": 3,
      "failed_count": 2,
      "avg_completion": 62.5,
      "avg_sessions": 12.3,
      "avg_rating": 4.2
    }
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 150,
    "totalPages": 15
  }
}
```

### Frontend Notes

- **Table layout:** Student name, email, department, sessions attended (X/total), completion %, status badge, actions
- **Progress column:** Show `sessions_attended / total_sessions` with a mini progress bar
- **Completion percentage:** Color-coded progress bar (green ≥ 80%, amber ≥ 50%, red < 50%)
- **Summary panel:** Show at top — pie/donut chart of status distribution, avg metrics
- **Status filter tabs:** All | Enrolled | In Progress | Completed | Dropped | Failed (with counts from summary)
- **Action column:** "Update" button per row → opens API #95 modal
- **Bulk export idea:** Add CSV export button (frontend-side from displayed data)

---

## API #95 — Update Enrollment

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `/api/college/update_enrollment/:enrollmentId` |
| **Auth** | JWT — COLLEGEADMIN or TPO |
| **Rate Limit** | Yes (apiLimiter) |

### Request Body

| Field | Type | Required | Input Type | Validation | Notes |
|---|---|---|---|---|---|
| `sessions_attended` | number | No | Number input | 0 – 500, cannot exceed program's total_sessions | Sessions the student actually attended |
| `completion_status` | string | No | Dropdown | enrolled, in_progress, completed, dropped, failed | Update progress status |
| `completion_percentage` | number | No | Number input / Slider | 0–100 | Overall completion % |
| `certificate_issued` | boolean | No | Toggle/Checkbox | — | Has certificate been issued? |
| `certificate_url` | string | No | Single-line input (URL) | Valid URI, max 500 chars | Link to issued certificate |

At least one field must be provided.

### Auto-Behaviors

- **When `completion_status` → `completed`:** `completed_at` is auto-set to current timestamp
- **When `completion_status` moves away from `completed`:** `completed_at` is auto-cleared to null

### Error Responses

| Status | Message | When |
|---|---|---|
| 400 | `Cannot update enrollment for a cancelled program` | Parent program is cancelled |
| 400 | `Sessions attended cannot exceed total sessions (X)` | Exceeds program's session count |
| 400 | `No valid fields to update` | Empty body |
| 404 | `Enrollment not found` | Invalid enrollment ID or wrong college |

### Postman Example

```json
PATCH /api/college/update_enrollment/:enrollmentId

{
  "sessions_attended": 18,
  "completion_status": "completed",
  "completion_percentage": 90,
  "certificate_issued": true,
  "certificate_url": "https://certificates.example.com/cert/12345"
}
```

### Success Response (200)

```json
{
  "success": true,
  "message": "Enrollment updated successfully",
  "data": {
    "enrollment_id": "uuid",
    "program_id": "uuid",
    "student_id": "uuid",
    "student_name": "Rahul Sharma",
    "student_email": "rahul@example.com",
    "dept_name": "Computer Engineering",
    "passout_year": 2027,
    "enrolled_at": "2026-03-10T10:00:00Z",
    "sessions_attended": 18,
    "completion_status": "completed",
    "completion_percentage": 90,
    "certificate_issued": true,
    "certificate_url": "https://certificates.example.com/cert/12345",
    "student_feedback": null,
    "student_rating": null,
    "completed_at": "2026-04-30T16:00:00Z",
    "created_at": "2026-03-10T10:00:00Z",
    "updated_at": "2026-04-30T16:00:00Z"
  }
}
```

### Frontend Notes

- **Update modal/drawer:** Show student info at top (read-only), editable fields below
- **Sessions input:** Show max as hint: "Out of {{total_sessions}} sessions"
- **Completion slider:** 0–100 with percentage label
- **Certificate section:** Toggle for `certificate_issued` → if true, show URL input
- **Status dropdown:** Show all 5 options
- **After success:** Close modal, refresh enrollment table row, show success toast

---

## Integration Guide — Data Flow & Entity Relationships

### How Training Programs Connect

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    TRAINING PROGRAM LIFECYCLE                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  COLLEGE SIDE (These APIs):                                                │
│    1. Admin creates training program                                       │
│       POST /college/create_training_program (#89)                          │
│       └─▶ program_status = 'upcoming'                                      │
│                                                                            │
│    2. Admin opens enrollment                                               │
│       PATCH /college/toggle_training_status/:id (#93)                      │
│       └─▶ status: upcoming → enrollment_open                               │
│                                                                            │
│  STUDENT SIDE (Future APIs):                                               │
│    3. Students browse available programs                                   │
│       GET /student/get_available_trainings (#164)                          │
│                                                                            │
│    4. Student enrolls in program                                           │
│       POST /student/enroll_training/:programId (#165)                      │
│       └─▶ Creates training_enrollment record                               │
│                                                                            │
│  COLLEGE SIDE (These APIs):                                                │
│    5. Admin starts the program                                             │
│       PATCH /college/toggle_training_status/:id (#93)                      │
│       └─▶ status: enrollment_open → in_progress                            │
│                                                                            │
│    6. Admin tracks progress & updates enrollments                          │
│       GET /college/get_training_enrollments/:id (#94)                      │
│       PATCH /college/update_enrollment/:id (#95)                           │
│       └─▶ sessions_attended, completion_status, certificate                │
│                                                                            │
│  STUDENT SIDE (Future APIs):                                               │
│    7. Student submits feedback & rating                                    │
│       POST /student/submit_training_feedback/:enrollmentId (#166)          │
│       └─▶ student_feedback + student_rating stored                         │
│                                                                            │
│    8. Student views own training history                                   │
│       GET /student/get_my_trainings (#167)                                 │
│                                                                            │
│  COLLEGE SIDE:                                                             │
│    9. Admin completes the program                                          │
│       PATCH /college/toggle_training_status/:id (#93)                      │
│       └─▶ status: in_progress → completed                                  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Entity Relationships

```
colleges (college_id)
    │
    ├── departments (dept_id, college_id)
    │       └── referenced by training_programs.target_dept_ids (UUID[])
    │
    ├── users (user_id, college_id)
    │       └── training_programs.created_by → users.user_id
    │
    ├── training_programs (program_id, college_id)
    │       │
    │       └── training_enrollments (enrollment_id, program_id, college_id)
    │               │
    │               └── students (student_id) — the enrolled student
    │
    └── students (student_id, college_id)
            └── training_enrollments (student_id, program_id) — UNIQUE constraint
```

### Related APIs

| API | Relationship |
|---|---|
| **College #3** — Get All Departments | Provides dept options for `target_dept_ids` multi-select |
| **College #5** — Get All Students | Student data shown in enrollment list |
| **Student #164** — Browse Trainings | Students see programs with `enrollment_open` status |
| **Student #165** — Enroll in Training | Creates enrollment records shown in API #94 |
| **Student #166** — Submit Feedback | Fills `student_feedback` and `student_rating` in enrollment |
| **Student #167** — My Trainings | Student-side view of their enrollments |

### Navigation Flow

```
Training Programs Dashboard (API #90 — List)
    │
    ├── [+ Create Program] → Create Form (API #89)
    │
    ├── Program Card / Row
    │       ├── [View] → Program Detail Page (API #91)
    │       │       ├── Program Info Section
    │       │       ├── Enrollment Stats (donut chart)
    │       │       ├── [Edit Program] → Edit Form (API #92)
    │       │       ├── [Change Status] → Status Modal (API #93)
    │       │       └── [View Enrollments] → Enrollments Page (API #94)
    │       │               └── [Update] per row → Update Modal (API #95)
    │       │
    │       ├── [Quick Edit] → Edit Form (API #92)
    │       └── [Change Status] → Status Modal (API #93)
    │
    └── Tabs: All | Upcoming | Open | In Progress | Completed | Cancelled
```

---

## Status Lifecycle & Transitions

### Program Status State Machine

| Current | → Next | Trigger | Validations |
|---|---|---|---|
| `upcoming` | `enrollment_open` | Admin opens enrollment | — |
| `upcoming` | `cancelled` | Admin cancels | — |
| `enrollment_open` | `in_progress` | Admin starts program | — |
| `enrollment_open` | `cancelled` | Admin cancels | — |
| `in_progress` | `completed` | Admin marks complete | — |
| `in_progress` | `cancelled` | Admin cancels | — |
| `completed` | _(none)_ | Terminal state | Cannot transition |
| `cancelled` | `upcoming` | Admin reopens | — |

### Enrollment Status Values

| Status | Description | Color |
|---|---|---|
| `enrolled` | Student signed up, hasn't started | Blue |
| `in_progress` | Actively attending sessions | Amber |
| `completed` | Finished all sessions / requirements | Green |
| `dropped` | Student withdrew or stopped attending | Gray |
| `failed` | Did not meet completion criteria | Red |

---

## Edge Case Test Scenarios

| # | Scenario | Expected | Status |
|---|---|---|---|
| **Create** | | | |
| 1 | Create program with all fields filled | Success with all fields returned | 201 |
| 2 | Create program with only required fields | Success with optional fields as null | 201 |
| 3 | Duplicate program name (same college) | Error: already exists | 409 |
| 4 | Duplicate name from another college | Success (allowed) | 201 |
| 5 | Invalid UUID in target_dept_ids | Error: invalid department IDs | 400 |
| 6 | Dept ID from another college | Error: do not belong to your college | 400 |
| 7 | end_date before start_date | Joi validation error | 400 |
| 8 | Missing program_name | Joi: Program name is required | 400 |
| 9 | Missing program_type | Joi: Program type is required | 400 |
| 10 | Invalid program_type value | Joi: must be one of... | 400 |
| **List** | | | |
| 11 | List with no filters | All programs paginated | 200 |
| 12 | Filter by status=upcoming | Only upcoming returned | 200 |
| 13 | Filter by program_type=coding | Only coding programs | 200 |
| 14 | Search by trainer name | Matching programs returned | 200 |
| 15 | Sort by start_date ascending | Earliest first | 200 |
| 16 | Page beyond total | Empty array with correct pagination | 200 |
| **Detail** | | | |
| 17 | Get existing program | Full details with enrollment_stats | 200 |
| 18 | Get program with target_dept_ids | Department names resolved | 200 |
| 19 | Get non-existent program | Training program not found | 404 |
| 20 | Get program from another college | Training program not found | 404 |
| **Update** | | | |
| 21 | Update program name | Success with new name | 200 |
| 22 | Update cancelled program | Cannot update a cancelled program | 400 |
| 23 | Update with duplicate name | Already exists | 409 |
| 24 | Update with no fields | At least one field required | 400 |
| 25 | Update with invalid end_date < start_date | Error | 400 |
| **Status** | | | |
| 26 | upcoming → enrollment_open | Success | 200 |
| 27 | upcoming → in_progress | Invalid transition | 400 |
| 28 | upcoming → completed | Invalid transition | 400 |
| 29 | in_progress → completed | Success | 200 |
| 30 | completed → anything | Terminal state | 400 |
| 31 | cancelled → upcoming (reopen) | Success | 200 |
| **Enrollments** | | | |
| 32 | List enrollments — program with enrollments | Student list with details | 200 |
| 33 | List enrollments — empty program | Empty array, summary all zeros | 200 |
| 34 | Filter by completion_status | Only matching statuses | 200 |
| 35 | Search by student email | Matching students | 200 |
| 36 | Sort by sessions_attended desc | Highest first | 200 |
| 37 | Non-existent program | Training program not found | 404 |
| **Update Enrollment** | | | |
| 38 | Update sessions_attended | Success | 200 |
| 39 | Sessions > total_sessions | Cannot exceed total sessions | 400 |
| 40 | Set completion_status = completed | completed_at auto-set | 200 |
| 41 | Change away from completed | completed_at auto-cleared to null | 200 |
| 42 | Issue certificate with URL | certificate_issued=true, URL saved | 200 |
| 43 | Update enrollment for cancelled program | Cannot update | 400 |
| 44 | Non-existent enrollment | Enrollment not found | 404 |
| 45 | Update with no fields | At least one field required | 400 |
