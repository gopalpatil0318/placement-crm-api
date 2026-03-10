# Student Job Browsing & Applications — Frontend Documentation

## Overview

These 8 endpoints allow authenticated students to browse available jobs, check eligibility, apply/deny jobs, track applications, and withdraw. All endpoints are under `/api/student/` and require the student's JWT HttpOnly cookie.

**Base URL:** `/api/student`  
**Auth:** JWT HttpOnly cookie (set during student login)  
**Content-Type:** `application/json`

---

## Table of Contents

1. [API #151 — List Available Jobs](#api-151--list-available-jobs)
2. [API #152 — Get Job Details](#api-152--get-job-details)
3. [API #153 — Check Job Eligibility](#api-153--check-job-eligibility)
4. [API #154 — Apply for Job](#api-154--apply-for-job)
5. [API #155 — Deny/Opt-Out of Job](#api-155--denyopt-out-of-job)
6. [API #156 — List My Applications](#api-156--list-my-applications)
7. [API #157 — Get Application Details](#api-157--get-application-details)
8. [API #158 — Withdraw Application](#api-158--withdraw-application)
9. [Integration Guide — Data Flow & Entity Relationships](#integration-guide--data-flow--entity-relationships)
10. [Key Frontend States Per Job](#key-frontend-states-per-job)
11. [Edge Case Test Scenarios](#edge-case-test-scenarios)

---

## API #151 — List Available Jobs

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/student/get_available_jobs` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | None (read endpoint) |

### Query Parameters

| Parameter | Type | Required | Default | Input Type | Notes |
|---|---|---|---|---|---|
| `search` | string | No | — | Text Input | Searches across job_title, company_name, job_description (partial match, case-insensitive) |
| `job_type` | string | No | — | Dropdown: `full-time`, `internship`, `both` | Filter by job type |
| `company_name` | string | No | — | Text Input | Filter by company name (partial match) |
| `sort_by` | string | No | `application_deadline` | Dropdown: `application_deadline`, `created_at`, `job_title`, `company_name`, `salary_min` | Sort column |
| `sort_order` | string | No | `asc` | Toggle: `asc` / `desc` | Sort direction |
| `page` | number | No | `1` | Pagination control | Min: 1 |
| `limit` | number | No | `10` | Pagination control | Range: 1–100 |

### Success Response (200)

```json
{
  "success": true,
  "message": "Available jobs retrieved successfully",
  "data": [
    {
      "job_id": "uuid",
      "job_title": "Software Engineer",
      "job_description": "Full-stack development role...",
      "job_location": "Mumbai",
      "salary_package": "12 LPA",
      "salary_min": 1000000,
      "salary_max": 1200000,
      "job_type": "full-time",
      "internship_duration": null,
      "internship_stipend": null,
      "application_deadline": "2026-03-15T23:59:59Z",
      "bond_duration": null,
      "posted_at": "2026-01-10T10:00:00Z",
      "company_id": "uuid",
      "company_name": "TechCorp",
      "company_website": "https://techcorp.com",
      "industry_type": "IT",
      "position_count": 3,
      "total_applications": 45,
      "application_status": null,
      "has_applied": false,
      "has_denied": false
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

### Frontend Notes

- Only shows jobs that are `published`, within `application_deadline`, and matching the student's `passout_year` — no frontend filtering needed for these.
- Use `has_applied` / `has_denied` to conditionally show:
  - `has_applied = true` → "Applied" badge with `application_status` value
  - `has_denied = true` → "Opted Out" badge (gray)
  - Both `false` → Show "Apply" button and "Not Interested" link
- `position_count` and `total_applications` are useful for job cards.
- `salary_min` / `salary_max` are numeric (in currency units). `salary_package` is a display-friendly string.

---

## API #152 — Get Job Details

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/student/get_job_details/:jobId` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | None |

### Path Parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `jobId` | UUID | Yes | Job posting ID |

### Success Response (200)

```json
{
  "success": true,
  "message": "Job details retrieved successfully",
  "data": {
    "job": {
      "job_id": "uuid",
      "job_title": "Software Engineer",
      "job_description": "Full description of the role...",
      "job_location": "Mumbai",
      "salary_package": "12 LPA",
      "salary_min": 1000000,
      "salary_max": 1200000,
      "bond_duration": "2 years",
      "bond_details": "INR 2,00,000 penalty if leaving before bond period",
      "job_type": "full-time",
      "internship_duration": null,
      "internship_stipend": null,
      "passout_year": 2026,
      "application_deadline": "2026-03-15T23:59:59Z",
      "job_status": "published",
      "posted_at": "2026-01-10T10:00:00Z",
      "total_applications": 45
    },
    "company": {
      "company_id": "uuid",
      "company_name": "TechCorp",
      "company_website": "https://techcorp.com",
      "industry_type": "IT"
    },
    "positions": [
      {
        "position_id": "uuid",
        "position_name": "Backend Developer",
        "position_description": "Node.js and PostgreSQL role...",
        "vacancies": 5
      },
      {
        "position_id": "uuid",
        "position_name": "Frontend Developer",
        "position_description": "React.js role...",
        "vacancies": 3
      }
    ],
    "eligibility_criteria": {
      "min_overall_cgpa": 7.0,
      "max_live_kts": 0,
      "min_tenth_percentage": 60.0,
      "min_twelfth_percentage": 55.0,
      "min_diploma_percentage": null,
      "allowed_genders": null,
      "allowed_departments": ["Computer Science", "IT"],
      "allowed_gap_statuses": null,
      "exclude_already_placed": true
    },
    "rounds": [
      {
        "round_id": "uuid",
        "round_number": 1,
        "round_name": "Aptitude Test",
        "round_description": "Online aptitude assessment...",
        "round_type": "aptitude_test",
        "round_date": "2026-03-20",
        "round_venue": "Hall A",
        "round_status": "scheduled"
      },
      {
        "round_id": "uuid",
        "round_number": 2,
        "round_name": "Technical Interview",
        "round_description": "1-on-1 technical round...",
        "round_type": "technical",
        "round_date": "2026-03-25",
        "round_venue": "Online (Google Meet)",
        "round_status": "scheduled"
      }
    ],
    "questions": [
      {
        "question_id": "uuid",
        "question_text": "Why do you want to join us?",
        "question_type": "text",
        "question_options": null,
        "is_required": true,
        "question_order": 1
      },
      {
        "question_id": "uuid",
        "question_text": "Preferred role",
        "question_type": "single_choice",
        "question_options": ["Backend", "Frontend", "DevOps"],
        "is_required": true,
        "question_order": 2
      },
      {
        "question_id": "uuid",
        "question_text": "Are you willing to relocate?",
        "question_type": "boolean",
        "question_options": null,
        "is_required": false,
        "question_order": 3
      }
    ],
    "student_status": {
      "has_applied": false,
      "application_id": null,
      "application_status": null,
      "applied_at": null,
      "has_denied": false,
      "denial_reason": null,
      "denied_at": null
    }
  }
}
```

### Error Responses

| Status | Message | When |
|---|---|---|
| 400 | `Job is not published` | Job status is not "published" |
| 404 | `Job not found` | Job doesn't exist or belongs to a different college |

### Frontend Notes

- **Positions:** Render as a selectable list (radio buttons) if `positions.length > 0`. Pre-select the first one. If no positions, hide the position selector.
- **Questions:** Render dynamically based on `question_type`:

  | `question_type` | Input Type | Notes |
  |---|---|---|
  | `text` | Textarea | Max 5000 characters |
  | `single_choice` | Radio buttons | Options from `question_options` array |
  | `multiple_choice` | Checkboxes | Options from `question_options` array |
  | `boolean` | Yes/No toggle or switch | Sends `true` / `false` |

- Mark required questions with an asterisk (`is_required: true`).
- **Eligibility Criteria:** Display as a sidebar info card — "Requirements for this job."
- **Rounds:** Show as a timeline or stepper component.
- **Student Status:** Use `student_status` to conditionally show:
  - `has_applied = true` → "You applied on {applied_at}" with status badge
  - `has_denied = true` → "You opted out of this job on {denied_at}"
  - Both `false` → Show Apply form / Check Eligibility button

---

## API #153 — Check Job Eligibility

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/student/check_job_eligibility/:jobId` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | None |

### Path Parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `jobId` | UUID | Yes | Job posting ID |

### Success Response (200)

```json
{
  "success": true,
  "message": "Eligibility check completed",
  "data": {
    "job": {
      "job_id": "uuid",
      "job_title": "Software Engineer",
      "company_name": "TechCorp",
      "application_deadline": "2026-03-15T23:59:59Z",
      "job_status": "published"
    },
    "eligibility": {
      "is_eligible": false,
      "issues": [
        "Minimum CGPA required: 7, yours: 6.5",
        "Allowed departments: Computer Science, IT"
      ],
      "criteria": {
        "min_overall_cgpa": 7.0,
        "max_live_kts": 0,
        "min_tenth_percentage": 60.0,
        "min_twelfth_percentage": 55.0,
        "min_diploma_percentage": null,
        "allowed_genders": null,
        "allowed_departments": ["Computer Science", "IT"],
        "allowed_gap_statuses": null,
        "exclude_already_placed": true
      }
    },
    "student_snapshot": {
      "overall_cgpa": 6.5,
      "total_live_kts": 0,
      "tenth_percentage": 72.0,
      "twelfth_or_diploma": "12th",
      "twelfth_percentage": 65.0,
      "diploma_percentage": null,
      "gender": "male",
      "dept_name": "Mechanical",
      "gap_status": "no_gap",
      "profile_is_approved": true
    },
    "blockers": [
      "Profile is not approved",
      "Application deadline has passed"
    ],
    "can_apply": false
  }
}
```

### Error Responses

| Status | Message | When |
|---|---|---|
| 404 | `Job not found` | Job doesn't exist or belongs to a different college |

### Frontend Notes

- **`can_apply`** is the master boolean — disable the "Apply" button if `false`.
- **`eligibility.issues[]`** = criteria-based failures (CGPA, percentage, department, etc.). Show as red warning items with ✗ icons.
- **`blockers[]`** = system-level blocks (profile not approved, restricted, already applied, deadline passed, etc.). Show as separate error banners.
- **`student_snapshot`** vs **`eligibility.criteria`**: Show side-by-side comparison table so the student can instantly see where they fall short.

  | Criteria | Required | Yours | Status |
  |---|---|---|---|
  | Min CGPA | 7.0 | 6.5 | ✗ |
  | Max Live KTs | 0 | 0 | ✓ |
  | 10th % | 60% | 72% | ✓ |

- Useful to call this before showing the Apply form, or as a "Check Eligibility" button on the job detail page.
- If `eligibility.criteria` is `null`, no criteria were set — all students are eligible (criteria-wise).

---

## API #154 — Apply for Job

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/student/apply_for_job/:jobId` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | Yes (apiLimiter) |

### Path Parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `jobId` | UUID | Yes | Job posting ID |

### Request Body

| Field | Type | Required | Input Type | Validation | Notes |
|---|---|---|---|---|---|
| `position_id` | UUID | No | Dropdown (from positions list in API #152) | Valid UUID | Select a specific position. Send `null` or omit if job has no positions or student skips. |
| `answers` | array | No | Dynamic form | — | Array of answer objects. Default: `[]`. Can be empty if no questions exist. |
| `answers[].question_id` | UUID | Yes (per item) | Hidden field | Must match a question_id from API #152 | Each answer references a specific question |
| `answers[].answer_text` | string | Conditional | Textarea | Max 5000 chars | For `text` type questions |
| `answers[].answer_options` | string[] | Conditional | Checkboxes / Radio | Array of strings | For `single_choice` or `multiple_choice` |
| `answers[].answer_boolean` | boolean | Conditional | Yes/No toggle | `true` or `false` | For `boolean` type questions |

### Postman Example

```json
POST /api/student/apply_for_job/e7f3a1b2-1234-5678-abcd-000000000001

{
  "position_id": "e7f3a1b2-1234-5678-abcd-000000000002",
  "answers": [
    {
      "question_id": "a1b2c3d4-1234-5678-abcd-000000000001",
      "answer_text": "I'm passionate about backend development and your company's tech stack aligns with my skills."
    },
    {
      "question_id": "b2c3d4e5-1234-5678-abcd-000000000002",
      "answer_options": ["Backend"]
    },
    {
      "question_id": "c3d4e5f6-1234-5678-abcd-000000000003",
      "answer_boolean": true
    }
  ]
}
```

### Success Response (201 Created)

```json
{
  "success": true,
  "message": "Application submitted successfully",
  "data": {
    "application_id": "uuid",
    "job_id": "uuid",
    "position_id": "uuid",
    "application_status": "pending",
    "is_eligible": true,
    "eligibility_remarks": null,
    "applied_at": "2026-01-15T10:30:00Z",
    "answers_submitted": 3,
    "job_title": "Software Engineer",
    "company_name": "TechCorp"
  }
}
```

### Error Responses

| Status | Message | When |
|---|---|---|
| 400 | `Profile is not approved` | Student profile not yet approved by college admin |
| 400 | `Job is not published` | Job status ≠ published |
| 400 | `This job is not currently accepting applications` | `allow_applications` is false |
| 400 | `Application deadline has passed` | `application_deadline` < current time |
| 400 | `This job is for {year} passout year students only` | Student's passout_year ≠ job's passout_year |
| 400 | `You have already applied to this job` | Duplicate application attempt |
| 400 | `You have already opted out of this job` | Student previously denied this job |
| 400 | `Student is restricted` | Active bar_from_placements or temporary_suspension |
| 400 | `Selected position not found or is no longer active` | Invalid or deactivated `position_id` |
| 400 | `Required question not answered (question #N)` | Missing required answer |
| 400 | `Required question #N must have an answer` | Empty required answer |
| 400 | `One or more answers reference invalid questions` | `question_id` doesn't belong to this job |
| 404 | `Job not found` | Job doesn't exist or belongs to a different college |

### Frontend Validations & UX

1. **Pre-check eligibility:** Call API #153 first — if `can_apply` is `false`, disable the form entirely and show the issues/blockers.
2. **Position selection:** Pre-select the first position if only one exists. If no positions, hide the selector.
3. **Required questions:** Validate that all `is_required: true` questions have non-empty answers before submitting.
4. **Answer mapping:** For each question from API #152, include the matching `question_id` in the answers array.
5. **Confirmation dialog:** Show "Are you sure you want to apply for **{job_title}** at **{company_name}**?" before submitting.
6. **After success:** Redirect to My Applications page (API #156) or show a success toast.
7. **Note on `is_eligible`:** Even if `is_eligible` is `false` in the response, the application is still submitted — it's flagged for the college to review. This is by design.

---

## API #155 — Deny/Opt-Out of Job

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/student/deny_job/:jobId` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | Yes (apiLimiter) |

### Path Parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `jobId` | UUID | Yes | Job posting ID |

### Request Body

| Field | Type | Required | Input Type | Validation | Notes |
|---|---|---|---|---|---|
| `denial_reason` | string | **Yes** | Textarea | Min 3, Max 500 chars | Why the student is opting out |
| `additional_comments` | string | No | Textarea | Max 2000 chars | Extra comments (optional) |

### Postman Example

```json
POST /api/student/deny_job/e7f3a1b2-1234-5678-abcd-000000000001

{
  "denial_reason": "Not interested in this role due to the 2-year bond requirement",
  "additional_comments": "Would consider if the bond duration is reduced to 1 year"
}
```

### Success Response (201 Created)

```json
{
  "success": true,
  "message": "Job opted out successfully",
  "data": {
    "denial_id": "uuid",
    "job_id": "uuid",
    "denial_reason": "Not interested in this role due to the 2-year bond requirement",
    "additional_comments": "Would consider if the bond duration is reduced to 1 year",
    "denied_at": "2026-01-15T11:00:00Z",
    "job_title": "Software Engineer",
    "company_name": "TechCorp"
  }
}
```

### Error Responses

| Status | Message | When |
|---|---|---|
| 400 | `Job is not published` | Job status ≠ published |
| 400 | `Cannot opt out — you have already applied to this job` | Student has an existing application |
| 404 | `Job not found` | Job doesn't exist or belongs to a different college |
| 409 | `You have already opted out of this job` | Duplicate denial attempt |

### Frontend Notes

- Show a "Not Interested" or "Opt Out" button on the job card or detail page.
- Show a confirmation modal with a required `denial_reason` textarea (min 3 chars) and an optional `additional_comments` textarea.
- After success, update the job card to show a gray "Opted Out" badge and hide the Apply/Opt-Out buttons.
- **This action is irreversible** — warn the student clearly in the confirmation dialog.

---

## API #156 — List My Applications

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/student/get_my_applications` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | None |

### Query Parameters

| Parameter | Type | Required | Default | Input Type | Notes |
|---|---|---|---|---|---|
| `application_status` | string | No | — | Dropdown / Tabs | Filter: `pending`, `under_review`, `shortlisted`, `rejected`, `selected`, `offered`, `withdrawn` |
| `sort_by` | string | No | `applied_at` | Dropdown: `applied_at`, `last_updated_at`, `application_status`, `job_title` | Sort column |
| `sort_order` | string | No | `desc` | Toggle: `asc` / `desc` | Sort direction |
| `page` | number | No | `1` | Pagination | Min: 1 |
| `limit` | number | No | `10` | Pagination | Range: 1–100 |

### Success Response (200)

```json
{
  "success": true,
  "message": "Applications retrieved successfully",
  "data": {
    "applications": [
      {
        "application_id": "uuid",
        "job_id": "uuid",
        "position_id": "uuid",
        "application_status": "shortlisted",
        "is_eligible": true,
        "eligibility_remarks": null,
        "applied_at": "2026-01-15T10:30:00Z",
        "last_updated_at": "2026-01-20T14:00:00Z",
        "job_title": "Software Engineer",
        "job_type": "full-time",
        "job_location": "Mumbai",
        "salary_package": "12 LPA",
        "salary_min": 1000000,
        "salary_max": 1200000,
        "job_status": "published",
        "application_deadline": "2026-03-15T23:59:59Z",
        "company_id": "uuid",
        "company_name": "TechCorp",
        "position_name": "Backend Developer",
        "current_round_name": "Technical Interview",
        "current_round_number": 2,
        "rounds_passed": 1,
        "total_rounds": 4
      }
    ],
    "status_summary": {
      "total": 5,
      "pending": 2,
      "under_review": 1,
      "shortlisted": 1,
      "rejected": 0,
      "selected": 0,
      "offered": 0,
      "withdrawn": 1
    }
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1
  }
}
```

### Frontend Notes

- **Status tabs:** Use `status_summary` to render filter tabs with badge counts:
  - `All (5) | Pending (2) | Under Review (1) | Shortlisted (1) | Withdrawn (1)`
  - The summary is always based on ALL applications (unaffected by the `application_status` filter).
- **Round progress:** Display as "Round 1/4 passed" or a mini progress bar using `rounds_passed` / `total_rounds`.
- **Current round:** Show `current_round_name` (e.g., "Next: Technical Interview") for active applications.
- **Color coding for `application_status`:**

  | Status | Color | Badge |
  |---|---|---|
  | `pending` | Yellow/Amber | ⏳ Pending |
  | `under_review` | Blue | 🔍 Under Review |
  | `shortlisted` | Teal/Cyan | ✓ Shortlisted |
  | `rejected` | Red | ✗ Rejected |
  | `selected` | Green | ★ Selected |
  | `offered` | Purple | 📋 Offered |
  | `withdrawn` | Gray | ↩ Withdrawn |

- **Withdraw button:** Only show for `pending`, `under_review`, or `shortlisted` statuses.
- Each card should link to the Application Detail page (API #157).

---

## API #157 — Get Application Details

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/student/get_application_details/:applicationId` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | None |

### Path Parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `applicationId` | UUID | Yes | Application ID |

### Success Response (200)

```json
{
  "success": true,
  "message": "Application details retrieved successfully",
  "data": {
    "application": {
      "application_id": "uuid",
      "job_id": "uuid",
      "position_id": "uuid",
      "application_status": "shortlisted",
      "current_round_id": "uuid",
      "is_eligible": true,
      "eligibility_remarks": null,
      "applied_at": "2026-01-15T10:30:00Z",
      "last_updated_at": "2026-01-20T14:00:00Z",
      "job_title": "Software Engineer",
      "job_status": "published",
      "application_deadline": "2026-03-15T23:59:59Z",
      "company_name": "TechCorp",
      "position_name": "Backend Developer"
    },
    "answers": [
      {
        "answer_id": "uuid",
        "question_id": "uuid",
        "question_text": "Why do you want to join us?",
        "question_type": "text",
        "question_options": null,
        "is_required": true,
        "question_order": 1,
        "answer_text": "I'm passionate about backend development...",
        "answer_options": null,
        "answer_boolean": null
      },
      {
        "answer_id": "uuid",
        "question_id": "uuid",
        "question_text": "Preferred role",
        "question_type": "single_choice",
        "question_options": ["Backend", "Frontend", "DevOps"],
        "is_required": true,
        "question_order": 2,
        "answer_text": null,
        "answer_options": ["Backend"],
        "answer_boolean": null
      }
    ],
    "round_results": [
      {
        "result_id": "uuid",
        "round_id": "uuid",
        "round_name": "Aptitude Test",
        "round_number": 1,
        "round_type": "aptitude_test",
        "round_status": "completed",
        "round_date": "2026-03-20",
        "round_venue": "Hall A",
        "result_status": "passed",
        "score": 85.5,
        "remarks": "Good performance",
        "attended": true,
        "scheduled_at": "2026-03-20T10:00:00Z",
        "completed_at": "2026-03-20T11:30:00Z"
      }
    ],
    "all_rounds": [
      {
        "round_id": "uuid",
        "round_number": 1,
        "round_name": "Aptitude Test",
        "round_type": "aptitude_test",
        "round_date": "2026-03-20",
        "round_venue": "Hall A",
        "round_status": "completed"
      },
      {
        "round_id": "uuid",
        "round_number": 2,
        "round_name": "Technical Interview",
        "round_type": "technical",
        "round_date": "2026-03-25",
        "round_venue": "Online (Google Meet)",
        "round_status": "scheduled"
      },
      {
        "round_id": "uuid",
        "round_number": 3,
        "round_name": "HR Interview",
        "round_type": "hr",
        "round_date": null,
        "round_venue": null,
        "round_status": "pending"
      }
    ],
    "placement": {
      "placement_id": "uuid",
      "placement_type": "full-time",
      "placement_status": "confirmed",
      "acceptance_status": "accepted",
      "fulltime_package": 1200000,
      "fulltime_designation": "SDE-1",
      "internship_stipend": null
    }
  }
}
```

### Error Responses

| Status | Message | When |
|---|---|---|
| 404 | `Application not found` | Application doesn't exist or doesn't belong to this student |

### Frontend Notes

- **Answers:** Show as a read-only "Your Responses" section — question text with their submitted answer below.
- **Rounds Timeline:** Render `all_rounds` as a vertical stepper/timeline:
  - Cross-reference with `round_results` by `round_id`:
    - Round has a matching `round_results` entry with `result_status = "passed"` → Green checkmark ✓
    - `result_status = "failed"` → Red cross ✗
    - `result_status = "pending"` → Orange clock ⏳
    - No matching `round_results` entry → Gray (upcoming)
  - Highlight the round matching `application.current_round_id` as "Current Round".
- **Placement card:** If `placement` is not `null`, show a prominent card:
  - "🎉 Congratulations! You've been placed."
  - Show `fulltime_package`, `fulltime_designation`, `placement_status`, `acceptance_status`.
  - For internships: show `internship_stipend` instead.
- **Withdraw button:** Only show if `application_status` is `pending`, `under_review`, or `shortlisted`.
- **`is_eligible: false`** with `eligibility_remarks` → show a banner "Note: You did not meet all eligibility criteria. Remarks: {eligibility_remarks}"

---

## API #158 — Withdraw Application

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `/api/student/withdraw_application/:applicationId` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | Yes (apiLimiter) |

### Path Parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `applicationId` | UUID | Yes | Application ID |

### Request Body

| Field | Type | Required | Input Type | Validation | Notes |
|---|---|---|---|---|---|
| `withdrawal_reason` | string | No | Textarea | Max 1000 chars | Optional reason for withdrawal |

### Postman Example

```json
PATCH /api/student/withdraw_application/e7f3a1b2-1234-5678-abcd-000000000001

{
  "withdrawal_reason": "Received a better offer elsewhere"
}
```

### Success Response (200)

```json
{
  "success": true,
  "message": "Application withdrawn successfully",
  "data": {
    "application_id": "uuid",
    "application_status": "withdrawn",
    "previous_status": "shortlisted",
    "last_updated_at": "2026-01-20T15:00:00Z",
    "job_title": "Software Engineer",
    "company_name": "TechCorp"
  }
}
```

### Error Responses

| Status | Message | When |
|---|---|---|
| 400 | `Application is already withdrawn` | Attempting to withdraw an already-withdrawn application |
| 400 | `Cannot withdraw application with status "rejected". Withdrawal is only allowed for: pending, under_review, shortlisted` | Application in a non-withdrawable status |
| 404 | `Application not found` | Application doesn't exist or doesn't belong to this student |

### Frontend Notes

- **Confirmation dialog:** "Are you sure you want to withdraw your application for **{job_title}** at **{company_name}**? This action cannot be undone."
- Include an optional `withdrawal_reason` textarea in the confirmation modal.
- **Only show the Withdraw button** when `application_status` is one of: `pending`, `under_review`, `shortlisted`.
- After success, update the application card to show "Withdrawn" with a gray badge and remove the Withdraw button.

---

## Integration Guide — Data Flow & Entity Relationships

### Student Journey Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     STUDENT JOURNEY                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. BROWSE JOBS                                                  │
│     └─▶ GET /get_available_jobs (API #151)                       │
│              │                                                   │
│              ▼                                                   │
│  2. VIEW JOB DETAILS                                             │
│     └─▶ GET /get_job_details/:jobId (API #152)                   │
│              │                                                   │
│              ├─▶ Check Eligibility (optional)                    │
│              │   └─▶ GET /check_job_eligibility/:jobId (#153)    │
│              │                                                   │
│              ├─▶ APPLY                                           │
│              │   └─▶ POST /apply_for_job/:jobId (#154)           │
│              │                                                   │
│              └─▶ OPT OUT                                         │
│                  └─▶ POST /deny_job/:jobId (#155)                │
│                                                                  │
│  3. TRACK APPLICATIONS                                           │
│     └─▶ GET /get_my_applications (API #156)                      │
│              │                                                   │
│              ▼                                                   │
│  4. VIEW APPLICATION DETAIL                                      │
│     └─▶ GET /get_application_details/:applicationId (#157)       │
│              │                                                   │
│              ├─▶ See round results, scores, remarks              │
│              ├─▶ See placement result (if selected)              │
│              └─▶ WITHDRAW (if eligible)                          │
│                  └─▶ PATCH /withdraw_application/:appId (#158)   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### College-Side Integration (Existing APIs)

These student APIs consume data created by college-side APIs:

| College Action | Student Sees |
|---|---|
| College creates Job Posting | Student sees it in Available Jobs (#151) |
| College adds Positions | Student selects one when applying (#154) |
| College sets Eligibility Criteria | Student sees it in Job Details (#152) and Eligibility Check (#153) |
| College adds Rounds | Student sees round timeline in Application Details (#157) |
| College adds Application Questions | Student answers when applying (#154) |
| College updates Round Results | Student sees scores/pass/fail in Application Details (#157) |
| College records Placement Result | Student sees placement card in Application Details (#157) |

### Related Existing Student APIs

| API | Relation |
|---|---|
| Student Profile APIs | Profile must be complete & approved before applying |
| Student Academic APIs | Academic data (CGPA, KTs, percentages) used in eligibility checks |
| Student Personal Info APIs | Gender data used in eligibility criteria |

---

## Key Frontend States Per Job

| State | Condition | UI |
|---|---|---|
| **Available** | `has_applied = false` AND `has_denied = false` | Show "Apply" button + "Not Interested" link |
| **Applied** | `has_applied = true` | Show status badge (pending/shortlisted/etc.) + "View Application" link |
| **Opted Out** | `has_denied = true` | Show gray "Opted Out" badge — no action buttons |
| **Deadline Passed** | `application_deadline < now` | Show "Deadline Passed" label — disable all action buttons |

### Application Status State Machine

```
                  ┌──────────────┐
   Apply ───────▶ │   PENDING    │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ UNDER_REVIEW │
                  └──────┬───────┘
                         │
                    ┌────┴────┐
                    ▼         ▼
             ┌───────────┐  ┌──────────┐
             │SHORTLISTED│  │ REJECTED │
             └─────┬─────┘  └──────────┘
                   │
              ┌────┴────┐
              ▼         ▼
       ┌──────────┐  ┌──────────┐
       │ SELECTED │  │ REJECTED │
       └────┬─────┘  └──────────┘
            │
            ▼
       ┌──────────┐
       │ OFFERED  │
       └──────────┘

  ┌────────────────────────────────┐
  │ WITHDRAWN can happen from:     │
  │  • PENDING                     │
  │  • UNDER_REVIEW                │
  │  • SHORTLISTED                 │
  └────────────────────────────────┘
```

---

## Edge Case Test Scenarios

Use these scenarios to verify API behavior during testing:

| # | Scenario | Expected | Status Code |
|---|---|---|---|
| 1 | Apply with missing required answer | Error: "Required question not answered" | 400 |
| 2 | Apply with invalid `question_id` | Error: "One or more answers reference invalid questions" | 400 |
| 3 | Apply when profile not approved | Error: "Profile is not approved" | 400 |
| 4 | Apply after deadline has passed | Error: "Application deadline has passed" | 400 |
| 5 | Apply when already applied | Error: "You have already applied to this job" | 400 |
| 6 | Apply after denying the job | Error: "You have already opted out of this job" | 400 |
| 7 | Apply when student is restricted | Error: "Student is restricted" | 400 |
| 8 | Apply with invalid `position_id` | Error: "Selected position not found or is no longer active" | 400 |
| 9 | Apply for unpublished job | Error: "Job is not published" | 400 |
| 10 | Apply for wrong passout year job | Error: "This job is for {year} passout year students only" | 400 |
| 11 | Deny after already applying | Error: "Cannot opt out — you have already applied to this job" | 400 |
| 12 | Deny same job twice | Error: "You have already opted out of this job" | 409 |
| 13 | Withdraw from rejected application | Error: "Cannot withdraw application with status rejected..." | 400 |
| 14 | Withdraw from selected application | Error: "Cannot withdraw application with status selected..." | 400 |
| 15 | Withdraw already withdrawn application | Error: "Application is already withdrawn" | 400 |
| 16 | View application belonging to another student | Error: "Application not found" | 404 |
| 17 | View job from another college | Error: "Job not found" | 404 |
| 18 | Search with special characters | Works correctly (parameterized queries) | 200 |
| 19 | Pagination: page beyond total | Returns empty array with correct pagination metadata | 200 |
| 20 | Empty answers array when job has no questions | Succeeds — application created without answers | 201 |
| 21 | Apply when `allow_applications` is false | Error: "This job is not currently accepting applications" | 400 |
| 22 | Required question with empty `answer_text` | Error: "Required question #N must have an answer" | 400 |
