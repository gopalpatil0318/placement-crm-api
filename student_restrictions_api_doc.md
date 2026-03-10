# Student Restrictions (Own) — Frontend Documentation

## Overview

These 2 endpoints allow authenticated students to view their own restrictions (bars, warnings, suspensions, probation) and submit an appeal against active restrictions. All endpoints are under `/api/student/` and require the student's JWT HttpOnly cookie.

**Base URL:** `/api/student`  
**Auth:** JWT HttpOnly cookie (set during student login)  
**Content-Type:** `application/json`

**No new database tables required** — the existing `student_restrictions` table already has `appeal_submitted`, `appeal_notes`, and `appeal_resolved_at` columns built-in.

---

## Table of Contents

1. [API #162 — List My Restrictions](#api-162--list-my-restrictions)
2. [API #163 — Appeal Restriction](#api-163--appeal-restriction)
3. [Integration Guide — Data Flow & Entity Relationships](#integration-guide--data-flow--entity-relationships)
4. [Key Frontend States Per Restriction](#key-frontend-states-per-restriction)
5. [Edge Case Test Scenarios](#edge-case-test-scenarios)

---

## API #162 — List My Restrictions

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/student/get_my_restrictions` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | None (read endpoint) |

### Query Parameters

| Parameter | Type | Required | Default | Input Type | Notes |
|---|---|---|---|---|---|
| `is_active` | string | No | — | Dropdown / Tabs: `true`, `false` | Filter active vs resolved restrictions |
| `restriction_type` | string | No | — | Dropdown: `bar_from_placements`, `bar_from_company`, `probation`, `warning`, `temporary_suspension` | Filter by type |
| `sort_by` | string | No | `created_at` | Dropdown: `created_at`, `applied_on`, `valid_until`, `restriction_type` | Sort column |
| `sort_order` | string | No | `desc` | Toggle: `asc` / `desc` | Sort direction |
| `page` | number | No | `1` | Pagination control | Min: 1 |
| `limit` | number | No | `10` | Pagination control | Range: 1–100 |

### Success Response (200)

```json
{
  "success": true,
  "message": "Restrictions retrieved successfully",
  "data": {
    "restrictions": [
      {
        "restriction_id": "uuid",
        "restriction_type": "bar_from_placements",
        "reason": "Missed mandatory pre-placement training session",
        "details": "Student was absent for 3 training sessions without prior notice",
        "applied_on": "2026-02-15",
        "valid_until": "2026-04-15",
        "is_active": true,
        "restricted_by_name": "Dr. Sharma (TPO)",
        "appeal_submitted": false,
        "appeal_notes": null,
        "appeal_resolved_at": null,
        "resolved_by_name": null,
        "is_expired": false,
        "can_appeal": true,
        "created_at": "2026-02-15T10:00:00Z",
        "updated_at": "2026-02-15T10:00:00Z"
      },
      {
        "restriction_id": "uuid",
        "restriction_type": "warning",
        "reason": "Unprofessional behavior during company visit",
        "details": null,
        "applied_on": "2026-01-10",
        "valid_until": null,
        "is_active": false,
        "restricted_by_name": "Prof. Patel",
        "appeal_submitted": true,
        "appeal_notes": "I was unwell that day and couldn't attend. Medical certificate attached to my profile.",
        "appeal_resolved_at": "2026-01-20T14:00:00Z",
        "resolved_by_name": "Dr. Sharma (TPO)",
        "is_expired": false,
        "can_appeal": false,
        "created_at": "2026-01-10T09:00:00Z",
        "updated_at": "2026-01-20T14:00:00Z"
      }
    ],
    "summary": {
      "total_restrictions": 3,
      "active_count": 1,
      "resolved_count": 2,
      "appeals_submitted": 1,
      "appeals_resolved": 1,
      "appeals_pending": 0
    }
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1
  }
}
```

### Frontend Notes

- **Status tabs:** Use `summary` to render filter tabs with badge counts:
  - `All (3) | Active (1) | Resolved (2)`
- **Restriction type labels:** Map the type values to user-friendly labels:

  | `restriction_type` | Display Label | Color | Severity |
  |---|---|---|---|
  | `bar_from_placements` | Barred from Placements | Red | High |
  | `bar_from_company` | Barred from Company | Orange | High |
  | `temporary_suspension` | Temporary Suspension | Red | High |
  | `probation` | On Probation | Amber | Medium |
  | `warning` | Warning | Yellow | Low |

- **Key computed fields:**
  - `can_appeal` — Show "Submit Appeal" button only when this is `true` (restriction is active AND no appeal submitted yet)
  - `is_expired` — Show "Expired" badge if `valid_until` has passed (restriction may still be active in DB but is effectively expired)
- **Appeal status indicators:**
  - `appeal_submitted = false` → "No appeal" (show appeal button if `can_appeal`)
  - `appeal_submitted = true` AND `appeal_resolved_at = null` → "Appeal Pending ⏳" (amber badge)
  - `appeal_submitted = true` AND `appeal_resolved_at != null` → "Appeal Reviewed ✓" (show resolved_by_name and date)
- **Card layout suggestions:**
  - Top: Restriction type badge + active/resolved status
  - Middle: Reason text + details (if any)
  - Bottom-left: Applied on date, Valid until date (or "No expiry")
  - Bottom-right: Restricted by name
  - Footer: Appeal section (button or status)
- Active restrictions always appear first (sorted by `is_active DESC` by default).

---

## API #163 — Appeal Restriction

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/student/appeal_restriction/:restrictionId` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | Yes (apiLimiter) |

### Path Parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `restrictionId` | UUID | Yes | Restriction ID |

### Request Body

| Field | Type | Required | Input Type | Validation | Notes |
|---|---|---|---|---|---|
| `appeal_notes` | string | **Yes** | Textarea | Min 10 chars, Max 2000 chars | Student's explanation/justification for the appeal |

### Postman Example

```json
POST /api/student/appeal_restriction/e7f3a1b2-1234-5678-abcd-000000000001

{
  "appeal_notes": "I was unable to attend the training session due to a medical emergency. I have uploaded my medical certificate to my profile documents. I request the placement cell to kindly reconsider this restriction."
}
```

### Success Response (200)

```json
{
  "success": true,
  "message": "Appeal submitted successfully. You will be notified of the outcome",
  "data": {
    "restriction_id": "uuid",
    "restriction_type": "bar_from_placements",
    "reason": "Missed mandatory pre-placement training session",
    "is_active": true,
    "appeal_submitted": true,
    "appeal_notes": "I was unable to attend the training session due to a medical emergency...",
    "applied_on": "2026-02-15",
    "valid_until": "2026-04-15",
    "restricted_by_name": "Dr. Sharma (TPO)",
    "updated_at": "2026-03-08T12:00:00Z"
  }
}
```

### Error Responses

| Status | Message | When |
|---|---|---|
| 400 | `Cannot appeal a restriction that is no longer active` | Restriction is already resolved/deactivated |
| 400 | Joi: `Appeal notes are required` | Missing or empty `appeal_notes` |
| 400 | Joi: `Appeal notes must be at least 10 characters — please explain your appeal clearly` | Appeal text too short |
| 404 | `Restriction not found` | Restriction doesn't exist or doesn't belong to this student |
| 409 | `An appeal has already been submitted for this restriction` | Duplicate appeal attempt |

### Frontend Notes

- **Appeal form (modal/page):**
  - Show the restriction details at the top (type, reason, applied_on, valid_until) as read-only context.
  - Single textarea input for `appeal_notes`:
    - Label: "Explain your appeal"
    - Placeholder: "Please provide a detailed explanation of why you believe this restriction should be reconsidered..."
    - Min 10 characters — show inline validation
    - Max 2000 characters — show character counter (e.g., "45/2000")
    - Required — disable Submit button until valid
- **Confirmation dialog:** "Submit appeal for this restriction? Once submitted, you cannot modify or resubmit the appeal."
- **After success:**
  - Close the modal
  - Update the restriction card to show "Appeal Pending ⏳"
  - Hide the "Submit Appeal" button (replaced by appeal status)
  - Show success toast with the message
- **This is a one-time action** — student cannot edit or resubmit an appeal. Warn clearly.
- **Only show the Appeal button** when `can_appeal === true` (restriction is active AND no prior appeal).

---

## Integration Guide — Data Flow & Entity Relationships

### How Restrictions Work

Restrictions are **created by college admins/TPO** (via college-side APIs). Students can only **view their own restrictions** and **submit one appeal per restriction**.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     RESTRICTION LIFECYCLE                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  COLLEGE SIDE (Existing APIs):                                           │
│    1. Admin adds restriction                                             │
│       POST /college/add_student_restriction/:studentId                   │
│       └─▶ is_active=true, appeal_submitted=false                         │
│                                                                          │
│  STUDENT SIDE (These APIs):                                              │
│    2. Student views own restrictions                                     │
│       GET /student/get_my_restrictions (#162)                             │
│                                                                          │
│    3. Student submits appeal (one-time per restriction)                   │
│       POST /student/appeal_restriction/:restrictionId (#163)             │
│       └─▶ appeal_submitted=true, appeal_notes stored                     │
│                                                                          │
│  COLLEGE SIDE (Existing APIs):                                           │
│    4. Admin reviews appeal and resolves/updates restriction              │
│       PATCH /college/update_restriction/:restrictionId                   │
│       └─▶ is_active=false, resolved_by set, appeal_resolved_at set       │
│       OR: Admin rejects appeal but keeps restriction active              │
│                                                                          │
│  STUDENT SIDE:                                                           │
│    5. Student sees updated status via GET /get_my_restrictions            │
│       └─▶ appeal_resolved_at is now set, resolved_by_name shown          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Impact on Job Applications

Active restrictions of type `bar_from_placements` or `temporary_suspension` **block** the student from applying to jobs. This check is already implemented in:

- **API #153** (Check Job Eligibility) → `blockers[]` will include "Student is restricted"
- **API #154** (Apply for Job) → Will return 400 with "Student is restricted"

So the restriction page should clearly communicate this to students and link them to the appeal mechanism.

### Related APIs

| API | Relationship |
|---|---|
| **College API #35** — Add Restriction | Creates the restriction record that students see |
| **College API #36** — Get All Restrictions | Admin views all active restrictions (can see appeals) |
| **College API #37** — Get Student Restrictions | Admin views specific student's restrictions |
| **College API #38** — Update Restriction | Admin resolves appeal / deactivates restriction |
| **Student API #153** — Check Job Eligibility | Shows restriction as a blocker if active |
| **Student API #154** — Apply for Job | Rejects application if student has active bar/suspension |

### Entity Relationships

```
students (student_id)
    │
    └── student_restrictions (student_id, college_id)
            │
            ├── restricted_by → users (user_id) — who imposed the restriction
            ├── resolved_by → users (user_id) — who resolved it (nullable)
            │
            └── Fields used by student:
                ├── restriction_type, reason, details — what & why
                ├── applied_on, valid_until — when
                ├── is_active — current status
                ├── appeal_submitted — has student appealed?
                ├── appeal_notes — student's appeal text
                └── appeal_resolved_at — when admin reviewed the appeal
```

### Navigation Flow

```
Student Dashboard
    └── My Restrictions Page (API #162)
            │
            ├── Active Restriction Card
            │       ├── [View Details] — expand to see reason, details, dates
            │       └── [Submit Appeal] (if can_appeal=true) → Appeal Modal → API #163
            │
            ├── Restriction with Pending Appeal
            │       └── "Appeal Pending ⏳" badge (no action buttons)
            │
            ├── Resolved Restriction Card
            │       └── "Resolved ✓" badge with resolved_by_name and date
            │
            └── Tabs: All | Active | Resolved
```

---

## Key Frontend States Per Restriction

| State | Condition | UI |
|---|---|---|
| **Active — No Appeal** | `is_active=true`, `appeal_submitted=false` | Red "Active" badge + "Submit Appeal" button |
| **Active — Appeal Pending** | `is_active=true`, `appeal_submitted=true`, `appeal_resolved_at=null` | Red "Active" badge + Amber "Appeal Pending ⏳" |
| **Active — Appeal Reviewed** | `is_active=true`, `appeal_submitted=true`, `appeal_resolved_at!=null` | Red "Active" badge + "Appeal Reviewed — Not Resolved" |
| **Resolved** | `is_active=false` | Green "Resolved ✓" badge + resolved_by_name |
| **Expired** | `is_active=true`, `is_expired=true` | Amber "Expired" badge (technically still active but past valid_until) |

---

## Edge Case Test Scenarios

| # | Scenario | Expected | Status Code |
|---|---|---|---|
| 1 | List restrictions — student with no restrictions | Empty array, all summary counts = 0 | 200 |
| 2 | List restrictions — filter `is_active=true` | Only active restrictions returned; summary still shows all | 200 |
| 3 | List restrictions — filter by restriction_type | Only matching type returned | 200 |
| 4 | Appeal an active restriction (first time) | Success — `appeal_submitted` set to true | 200 |
| 5 | Appeal the same restriction again | Error: "An appeal has already been submitted..." | 409 |
| 6 | Appeal a resolved (inactive) restriction | Error: "Cannot appeal a restriction that is no longer active" | 400 |
| 7 | Appeal without `appeal_notes` | Joi validation: "Appeal notes are required" | 400 |
| 8 | Appeal with 5-char notes | Joi validation: "Appeal notes must be at least 10 characters..." | 400 |
| 9 | Appeal a restriction belonging to another student | Error: "Restriction not found" | 404 |
| 10 | Appeal a restriction from another college | Error: "Restriction not found" | 404 |
| 11 | Invalid restriction UUID format | 404 | 404 |
| 12 | Filter by invalid `restriction_type` value | Joi validation error | 400 |
| 13 | Pagination: page beyond total | Empty array with correct pagination metadata | 200 |
| 14 | Sort by `valid_until` ascending | Soonest-expiring first | 200 |
| 15 | Restriction with no `valid_until` (permanent) | `valid_until: null`, `is_expired: false` | 200 |
| 16 | Restriction with past `valid_until` | `is_expired: true` (computed) | 200 |
