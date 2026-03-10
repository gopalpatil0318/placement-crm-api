# Student Placement Results (Own) — Frontend Documentation

## Overview

These 3 endpoints allow authenticated students to view their own placement offers, accept an offer, or reject an offer. All endpoints are under `/api/student/` and require the student's JWT HttpOnly cookie.

**Base URL:** `/api/student`  
**Auth:** JWT HttpOnly cookie (set during student login)  
**Content-Type:** `application/json`

---

## Table of Contents

1. [API #159 — List My Placements](#api-159--list-my-placements)
2. [API #160 — Accept Placement Offer](#api-160--accept-placement-offer)
3. [API #161 — Reject Placement Offer](#api-161--reject-placement-offer)
4. [Integration Guide — Data Flow & Entity Relationships](#integration-guide--data-flow--entity-relationships)
5. [Key Frontend States Per Placement](#key-frontend-states-per-placement)
6. [Edge Case Test Scenarios](#edge-case-test-scenarios)

---

## API #159 — List My Placements

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/student/get_my_placements` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | None (read endpoint) |

### Query Parameters

| Parameter | Type | Required | Default | Input Type | Notes |
|---|---|---|---|---|---|
| `placement_status` | string | No | — | Dropdown / Tabs: `offered`, `accepted`, `rejected`, `joined`, `cancelled` | Filter by placement status |
| `placement_type` | string | No | — | Dropdown: `full-time`, `internship`, `both` | Filter by type |
| `acceptance_status` | string | No | — | Dropdown: `accepted`, `rejected`, `pending` | Filter by acceptance status |
| `sort_by` | string | No | `created_at` | Dropdown: `created_at`, `fulltime_package`, `placement_status`, `company_name` | Sort column |
| `sort_order` | string | No | `desc` | Toggle: `asc` / `desc` | Sort direction |
| `page` | number | No | `1` | Pagination control | Min: 1 |
| `limit` | number | No | `10` | Pagination control | Range: 1–100 |

### Success Response (200)

```json
{
  "success": true,
  "message": "Placement records retrieved successfully",
  "data": {
    "placements": [
      {
        "placement_id": "uuid",
        "application_id": "uuid",
        "placement_type": "full-time",
        "fulltime_package": 1200000,
        "fulltime_designation": "SDE-1",
        "fulltime_joining_date": "2026-07-01",
        "internship_stipend": null,
        "internship_duration": null,
        "internship_start_date": null,
        "offer_letter_url": "https://storage.example.com/offer.pdf",
        "offer_letter_verified": true,
        "placement_status": "offered",
        "acceptance_status": "pending",
        "passout_year": 2026,
        "created_at": "2026-02-20T10:00:00Z",
        "updated_at": "2026-02-20T10:00:00Z",
        "company_id": "uuid",
        "company_name": "TechCorp",
        "company_website": "https://techcorp.com",
        "industry_type": "IT",
        "job_id": "uuid",
        "job_title": "Software Engineer",
        "job_type": "full-time",
        "job_location": "Mumbai",
        "position_id": "uuid",
        "position_name": "Backend Developer"
      }
    ],
    "status_summary": {
      "total": 2,
      "offered": 1,
      "accepted": 1,
      "rejected": 0,
      "joined": 0,
      "cancelled": 0
    }
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1
  }
}
```

### Frontend Notes

- **Status tabs:** Use `status_summary` to render filter tabs with badge counts:
  - `All (2) | Offered (1) | Accepted (1) | Joined (0)`
  - The summary is always based on ALL placements (unaffected by filters).
- **Offer card layout:** Each placement should be a card showing:
  - Company name, logo (if available), job title, position name
  - Package/stipend prominently displayed
  - Designation, joining date / start date
  - Offer letter link (with "Verified ✓" badge if `offer_letter_verified` is true)
  - Status badge (offered/accepted/rejected/joined/cancelled)
- **Action buttons:** Show "Accept" and "Reject" buttons only when `placement_status === "offered"` AND `acceptance_status === "pending"`.
- **Color coding for `placement_status`:**

  | Status | Color | Badge |
  |---|---|---|
  | `offered` | Blue/Purple | 📋 Offer Received |
  | `accepted` | Green | ✓ Accepted |
  | `rejected` | Red | ✗ Rejected |
  | `joined` | Dark Green | 🎉 Joined |
  | `cancelled` | Gray | ↩ Cancelled |

- **Full-time vs Internship:** Conditionally display:
  - `placement_type === "full-time"` → Show package, designation, joining date
  - `placement_type === "internship"` → Show stipend, duration, start date
  - `placement_type === "both"` → Show all fields
- **Offer letter:** If `offer_letter_url` is present, show a "View Offer Letter" link/button. Show a green "Verified" badge if `offer_letter_verified` is true.

---

## API #160 — Accept Placement Offer

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `/api/student/accept_placement/:placementId` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | Yes (apiLimiter) |

### Path Parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `placementId` | UUID | Yes | Placement record ID |

### Request Body

**No request body required.** This is a simple acceptance action.

### Postman Example

```
PATCH /api/student/accept_placement/e7f3a1b2-1234-5678-abcd-000000000001

(No body needed)
```

### Success Response (200)

```json
{
  "success": true,
  "message": "Congratulations! Offer accepted successfully",
  "data": {
    "placement_id": "uuid",
    "placement_status": "accepted",
    "acceptance_status": "accepted",
    "previous_status": "offered",
    "previous_acceptance": "pending",
    "updated_at": "2026-03-01T14:00:00Z",
    "job_title": "Software Engineer",
    "company_name": "TechCorp",
    "position_name": "Backend Developer",
    "fulltime_package": 1200000,
    "fulltime_designation": "SDE-1",
    "fulltime_joining_date": "2026-07-01",
    "internship_stipend": null
  }
}
```

### Error Responses

| Status | Message | When |
|---|---|---|
| 400 | `Cannot accept a placement with status "accepted". Only offers with status "offered" can be accepted` | Placement already processed (accepted/joined/cancelled) |
| 400 | `This offer has already been rejected and cannot be accepted` | Student previously rejected this offer |
| 404 | `Placement record not found` | Placement doesn't exist or doesn't belong to this student |
| 409 | `You have already accepted this offer` | Duplicate accept attempt |

### Frontend Notes

- **Confirmation dialog:** "Are you sure you want to accept the offer for **{job_title}** at **{company_name}**?"
  - Show package/stipend details in the confirmation dialog
  - Include a note: "By accepting this offer, you confirm your intent to join."
- **Only show the Accept button** when `placement_status === "offered"` AND `acceptance_status === "pending"`.
- **After success:** Show a congratulations message/toast. Update the card status to "Accepted" (green). Hide both Accept and Reject buttons.
- No form inputs are needed — just the confirmation dialog and the PATCH call.

---

## API #161 — Reject Placement Offer

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `/api/student/reject_placement/:placementId` |
| **Auth** | JWT (HttpOnly cookie) — student only |
| **Rate Limit** | Yes (apiLimiter) |

### Path Parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `placementId` | UUID | Yes | Placement record ID |

### Request Body

| Field | Type | Required | Input Type | Validation | Notes |
|---|---|---|---|---|---|
| `rejection_reason` | string | **Yes** | Textarea | Min 3 chars, Max 1000 chars | Reason for declining the offer |

### Postman Example

```json
PATCH /api/student/reject_placement/e7f3a1b2-1234-5678-abcd-000000000001

{
  "rejection_reason": "Received a better offer from another company with higher package and preferred location"
}
```

### Success Response (200)

```json
{
  "success": true,
  "message": "Offer declined",
  "data": {
    "placement_id": "uuid",
    "placement_status": "rejected",
    "acceptance_status": "rejected",
    "previous_status": "offered",
    "previous_acceptance": "pending",
    "rejection_reason": "Received a better offer from another company with higher package and preferred location",
    "updated_at": "2026-03-01T15:00:00Z",
    "job_title": "Software Engineer",
    "company_name": "TechCorp",
    "position_name": "Backend Developer"
  }
}
```

### Error Responses

| Status | Message | When |
|---|---|---|
| 400 | `Cannot reject a placement with status "accepted". Only offers with status "offered" can be rejected` | Placement already processed (accepted/joined/cancelled) |
| 400 | `This offer has already been accepted and cannot be rejected` | Student previously accepted this offer |
| 400 | Joi validation: `Rejection reason is required` | Missing or empty `rejection_reason` |
| 400 | Joi validation: `Rejection reason must be at least 3 characters` | Reason too short |
| 404 | `Placement record not found` | Placement doesn't exist or doesn't belong to this student |
| 409 | `You have already rejected this offer` | Duplicate reject attempt |

### Frontend Notes

- **Confirmation dialog with form:** "Are you sure you want to decline the offer for **{job_title}** at **{company_name}**? This action cannot be undone."
  - Include a required `rejection_reason` textarea (min 3 chars, max 1000 chars).
  - Show a warning: "Once rejected, this offer cannot be accepted later."
- **Frontend validations:**
  - `rejection_reason` is mandatory — disable the "Confirm Reject" button until text is entered.
  - Min 3 characters — show inline validation error.
  - Max 1000 characters — show character counter.
- **Only show the Reject button** when `placement_status === "offered"` AND `acceptance_status === "pending"`.
- **After success:** Update the card status to "Rejected" (red badge). Hide both Accept and Reject buttons.

---

## Integration Guide — Data Flow & Entity Relationships

### How Placement Records Are Created

Placement records are **created by college admins** (not by students). The student can only **view, accept, or reject** their own placements.

```
┌──────────────────────────────────────────────────────────────────────┐
│                     PLACEMENT LIFECYCLE                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  COLLEGE SIDE (Existing APIs):                                       │
│    1. Student applies to a job (API #154)                            │
│    2. College processes rounds → Student passes/fails                │
│    3. College updates application status to "selected"               │
│    4. College creates placement record (POST /college/placements)    │
│       └─▶ placement_status = "offered", acceptance_status = "pending"│
│                                                                      │
│  STUDENT SIDE (These APIs):                                          │
│    5. Student views placement offers (GET /get_my_placements #159)   │
│    6. Student decides:                                               │
│       ├─▶ Accept (PATCH /accept_placement/:id #160)                  │
│       │   └─▶ placement_status = "accepted"                          │
│       │       acceptance_status = "accepted"                         │
│       │                                                              │
│       └─▶ Reject (PATCH /reject_placement/:id #161)                  │
│           └─▶ placement_status = "rejected"                          │
│               acceptance_status = "rejected"                         │
│                                                                      │
│  COLLEGE SIDE (Post-acceptance):                                     │
│    7. College can later update to "joined" (when student joins)      │
│    8. College can cancel if needed                                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Related APIs & Data Dependencies

| Related API | Relationship |
|---|---|
| **API #154 — Apply for Job** | Student application → selected → placement record created by college |
| **API #157 — Get Application Details** | Application detail already shows `placement` data if it exists — complements this API |
| **College Placement APIs** | College creates the placement record; student can only accept/reject |
| **College Round Results** | Student must pass rounds before being selected → placement created |

### Entity Relationships

```
students (student_id)
    │
    ├── student_applications (student_id, job_id)
    │       │
    │       └── placement_results (application_id, student_id, job_id)
    │               │
    │               ├── companies (company_id)
    │               ├── job_postings (job_id)
    │               └── job_positions (position_id) [optional]
    │
    └── (student can have multiple placements from different jobs)
```

### Navigation Flow

```
Student Dashboard
    └── My Placements Page (API #159)
            │
            ├── Offer Card (placement_status = "offered")
            │       ├── [Accept] → Confirmation Modal → API #160
            │       └── [Reject] → Rejection Form Modal → API #161
            │
            ├── Accepted Card (placement_status = "accepted")
            │       └── [View Details] (read-only, with joining date info)
            │
            └── Status Tabs: All | Offered | Accepted | Rejected | Joined
```

### Cross-Reference with Job Application Flow

The placement data is also available inside API #157 (Get Application Details) as the `placement` object. The key difference:

| API | Purpose | When to Use |
|---|---|---|
| **API #157** | Full application detail (answers, rounds, placement) | When viewing from "My Applications" page |
| **API #159** | Dedicated placement list with status summary | When viewing from "My Placements" page |
| **API #160/161** | Accept/Reject actions | Only from placement cards (either page) |

---

## Key Frontend States Per Placement

| State | Condition | UI |
|---|---|---|
| **Pending Decision** | `placement_status = "offered"` AND `acceptance_status = "pending"` | Show "Accept" (green) and "Reject" (red) buttons |
| **Accepted** | `placement_status = "accepted"` | Green badge, no action buttons, show joining details |
| **Rejected** | `placement_status = "rejected"` | Red badge, no action buttons |
| **Joined** | `placement_status = "joined"` | Dark green "Joined" badge with 🎉 |
| **Cancelled** | `placement_status = "cancelled"` | Gray "Cancelled by College" badge |

### Placement Status State Machine (Student Perspective)

```
                     ┌───────────────┐
  College creates ──▶│    OFFERED    │
                     │ (pending)     │
                     └───┬───────┬───┘
                         │       │
              Student    │       │    Student
              Accepts    │       │    Rejects
                         ▼       ▼
                  ┌──────────┐ ┌──────────┐
                  │ ACCEPTED │ │ REJECTED │
                  └────┬─────┘ └──────────┘
                       │          (terminal)
              College  │
              confirms │
                       ▼
                  ┌──────────┐
                  │  JOINED  │
                  └──────────┘

  ┌────────────────────────────────────────┐
  │ CANCELLED can happen at any stage      │
  │ by college admin (student cannot)      │
  └────────────────────────────────────────┘
```

---

## Edge Case Test Scenarios

| # | Scenario | Expected | Status Code |
|---|---|---|---|
| 1 | Accept an offer with status "offered" | Success — status changes to "accepted" | 200 |
| 2 | Accept an already accepted placement | Error: "You have already accepted this offer" | 409 |
| 3 | Accept a rejected placement | Error: "This offer has already been rejected and cannot be accepted" | 400 |
| 4 | Accept a cancelled placement | Error: "Cannot accept a placement with status cancelled..." | 400 |
| 5 | Accept a joined placement | Error: "Cannot accept a placement with status joined..." | 400 |
| 6 | Reject an offer with status "offered" | Success — status changes to "rejected" | 200 |
| 7 | Reject an already rejected placement | Error: "You have already rejected this offer" | 409 |
| 8 | Reject an accepted placement | Error: "This offer has already been accepted and cannot be rejected" | 400 |
| 9 | Reject without `rejection_reason` | Joi validation error: "Rejection reason is required" | 400 |
| 10 | Reject with 1-char reason | Joi validation error: "Rejection reason must be at least 3 characters" | 400 |
| 11 | View placement belonging to another student | Error: "Placement record not found" | 404 |
| 12 | View placement from another college | Error: "Placement record not found" | 404 |
| 13 | Accept/Reject with invalid UUID format | Express param parsing / 404 | 404 |
| 14 | Filter by placement_status=offered | Returns only offered placements, status_summary still shows all | 200 |
| 15 | Filter by invalid status value | Joi validation error | 400 |
| 16 | Pagination: page beyond total | Returns empty array with correct pagination metadata | 200 |
| 17 | Student with no placements | Returns empty array, all status_summary counts = 0 | 200 |
| 18 | Sort by fulltime_package descending | Highest package first | 200 |
