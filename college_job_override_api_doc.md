# College Job Override API — Frontend Reference

## Overview

College staff (TPO, COLLEGEADMIN, TPC) can review students' eligibility override requests — either individually or in bulk. An approved override allows a student to apply for a job despite not meeting the standard eligibility criteria.

> **Multi-Year Passout Change:** `passout_year` (integer) has been replaced with `passout_years` (integer array). When creating or updating jobs, pass an array: `[2024, 2025]`.

---

## Authentication

All override endpoints require an authenticated session cookie.  
Required roles: `collegeadmin` **or** `tpo` **or** `tpc`

---

## Notification Flow

When a student submits an override request:
- All active users with roles `COLLEGEADMIN`, `TPO`, `TPC` in the college receive an **in-app notification** of type `eligibility_override_requested`.

When a request is reviewed (approved or rejected):
- The requesting student receives an in-app notification (`eligibility_override_approved` or `eligibility_override_rejected`).

---

## Endpoints

### 1. Get Override Requests for a Job

View all override requests for a specific job posting.

```
GET /api/college/get_job_override_requests/:jobId
```

**URL Params**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | UUID | ✅ | Job posting ID |

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | (all) | `pending` \| `approved` \| `rejected` |
| `dept_name` | string | — | Filter by student department |
| `sort_by` | string | `requested_at` | `requested_at` \| `student_name` \| `dept_name` \| `override_status` |
| `sort_order` | string | `desc` | `asc` \| `desc` |
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Max 100 per page |

**Success Response `200`**
```json
{
  "success": true,
  "message": "Job override requests retrieved successfully",
  "data": {
    "job": {
      "job_id": "uuid",
      "job_title": "Backend Developer",
      "company_name": "TechCorp",
      "passout_years": [2024, 2025],
      "application_deadline": "2025-02-01T00:00:00Z",
      "job_status": "published"
    },
    "summary": {
      "pending": 5,
      "approved": 2,
      "rejected": 1
    },
    "override_requests": [
      {
        "override_id": "uuid",
        "student_id": "uuid",
        "student_name": "Rahul Sharma",
        "enrollment_number": "EN2021001",
        "dept_name": "Computer Science",
        "student_passout_year": 2025,
        "overall_cgpa": "6.80",
        "total_live_kts": 1,
        "tenth_percentage": "82.00",
        "twelfth_or_diploma": "12th",
        "twelfth_percentage": "76.50",
        "override_status": "pending",
        "request_reason": "Although my CGPA is 6.8, I have 2 years of internship experience...",
        "ineligibility_reasons": "Minimum CGPA required: 7.5, yours: 6.8",
        "review_notes": null,
        "rejection_reason": null,
        "reviewed_by_name": null,
        "requested_at": "2025-01-15T10:00:00Z",
        "reviewed_at": null
      }
    ]
  },
  "pagination": {
    "total": 8,
    "page": 1,
    "limit": 20,
    "total_pages": 1
  }
}
```

---

### 2. Get All Override Requests (Dashboard)

Dashboard view across all jobs in the college.

```
GET /api/college/get_all_override_requests
```

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | (all) | `pending` \| `approved` \| `rejected` |
| `job_id` | UUID | — | Filter by specific job |
| `dept_name` | string | — | Filter by student department |
| `passout_year` | integer | — | Filter jobs that include this year in their `passout_years` |
| `date_from` | ISO date | — | Override requests from this date |
| `date_to` | ISO date | — | Override requests until this date |
| `sort_by` | string | `requested_at` | `requested_at` \| `student_name` \| `job_title` \| `override_status` |
| `sort_order` | string | `desc` | `asc` \| `desc` |
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Max 100 per page |

**Success Response `200`**
```json
{
  "success": true,
  "data": {
    "summary": {
      "pending": 12,
      "approved": 8,
      "rejected": 4
    },
    "override_requests": [
      {
        "override_id": "uuid",
        "student_id": "uuid",
        "student_name": "Rahul Sharma",
        "enrollment_number": "EN2021001",
        "dept_name": "Computer Science",
        "student_passout_year": 2025,
        "overall_cgpa": "6.80",
        "total_live_kts": 1,
        "job_id": "uuid",
        "job_title": "Backend Developer",
        "company_name": "TechCorp",
        "passout_years": [2024, 2025],
        "application_deadline": "2025-02-01T00:00:00Z",
        "override_status": "pending",
        "request_reason": "...",
        "ineligibility_reasons": "Minimum CGPA required: 7.5, yours: 6.8",
        "review_notes": null,
        "rejection_reason": null,
        "reviewed_by_name": null,
        "requested_at": "2025-01-15T10:00:00Z",
        "reviewed_at": null
      }
    ]
  },
  "pagination": {
    "total": 24,
    "page": 1,
    "limit": 20,
    "total_pages": 2
  }
}
```

---

### 3. Review Override Request (Single)

Approve or reject a single override request.

```
PATCH /api/college/review_override_request/:overrideId
```

**URL Params**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `overrideId` | UUID | ✅ | Override request ID |

**Request Body**
```json
{
  "action": "approve",
  "review_notes": "Good industry experience, approved as exception."
}
```

OR for rejection:

```json
{
  "action": "reject",
  "rejection_reason": "CGPA is significantly below the minimum threshold.",
  "review_notes": "No exceptional circumstances found."
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `action` | string | ✅ | `approve` or `reject` |
| `review_notes` | string | ❌ | Max 1000 chars — internal notes |
| `rejection_reason` | string | ✅ if `action=reject` | 5–500 chars — shown to student |

**Success Response `200`**
```json
{
  "success": true,
  "message": "Override request approved successfully",
  "data": {
    "override_id": "uuid",
    "student_id": "uuid",
    "student_name": "Rahul Sharma",
    "job_id": "uuid",
    "job_title": "Backend Developer",
    "override_status": "approved",
    "review_notes": "Good industry experience, approved as exception.",
    "rejection_reason": null,
    "reviewed_by": "uuid",
    "reviewed_at": "2025-01-16T09:30:00Z"
  }
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `404` | Override request not found (or belongs to different college) |
| `409` | Request is no longer pending (already reviewed) |

---

### 4. Bulk Review Override Requests

Approve or reject multiple override requests in one call.

```
POST /api/college/bulk_review_overrides
```

**Request Body**
```json
{
  "override_ids": [
    "uuid-1",
    "uuid-2",
    "uuid-3"
  ],
  "action": "approve",
  "review_notes": "Batch approved after committee review."
}
```

OR for bulk reject:

```json
{
  "override_ids": ["uuid-1", "uuid-2"],
  "action": "reject",
  "rejection_reason": "Does not meet minimum eligibility standards.",
  "review_notes": "Batch rejected."
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `override_ids` | UUID[] | ✅ | 1–100 override IDs |
| `action` | string | ✅ | `approve` or `reject` |
| `review_notes` | string | ❌ | Max 1000 chars |
| `rejection_reason` | string | ✅ if `action=reject` | 5–500 chars — sent to all students |

**Success Response `200`**
```json
{
  "success": true,
  "message": "Bulk approve: 3 processed, 1 skipped (already reviewed)",
  "data": {
    "action": "approve",
    "processed": 3,
    "skipped": 1,
    "skipped_ids": ["uuid-already-reviewed"]
  }
}
```

- `processed` — number actually updated (were pending)
- `skipped` — IDs not found or already reviewed
- `skipped_ids` — list of IDs that were skipped

---

## Multi-Year Passout — Job Endpoints (Updated)

The following note applies to **all job create/update endpoints** (`POST /create_job`, `PUT /update_job/:jobId`):

### Breaking Change: `passout_year` → `passout_years`

**Before:**
```json
{ "passout_year": 2025 }
```

**After:**
```json
{ "passout_years": [2025] }
```
or for multiple years:
```json
{ "passout_years": [2024, 2025] }
```

| Constraint | Rule |
|-----------|------|
| Type | Integer array |
| Min items | 1 |
| Max items | 5 |
| Year range | 2020–2040 |
| Required | ✅ on create, ❌ on update |

The filter parameter `passout_year` in `GET /get_all_jobs` still accepts a **single integer** — it finds any job where `passout_years` contains that year.

---

## Override Status Reference

| Status | Student Effect |
|--------|--------------|
| `pending` | Student is blocked from applying; waiting for decision |
| `approved` | Student CAN apply; override_id is linked to their application |
| `rejected` | Student is blocked permanently for this job |

---

## Notification Types (Reference)

| Type | Recipient | Trigger |
|------|-----------|---------|
| `eligibility_override_requested` | All active TPO/COLLEGEADMIN/TPC in college | Student submits request |
| `eligibility_override_approved` | The specific student | College approves |
| `eligibility_override_rejected` | The specific student | College rejects |
