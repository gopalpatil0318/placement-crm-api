# Student Job Override API — Frontend Reference

## Overview

When a student is ineligible for a job (CGPA, KT count, department, gender, or education gap), they cannot apply directly. Instead, they may submit a formal **eligibility override request** to the college.

> **Passout year mismatch is NOT overridable.** If a student's passout year is not in the job's target years, they cannot apply regardless.

---

## Authentication

All endpoints require a authenticated session cookie (`access_token`).  
The student must be logged in as role `student`.

---

## Workflow

```
1. Student checks eligibility
   GET /check_job_eligibility/:jobId
       ↓ is_eligible: false
2. Student checks override eligibility
   GET /check_override_eligibility/:jobId
       ↓ can_request_override: true
3. Student submits override request
   POST /request_job_override/:jobId
       ↓ override_status: 'pending'
       ↓ College staff (TPO/COLLEGEADMIN/TPC) are notified
4. College reviews request → approved / rejected
5. If approved: student can apply normally
   POST /apply_for_job/:jobId
```

---

## Endpoints

### 1. Check Override Eligibility

Check whether this student can request an override for a specific job.

```
GET /api/student/check_override_eligibility/:jobId
```

**URL Params**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | UUID | ✅ | Job posting ID |

**Success Response `200`**
```json
{
  "success": true,
  "message": "Override eligibility check completed",
  "data": {
    "job_id": "uuid",
    "job_title": "Backend Developer",
    "company_name": "TechCorp",
    "year_eligible": true,
    "criteria_eligible": false,
    "is_fully_eligible": false,
    "ineligibility_reasons": [
      "Minimum CGPA required: 7.5, yours: 6.8"
    ],
    "can_request_override": true,
    "override_request": null,
    "application": null
  }
}
```

**`can_request_override` is `false` when:**
- Student is already fully eligible
- Student's passout year is not in `passout_years` (year mismatch cannot be overridden)
- Student has already applied
- Student already has an existing override request (any status)
- Job is not published / deadline passed
- Student profile not approved

**`override_request` (when already submitted)**
```json
{
  "override_id": "uuid",
  "override_status": "pending",
  "requested_at": "2025-01-15T10:00:00Z",
  "reviewed_at": null,
  "review_notes": null,
  "rejection_reason": null
}
```

---

### 2. Request Eligibility Override

Submit a formal override request. Requires the student to explain why they should be considered despite not meeting criteria.

```
POST /api/student/request_job_override/:jobId
```

**URL Params**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | UUID | ✅ | Job posting ID |

**Request Body**
```json
{
  "request_reason": "Although my CGPA is 6.8, I have 2 years of relevant internship experience at ABC Corp and have completed industry certifications that demonstrate my capability for this role."
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `request_reason` | string | ✅ | 20–2000 characters |

**Success Response `201`**
```json
{
  "success": true,
  "message": "Eligibility override request submitted successfully",
  "data": {
    "override_id": "uuid",
    "job_id": "uuid",
    "job_title": "Backend Developer",
    "company_name": "TechCorp",
    "override_status": "pending",
    "request_reason": "Although my CGPA...",
    "ineligibility_reasons": "Minimum CGPA required: 7.5, yours: 6.8",
    "requested_at": "2025-01-15T10:00:00Z"
  }
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `400` | Passout year mismatch (not overridable), deadline passed, job not published, profile not approved, student is already eligible (no need to request), already applied |
| `404` | Job not found |
| `409` | Override request already exists for this job |

---

### 3. Get My Override Requests

List the student's own override requests with optional filters.

```
GET /api/student/get_my_override_requests
```

**Query Parameters**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `status` | string | ❌ | (all) | `pending` \| `approved` \| `rejected` |
| `sort_order` | string | ❌ | `desc` | `asc` \| `desc` (by requested_at) |
| `page` | integer | ❌ | `1` | Page number |
| `limit` | integer | ❌ | `10` | Results per page (max 50) |

**Success Response `200`**
```json
{
  "success": true,
  "message": "Override requests retrieved successfully",
  "data": [
    {
      "override_id": "uuid",
      "job_id": "uuid",
      "job_title": "Backend Developer",
      "company_name": "TechCorp",
      "industry_type": "Technology",
      "job_type": "full-time",
      "application_deadline": "2025-02-01T00:00:00Z",
      "override_status": "approved",
      "request_reason": "Although my CGPA...",
      "ineligibility_reasons": "Minimum CGPA required: 7.5, yours: 6.8",
      "review_notes": "Good experience background, approved.",
      "rejection_reason": null,
      "reviewed_by_name": "Prof. Sharma",
      "requested_at": "2025-01-15T10:00:00Z",
      "reviewed_at": "2025-01-16T09:30:00Z"
    }
  ],
  "pagination": {
    "total": 3,
    "page": 1,
    "limit": 10,
    "total_pages": 1
  }
}
```

---

## Override Status Reference

| Status | Meaning | Student Action |
|--------|---------|---------------|
| `pending` | Awaiting college review | Wait for decision |
| `approved` | College approved — you can apply | Use `POST /apply_for_job/:jobId` |
| `rejected` | Denied with reason | No further action; review reason |

---

## How Apply-For-Job Handles Overrides

When calling `POST /apply_for_job/:jobId`, the system automatically:

1. Runs eligibility check
2. If ineligible → checks for approved override
   - **Approved override found** → application allowed (override ID is linked to application)
   - **Pending override** → blocked with message: *"Your override request is pending college review"*
   - **Rejected override** → blocked with rejection reason
   - **No override** → blocked with: *"Please submit an override request for college review"*

---

## Notes

- A student can only have **one** override request per job (unique constraint).
- Once rejected, the student cannot re-apply or re-request for the same job.
- The override approval does not expire — once approved, the student may apply until the job deadline.
- Auto-notifications are sent to all active TPO/COLLEGEADMIN/TPC staff in the college when a request is submitted.
