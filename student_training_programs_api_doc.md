# Student Training Programs API Documentation

> **APIs #164–#167** — Student-side training program endpoints  
> **Base URL:** `/api/student`  
> **Auth:** All endpoints require student authentication (JWT HttpOnly cookie)

---

## Table of Contents

1. [GET /get_available_training](#1-get-available-training-programs)
2. [POST /enroll_in_training/:programId](#2-enroll-in-training-program)
3. [GET /get_enrolled_training](#3-get-enrolled-training-programs)
4. [POST /submit_training_feedback/:enrollmentId](#4-submit-training-feedback)
5. [Enums & Constants](#5-enums--constants)
6. [Enrollment Flow](#6-enrollment-flow)
7. [Integration with College-Side APIs](#7-integration-with-college-side-apis)
8. [Edge Case Test Scenarios](#8-edge-case-test-scenarios)

---

## 1. Get Available Training Programs

**`GET /api/student/get_available_training`**

Lists training programs with `enrollment_open` status that the student has **not** already enrolled in, and that target the student's department and passout year (if targeting is set).

### Query Parameters

| Parameter            | Type   | Required | Default      | Description |
|----------------------|--------|----------|--------------|-------------|
| `program_type`       | string | No       | —            | Filter by type. One of: `aptitude`, `coding`, `soft_skills`, `interview_prep`, `resume_building`, `technical`, `group_discussion`, `other` |
| `search`             | string | No       | —            | Search in program name, description, trainer name (max 100 chars) |
| `sort_by`            | string | No       | `created_at` | One of: `program_name`, `start_date`, `end_date`, `enrollment_deadline`, `created_at` |
| `sort_order`         | string | No       | `desc`       | `asc` or `desc` |
| `page`               | number | No       | `1`          | Page number (min: 1) |
| `limit`              | number | No       | `10`         | Items per page (1–100) |

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Available training programs retrieved successfully",
  "data": [
    {
      "program_id": "uuid",
      "program_name": "Interview Skills Workshop",
      "program_description": "Comprehensive interview preparation...",
      "program_type": "interview_prep",
      "trainer_name": "John Smith",
      "trainer_organization": "SkillUp Academy",
      "start_date": "2025-02-01",
      "end_date": "2025-03-01",
      "total_sessions": 8,
      "session_duration_hours": 2.0,
      "max_enrollment": 50,
      "enrollment_deadline": "2025-01-25T23:59:59.000Z",
      "enrolled_count": 32,
      "spots_remaining": 18,
      "is_deadline_passed": false,
      "created_by_name": "TPO User",
      "created_at": "2025-01-10T08:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

### Key Fields Explained

| Field               | Type    | Notes |
|---------------------|---------|-------|
| `spots_remaining`   | number \| null | `max_enrollment - enrolled_count`. `null` if no enrollment cap set |
| `is_deadline_passed`| boolean | `true` if `enrollment_deadline` has passed. `false` if no deadline set |
| `enrolled_count`    | number  | Current number of students enrolled |

### Error Responses

| Status | Scenario |
|--------|----------|
| `404`  | Student profile not found |
| `422`  | Invalid query params (bad `program_type`, `sort_by`, etc.) |

### Frontend Notes

- **Show spots_remaining** badge: `"18 spots left"` or `"No limit"` if null
- **Disable enroll button** if `is_deadline_passed` is `true`
- Programs **already enrolled in** are automatically excluded
- Programs **not targeting** student's department/year are excluded
- Only programs in `enrollment_open` status appear here

---

## 2. Enroll in Training Program

**`POST /api/student/enroll_in_training/:programId`**

Enrolls the student in a training program. Rate-limited. No request body needed.

### Path Parameters

| Parameter   | Type | Description |
|-------------|------|-------------|
| `programId` | UUID | Program to enroll in |

### Request Body

None required.

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Enrollment successful",
  "data": {
    "enrollment_id": "uuid",
    "program_id": "uuid",
    "program_name": "Interview Skills Workshop",
    "program_type": "interview_prep",
    "trainer_name": "John Smith",
    "start_date": "2025-02-01",
    "end_date": "2025-03-01",
    "total_sessions": 8,
    "completion_status": "enrolled",
    "enrolled_at": "2025-01-15T10:30:00.000Z"
  }
}
```

### Error Responses

| Status | Message | Scenario |
|--------|---------|----------|
| `400`  | `"Enrollment is closed for this program"` | Program status is not `enrollment_open` |
| `400`  | `"Enrollment deadline has passed for this program"` | Deadline exceeded |
| `400`  | `"This program has reached its maximum enrollment capacity"` | Full capacity |
| `400`  | `"This program is not available for your department"` | Department targeting mismatch |
| `400`  | `"This program is not available for your passout year"` | Year targeting mismatch |
| `404`  | `"Training program not found"` | Invalid/wrong college program ID |
| `404`  | `"Student not found"` | Student profile doesn't exist |
| `409`  | `"Already enrolled in this program"` | Duplicate enrollment attempt |
| `429`  | Rate limited | Too many requests |

### Frontend Notes

- **Confirm before enrolling**: show program name, dates, trainer info
- **After enrollment**: redirect to enrolled trainings list or show success toast
- Remove the program from available list after successful enrollment
- Handle capacity-full and deadline-passed gracefully (disable button + tooltip)

---

## 3. Get Enrolled Training Programs

**`GET /api/student/get_enrolled_training`**

Lists all training programs the student has enrolled in, along with progress data and a summary dashboard.

### Query Parameters

| Parameter           | Type   | Required | Default      | Description |
|---------------------|--------|----------|--------------|-------------|
| `completion_status` | string | No       | —            | Filter by: `enrolled`, `in_progress`, `completed`, `dropped`, `failed` |
| `sort_by`           | string | No       | `enrolled_at`| One of: `enrolled_at`, `completion_percentage`, `sessions_attended`, `program_name` |
| `sort_order`        | string | No       | `desc`       | `asc` or `desc` |
| `page`              | number | No       | `1`          | Page number |
| `limit`             | number | No       | `10`         | Items per page (1–100) |

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Enrolled training programs retrieved successfully",
  "data": {
    "enrollments": [
      {
        "enrollment_id": "uuid",
        "program_id": "uuid",
        "program_name": "Interview Skills Workshop",
        "program_description": "Comprehensive interview preparation...",
        "program_type": "interview_prep",
        "program_status": "in_progress",
        "trainer_name": "John Smith",
        "trainer_organization": "SkillUp Academy",
        "start_date": "2025-02-01",
        "end_date": "2025-03-01",
        "total_sessions": 8,
        "session_duration_hours": 2.0,
        "enrolled_at": "2025-01-15T10:30:00.000Z",
        "sessions_attended": 4,
        "completion_status": "in_progress",
        "completion_percentage": 50.0,
        "certificate_issued": false,
        "certificate_url": null,
        "student_feedback": null,
        "student_rating": null,
        "completed_at": null,
        "has_submitted_feedback": false,
        "attendance_percentage": 50.0,
        "created_at": "2025-01-15T10:30:00.000Z",
        "updated_at": "2025-02-15T14:00:00.000Z"
      }
    ],
    "summary": {
      "total_enrolled": 6,
      "enrolled_count": 1,
      "in_progress_count": 2,
      "completed_count": 2,
      "dropped_count": 1,
      "failed_count": 0,
      "certificates_earned": 2
    }
  },
  "pagination": {
    "total": 6,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

### Key Fields Explained

| Field                   | Type    | Notes |
|-------------------------|---------|-------|
| `has_submitted_feedback`| boolean | `true` if student already submitted rating/feedback |
| `attendance_percentage` | number \| null | `(sessions_attended / total_sessions) × 100`. `null` if `total_sessions` not set |
| `completion_percentage` | number  | Set by college admins (0–100). `0` default |
| `certificate_issued`    | boolean | Whether certificate was issued by admin |
| `certificate_url`       | string \| null | Download link for certificate (if issued) |
| `summary`               | object  | Aggregate stats across ALL enrollments (ignores filters) |

### Frontend Notes

- **Dashboard cards**: Use `summary` for status distribution (`enrolled`, `in_progress`, `completed`, etc.)
- **Progress bar**: Use `completion_percentage` for each enrollment
- **Attendance**: Show `attendance_percentage` as separate progress indicator
- **Feedback button**: Show "Submit Feedback" only when `has_submitted_feedback` is `false` and `program_status` is `in_progress` or `completed`
- **Certificate download**: Show download button when `certificate_issued === true` with `certificate_url`
- **Filter tabs**: Use `completion_status` for tabbed UI (All / Enrolled / In Progress / Completed / Dropped / Failed)

---

## 4. Submit Training Feedback

**`POST /api/student/submit_training_feedback/:enrollmentId`**

Submit a one-time feedback and rating for a training program. Rate-limited.

### Path Parameters

| Parameter      | Type | Description |
|----------------|------|-------------|
| `enrollmentId` | UUID | Enrollment to submit feedback for |

### Request Body

```json
{
  "student_rating": 4,
  "student_feedback": "Very helpful workshop with practical interview exercises. The mock interview sessions were particularly valuable."
}
```

| Field              | Type   | Required | Validation |
|--------------------|--------|----------|------------|
| `student_rating`   | number | Yes      | Integer, 1–5 |
| `student_feedback` | string | Yes      | 10–2000 characters |

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Feedback submitted successfully",
  "data": {
    "enrollment_id": "uuid",
    "program_id": "uuid",
    "program_name": "Interview Skills Workshop",
    "student_rating": 4,
    "student_feedback": "Very helpful workshop with practical interview exercises...",
    "completion_status": "in_progress",
    "sessions_attended": 4,
    "completion_percentage": 50.0,
    "updated_at": "2025-02-20T09:00:00.000Z"
  }
}
```

### Error Responses

| Status | Message | Scenario |
|--------|---------|----------|
| `400`  | `"You can only submit feedback for programs that are in progress or completed"` | Program hasn't started yet (`upcoming` or `enrollment_open`) |
| `400`  | `"Cannot submit feedback for a program you dropped out of"` | Student's completion_status is `dropped` |
| `404`  | `"Enrollment not found"` | Invalid enrollment ID or doesn't belong to student |
| `409`  | `"You have already submitted feedback for this program"` | Feedback already exists |
| `422`  | Validation error | Missing fields, rating out of range, feedback too short/long |
| `429`  | Rate limited | Too many requests |

### Frontend Notes

- **Star rating** component: 1–5 stars
- **Textarea** for feedback: show character counter (10–2000)
- **One-time only**: Disable/hide feedback button after submission
- **Conditional visibility**: Only show feedback form when program is `in_progress` or `completed` AND student hasn't `dropped`
- After success, update `has_submitted_feedback` to `true` in enrolled list

---

## 5. Enums & Constants

### Program Types

| Value | Display Name |
|-------|-------------|
| `aptitude` | Aptitude |
| `coding` | Coding |
| `soft_skills` | Soft Skills |
| `interview_prep` | Interview Prep |
| `resume_building` | Resume Building |
| `technical` | Technical |
| `group_discussion` | Group Discussion |
| `other` | Other |

### Program Statuses (read-only for students)

| Status | Description | Visible in Available? |
|--------|-------------|----------------------|
| `upcoming` | Not yet open | No |
| `enrollment_open` | Accepting enrollments | **Yes** |
| `in_progress` | Training ongoing | No |
| `completed` | Training finished | No |
| `cancelled` | Training cancelled | No |

### Enrollment/Completion Statuses

| Status | Description |
|--------|-------------|
| `enrolled` | Student enrolled, program not started |
| `in_progress` | Student is attending sessions |
| `completed` | Student completed the program |
| `dropped` | Student dropped out |
| `failed` | Student failed the program |

---

## 6. Enrollment Flow

```
┌─────────────────┐
│ Browse Available │ GET /get_available_training
│   Programs       │ (filtered by dept, year, enrollment_open)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Enroll in        │ POST /enroll_in_training/:programId
│ Program          │ → completion_status = 'enrolled'
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Track Progress   │ GET /get_enrolled_training
│ (Dashboard)      │ → view sessions_attended, completion_%
└────────┬────────┘
         │ (once program is in_progress or completed)
         ▼
┌─────────────────┐
│ Submit Feedback  │ POST /submit_training_feedback/:enrollmentId
│ (One-time)       │ → rating (1-5) + written feedback
└─────────────────┘
```

### Status Transitions (managed by college admins)

- **Program status**: College admins change `enrollment_open` → `in_progress` → `completed`
- **Enrollment status**: College admins update `enrolled` → `in_progress` → `completed`/`failed`/`dropped`
- **Certificate**: College admins issue via separate admin APIs
- **Student actions**: Enroll + Submit Feedback only

---

## 7. Integration with College-Side APIs

These student endpoints integrate with the college training APIs (#89–#95):

| College API | Student Impact |
|-------------|---------------|
| `POST /create_training` | Creates programs that become available to students |
| `PUT /update_training/:programId` | Can change `program_status` (affects availability) |
| `POST /enroll_student_in_training` | College can enroll students directly |
| `PUT /update_enrollment_status` | Changes student's `completion_status`, `sessions_attended`, etc. |
| `GET /get_training_enrollments` | College views all enrollments for a program |
| `DELETE /delete_training/:programId` | Removes program (students lose access) |

### Data Flow

1. **College creates program** → status `upcoming`
2. **College opens enrollment** → status `enrollment_open` → Students see it in available list
3. **Students enroll** → enrollment record created
4. **College starts program** → status `in_progress` → Students track progress
5. **College updates attendance** → `sessions_attended` updated → Students see progress
6. **Students submit feedback** → one-time rating + feedback
7. **College completes program** → status `completed` → certificates issued

---

## 8. Edge Case Test Scenarios

### Available Programs

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | No programs with `enrollment_open` status | Empty array, `total: 0` |
| 2 | All programs already enrolled in | Empty array |
| 3 | Programs targeting different department | Not shown |
| 4 | Programs targeting different passout year | Not shown |
| 5 | Programs with `target_dept_ids = NULL` (all depts) | Shown to everyone |
| 6 | Programs with `target_passout_year = NULL` | Shown to all years |
| 7 | Filter by `program_type=coding` | Only coding programs |
| 8 | Search by trainer name | Matching results |
| 9 | Sort by `enrollment_deadline` ASC | Nearest deadline first |
| 10 | Program with `max_enrollment=50`, `enrolled_count=50` | `spots_remaining: 0` (still visible, but enrollment will fail) |
| 11 | Program with no `max_enrollment` | `spots_remaining: null` |
| 12 | Program with passed deadline | `is_deadline_passed: true` |

### Enrollment

| # | Test Case | Expected |
|---|-----------|----------|
| 13 | Enroll in valid program | `200` with enrollment details |
| 14 | Enroll in non-existent program | `404` Training program not found |
| 15 | Enroll when status is `upcoming` | `400` Enrollment is closed |
| 16 | Enroll when status is `in_progress` | `400` Enrollment is closed |
| 17 | Enroll when status is `completed` | `400` Enrollment is closed |
| 18 | Enroll when status is `cancelled` | `400` Enrollment is closed |
| 19 | Enroll after deadline has passed | `400` Enrollment deadline has passed |
| 20 | Enroll when program is at max capacity | `400` Maximum enrollment capacity |
| 21 | Enroll when dept doesn't match targeting | `400` Not available for your department |
| 22 | Enroll when year doesn't match targeting | `400` Not available for your passout year |
| 23 | Enroll in same program twice | `409` Already enrolled |
| 24 | Enroll in program from different college | `404` Training program not found |

### Enrolled Programs

| # | Test Case | Expected |
|---|-----------|----------|
| 25 | No enrollments | Empty array, all summary counts `0` |
| 26 | Filter by `completion_status=completed` | Only completed enrollments |
| 27 | Sort by `completion_percentage` DESC | Highest progress first |
| 28 | Program with 4/8 sessions attended | `attendance_percentage: 50.0` |
| 29 | Certificate issued | `certificate_issued: true`, `certificate_url` present |
| 30 | Feedback already submitted | `has_submitted_feedback: true` |
| 31 | Summary counts are independent of filter | Summary always shows all statuses |

### Feedback Submission

| # | Test Case | Expected |
|---|-----------|----------|
| 32 | Submit valid feedback (rating 5, text 50 chars) | `200` with feedback details |
| 33 | Rating below 1 | `422` validation error |
| 34 | Rating above 5 | `422` validation error |
| 35 | Feedback text < 10 chars | `422` validation error |
| 36 | Feedback text > 2000 chars | `422` validation error |
| 37 | Missing `student_rating` | `422` Rating is required |
| 38 | Missing `student_feedback` | `422` Feedback text is required |
| 39 | Submit for enrollment not owned by student | `404` Enrollment not found |
| 40 | Submit when program status is `upcoming` | `400` Can only submit for in_progress/completed |
| 41 | Submit when program status is `enrollment_open` | `400` Can only submit for in_progress/completed |
| 42 | Submit when student dropped | `400` Cannot submit feedback for dropped |
| 43 | Submit feedback twice | `409` Already submitted feedback |
| 44 | Submit for program from different college | `404` Enrollment not found |
