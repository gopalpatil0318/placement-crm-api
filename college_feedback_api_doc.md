# College Feedback & Interview Questions API Documentation

> **APIs #99–#102** — College admin endpoints for managing student feedback and interview questions  
> **Base URL:** `/api/college`  
> **Auth:** JWT (HttpOnly cookie) — requires `collegeadmin` or `tpo` role

---

## Table of Contents

1. [GET /get_all_feedback](#1-get-all-feedback)
2. [PATCH /approve_feedback/:feedbackId](#2-approve--reject-feedback)
3. [GET /get_all_interview_questions](#3-get-all-interview-questions)
4. [PATCH /approve_interview_question/:questionId](#4-approve--reject-interview-question)
5. [Database Schema Reference](#5-database-schema-reference)
6. [Frontend Implementation Guide](#6-frontend-implementation-guide)
7. [Integration with Other APIs](#7-integration-with-other-apis)
8. [Edge Case Test Scenarios](#8-edge-case-test-scenarios)

---

## 1. Get All Feedback

**`GET /api/college/get_all_feedback`**

List all placement feedback submitted by students, with optional filtering and search.

### Query Parameters

| Parameter    | Type    | Required | Default      | Description |
|-------------|---------|----------|--------------|-------------|
| `is_approved`| boolean | No       | —            | `true` = approved only, `false` = pending only, omit = all |
| `company_id` | UUID    | No       | —            | Filter by company |
| `job_id`     | UUID    | No       | —            | Filter by specific job |
| `rating`     | integer | No       | —            | Filter by exact rating (1–5) |
| `search`     | string  | No       | —            | Search in feedback text (max 100 chars) |
| `sort_by`    | string  | No       | `created_at` | `created_at` or `rating` |
| `sort_order` | string  | No       | `desc`       | `asc` or `desc` |
| `page`       | number  | No       | `1`          | Page number |
| `limit`      | number  | No       | `20`         | Items per page (1–100) |

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": [
    {
      "feedback_id": "uuid",
      "job_id": "uuid",
      "company_id": "uuid",
      "student_id": "uuid",
      "rating": 4,
      "feedback_text": "The interview process was well-organized. HR was very professional.",
      "is_anonymous": false,
      "is_approved": false,
      "created_at": "2025-03-01T10:30:00.000Z",
      "updated_at": "2025-03-01T10:30:00.000Z",
      "company_name": "Infosys",
      "job_title": "Software Engineer",
      "student_name": "Rahul Sharma",
      "department_name": "Computer Science"
    },
    {
      "feedback_id": "uuid",
      "job_id": "uuid",
      "company_id": "uuid",
      "student_id": "uuid",
      "rating": 2,
      "feedback_text": "Long waiting time between rounds.",
      "is_anonymous": true,
      "is_approved": true,
      "created_at": "2025-02-28T14:00:00.000Z",
      "updated_at": "2025-03-02T09:00:00.000Z",
      "company_name": "TCS",
      "job_title": "Graduate Engineer Trainee",
      "student_name": "Anonymous",
      "department_name": null
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

### Response Field Notes

| Field | Note |
|-------|------|
| `student_name` | Shows `"Anonymous"` when `is_anonymous = true` |
| `department_name` | `null` when `is_anonymous = true` (identity hidden) |
| `student_id` | Still present for internal admin use even when anonymous |

### Frontend UI — Feedback List Page

| Input | Type | Notes |
|-------|------|-------|
| Approval status filter | **Dropdown** (`All / Pending / Approved`) | Maps to `is_approved=true/false/omit` |
| Company filter | **Dropdown** | Populate from `GET /get_all_companies` |
| Rating filter | **Dropdown** (1-5 stars) | Optional exact match |
| Search | **Single-line input** | Searches feedback_text |
| Sort by | **Dropdown** (`Newest / Oldest / Highest Rating / Lowest Rating`) | Maps to sort_by + sort_order combo |

---

## 2. Approve / Reject Feedback

**`PATCH /api/college/approve_feedback/:feedbackId`** — Rate limited

Toggle approval status of a student's feedback.

### Path Parameters

| Parameter    | Type | Description |
|-------------|------|-------------|
| `feedbackId` | UUID | Feedback record to approve/reject |

### Request Body

```json
{
  "is_approved": true
}
```

| Field        | Type    | Required | Description |
|-------------|---------|----------|-------------|
| `is_approved`| boolean | Yes      | `true` = approve, `false` = reject/revoke |

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Feedback approved successfully",
  "data": {
    "feedback_id": "uuid",
    "is_approved": true,
    "updated_at": "2025-03-05T12:00:00.000Z"
  }
}
```

When rejecting:
```json
{
  "success": true,
  "message": "Feedback rejected",
  "data": {
    "feedback_id": "uuid",
    "is_approved": false,
    "updated_at": "2025-03-05T12:00:00.000Z"
  }
}
```

### Error Responses

| Status | Message | Scenario |
|--------|---------|----------|
| `404`  | `"Feedback not found"` | Invalid ID or different college |
| `429`  | Rate limited | Too many requests |

### Frontend UI — Approve Action

| Input | Type | Notes |
|-------|------|-------|
| Approve button | **Button** (green) | Sends `{ "is_approved": true }` |
| Reject button | **Button** (red) | Sends `{ "is_approved": false }` |

- Place both buttons in each feedback row/card
- Show green badge for approved, gray/red for pending/rejected
- Update local state immediately after success

---

## 3. Get All Interview Questions

**`GET /api/college/get_all_interview_questions`**

List all interview questions submitted by students for admin review.

### Query Parameters

| Parameter    | Type    | Required | Default      | Description |
|-------------|---------|----------|--------------|-------------|
| `is_approved`| boolean | No       | —            | `true` = approved, `false` = pending, omit = all |
| `company_id` | UUID    | No       | —            | Filter by company |
| `job_id`     | UUID    | No       | —            | Filter by specific job |
| `topic`      | string  | No       | —            | Filter by topic (partial match) |
| `search`     | string  | No       | —            | Search in question_description and topic |
| `sort_by`    | string  | No       | `created_at` | `created_at` or `topic` |
| `sort_order` | string  | No       | `desc`       | `asc` or `desc` |
| `page`       | number  | No       | `1`          | Page number |
| `limit`      | number  | No       | `20`         | Items per page (1–100) |

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": [
    {
      "question_id": "uuid",
      "company_id": "uuid",
      "job_id": "uuid",
      "student_id": "uuid",
      "question_description": "Explain the difference between process and thread in OS.",
      "topic": "Operating Systems",
      "sample_answer": "A process is an independent unit of execution with its own memory space...",
      "is_approved": false,
      "created_at": "2025-03-01T10:30:00.000Z",
      "updated_at": "2025-03-01T10:30:00.000Z",
      "company_name": "Google",
      "job_title": "Software Engineer",
      "student_name": "Priya Patel",
      "department_name": "Computer Science"
    }
  ],
  "pagination": {
    "total": 120,
    "page": 1,
    "limit": 20,
    "totalPages": 6
  }
}
```

### Frontend UI — Interview Questions List Page

| Input | Type | Notes |
|-------|------|-------|
| Approval status | **Dropdown** (`All / Pending / Approved`) | |
| Company filter | **Dropdown** | Populate from `GET /get_all_companies` |
| Topic filter | **Single-line input** | Partial match search |
| Search | **Single-line input** | Searches question_description and topic |
| Sort | **Dropdown** (`Newest / Oldest / Topic A-Z / Topic Z-A`) | |

---

## 4. Approve / Reject Interview Question

**`PATCH /api/college/approve_interview_question/:questionId`** — Rate limited

Toggle approval status of a submitted interview question.

### Path Parameters

| Parameter    | Type | Description |
|-------------|------|-------------|
| `questionId` | UUID | Question record to approve/reject |

### Request Body

```json
{
  "is_approved": true
}
```

| Field        | Type    | Required | Description |
|-------------|---------|----------|-------------|
| `is_approved`| boolean | Yes      | `true` = approve, `false` = reject/revoke |

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Interview question approved successfully",
  "data": {
    "question_id": "uuid",
    "is_approved": true,
    "updated_at": "2025-03-05T12:00:00.000Z"
  }
}
```

### Error Responses

| Status | Message | Scenario |
|--------|---------|----------|
| `404`  | `"Interview question not found"` | Invalid ID or different college |
| `429`  | Rate limited | Too many requests |

### Frontend UI — Approve Action

Same pattern as feedback approval: green approve button + red reject button per row.

---

## 5. Database Schema Reference

### placement_feedback

| Column | Type | Constraints |
|--------|------|-------------|
| `feedback_id` | UUID (PK) | Auto-generated |
| `college_id` | UUID (FK → colleges) | From JWT — never from request |
| `job_id` | UUID (FK → job_postings) | Required |
| `company_id` | UUID (FK → companies) | Required |
| `student_id` | UUID (FK → students) | From JWT on student side |
| `rating` | INTEGER | 1–5 (CHECK constraint) |
| `feedback_text` | TEXT | Optional |
| `is_anonymous` | BOOLEAN | Default `false` |
| `is_approved` | BOOLEAN | Default `false` |
| `created_at` | TIMESTAMP | Auto-set |
| `updated_at` | TIMESTAMP | Auto-updated via trigger |

**Unique constraint:** `(student_id, job_id)` — one feedback per student per job.

### interview_questions

| Column | Type | Constraints |
|--------|------|-------------|
| `question_id` | UUID (PK) | Auto-generated |
| `college_id` | UUID (FK → colleges) | From JWT |
| `company_id` | UUID (FK → companies) | Required |
| `job_id` | UUID (FK → job_postings) | Required |
| `student_id` | UUID (FK → students) | From JWT |
| `question_description` | TEXT | Required, 5–2000 chars |
| `topic` | TEXT | Optional, max 100 chars |
| `sample_answer` | TEXT | Optional, max 3000 chars |
| `is_approved` | BOOLEAN | Default `false` |
| `created_at` | TIMESTAMP | Auto-set |
| `updated_at` | TIMESTAMP | Auto-updated via trigger |

**No unique constraint** — students can submit multiple questions for the same job.

### Indexes

```
idx_feedback_job          ON placement_feedback(job_id)
idx_feedback_company      ON placement_feedback(company_id)
idx_interview_questions_company  ON interview_questions(company_id)
idx_interview_questions_job      ON interview_questions(job_id)
idx_interview_questions_approved ON interview_questions(is_approved)
```

---

## 6. Frontend Implementation Guide

### Feedback Management Page

**Route:** `/admin/feedback`

**Layout:**
1. Filter bar at top (status dropdown, company dropdown, rating stars, search box)
2. Table or card list below with:
   - Star rating display (visual stars)
   - Feedback text (truncated with "Show More")
   - Company name + Job title
   - Student name (or "Anonymous")
   - Submitted date
   - Approval status badge
   - Approve / Reject action buttons

**Validations:**
- None required on list page (all filtering is optional)
- Approve/Reject: No additional input needed, just button click

**UX Notes:**
- Highlight pending feedback (yellow dot or "Pending" badge)
- Show count of pending items in sidebar badge
- After approve/reject: update row in-place without full reload

### Interview Questions Management Page

**Route:** `/admin/interview-questions`

**Layout:**
1. Filter bar (status, company, topic, search)
2. Card/accordion list per question:
   - Question description (full text)
   - Topic badge
   - Sample answer (collapsible)
   - Company + Job reference
   - Student name
   - Approve / Reject buttons

**Validations:**
- None required for list/approve/reject actions

**UX Notes:**
- Group by company for easier review
- Show topic as colored tag/badge
- Sample answers should be collapsible to save space

---

## 7. Integration with Other APIs

### Relationship with Student APIs (#172–#175)

```
Student submits feedback  →  POST /student/submit_feedback
                              ↓
                          Saved as is_approved = false
                              ↓
Admin reviews             →  GET /college/get_all_feedback?is_approved=false
                              ↓
Admin approves/rejects    →  PATCH /college/approve_feedback/:feedbackId
                              ↓
                          Approved feedback visible to other students (future)
```

```
Student submits question  →  POST /student/submit_interview_question
                              ↓
                          Saved as is_approved = false
                              ↓
Admin reviews             →  GET /college/get_all_interview_questions?is_approved=false
                              ↓
Admin approves            →  PATCH /college/approve_interview_question/:questionId
                              ↓
Students can browse       →  GET /student/browse_interview_questions (only approved)
```

### Related APIs for Dropdowns

| Dropdown | API to Populate |
|----------|----------------|
| Company filter | `GET /api/college/get_all_companies` |
| Job filter (by company) | `GET /api/college/get_all_jobs?company_id=xxx` |

### Feature Flag

Both features are gated by the college's `enabled_features` array:
- `feedback` — required for feedback APIs
- `interview_questions` — required for interview question APIs

Check `colleges.enabled_features` to determine whether to show these menu items in the admin dashboard.

### Data Flow with Placement Lifecycle

```
Job Published → Students Apply → Rounds → Placement Results
                                                ↓
                                    Student submits feedback (rating + text)
                                    Student shares interview questions
                                                ↓
                                    Admin reviews & approves
                                                ↓
                                    Approved questions available for next batch
```

---

## 8. Edge Case Test Scenarios

### Get All Feedback (#99)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | No feedback exists | Empty array, `total: 0` |
| 2 | Filter `is_approved=false` | Only pending feedback |
| 3 | Filter `is_approved=true` | Only approved feedback |
| 4 | Filter by `company_id` | Only feedback for that company |
| 5 | Filter by `job_id` | Only feedback for that job |
| 6 | Filter by `rating=5` | Only 5-star feedback |
| 7 | Combine `company_id` + `is_approved=false` | Pending feedback for specific company |
| 8 | Search `"professional"` | Feedback containing "professional" in text |
| 9 | Sort by `rating` desc | Highest rated first |
| 10 | Sort by `created_at` asc | Oldest first |
| 11 | Anonymous feedback in list | `student_name = "Anonymous"`, `department_name = null` |
| 12 | Non-anonymous feedback | Full student name + department shown |
| 13 | Pagination page 2 | Correct offset |
| 14 | Feedback from other college | Not visible (college isolation) |
| 15 | Feedback with null `feedback_text` | Returns with `feedback_text: null` |

### Approve / Reject Feedback (#100)

| # | Test Case | Expected |
|---|-----------|----------|
| 16 | Approve pending feedback | `200`, `is_approved: true`, message: "Feedback approved" |
| 17 | Reject approved feedback | `200`, `is_approved: false`, message: "Feedback rejected" |
| 18 | Approve already-approved | `200` (idempotent, updates `updated_at`) |
| 19 | Invalid feedback ID | `404` |
| 20 | Feedback from other college | `404` |
| 21 | Missing `is_approved` field | `422` validation error |
| 22 | Invalid `is_approved` type (string) | `422` validation error |

### Get All Interview Questions (#101)

| # | Test Case | Expected |
|---|-----------|----------|
| 23 | No questions exist | Empty array, `total: 0` |
| 24 | Filter `is_approved=false` | Only pending questions |
| 25 | Filter `is_approved=true` | Only approved questions |
| 26 | Filter by `company_id` | Only questions for that company |
| 27 | Filter by `topic=OS` | Questions with "OS" in topic |
| 28 | Search `"process"` | Matches question_description or topic |
| 29 | Sort by `topic` asc | Alphabetical by topic |
| 30 | Question with null topic | Returns with `topic: null` |
| 31 | Question with null sample_answer | Returns with `sample_answer: null` |
| 32 | Questions from other college | Not visible |
| 33 | Large result set with pagination | Correct total, pages, offset |

### Approve / Reject Interview Question (#102)

| # | Test Case | Expected |
|---|-----------|----------|
| 34 | Approve pending question | `200`, `is_approved: true` |
| 35 | Reject approved question | `200`, `is_approved: false` |
| 36 | Invalid question ID | `404` |
| 37 | Question from other college | `404` |
| 38 | Missing `is_approved` | `422` validation error |
| 39 | After approval, student browse sees it | Confirm via `GET /student/browse_interview_questions` |
| 40 | After rejection, student browse doesn't see it | Confirm question hidden |

### Postman Test Data

**Approve feedback:**
```
PATCH /api/college/approve_feedback/{{feedbackId}}
Body: { "is_approved": true }
```

**List pending feedback:**
```
GET /api/college/get_all_feedback?is_approved=false&page=1&limit=10
```

**List questions by company:**
```
GET /api/college/get_all_interview_questions?company_id={{companyId}}&is_approved=false
```

**Approve question:**
```
PATCH /api/college/approve_interview_question/{{questionId}}
Body: { "is_approved": true }
```
