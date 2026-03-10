# College Verification API Documentation

## Overview
Comprehensive verification/approval system for college users to review and approve/reject student profiles, experiences, achievements, and certificates. Supports single and bulk operations with rejection reasons, audit trail, and auto-reset on student edits.

**Base URL:** `/api/college`  
**Authentication:** JWT HttpOnly cookie (any college user role: collegeadmin, tpo, hod, teacher)

---

## Schema Changes (Run Migration)

Run `migrations/add_verification_fields.sql` to add the following columns:

| Table | New Columns |
|-------|------------|
| `students` | `profile_approval_status` (pending/approved/rejected), `approved_by` (UUID→users), `approved_at`, `profile_rejection_reason`, `rejected_at` |
| `student_experience` | `verification_status` (pending/approved/rejected), `verified_by` (UUID→users), `verified_at`, `rejection_reason`, `rejected_at` |
| `student_achievements` | Same as experience |
| `student_certificates` | Same as experience |

**Backward Compatibility:** Existing `profile_is_approved` (BOOLEAN) and `is_verified` (BOOLEAN) fields are kept and auto-synced.

---

## Verification Status Flow

```
[Student adds/updates item] → pending
          ↓
[College user reviews]
    ├── approved  → is_verified=true  / profile_is_approved=true
    └── rejected  → rejection_reason recorded
          ↓
[Student edits the item] → auto-resets to pending (clears verified_by, rejection_reason, etc.)
          ↓
[College user reviews again] → approved / rejected
```

---

## API Endpoints (13 new + 1 updated)

### 1. GET /get_pending_verification_counts

Dashboard counts of pending items across all 4 sections.

**Response:**
```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": {
    "profiles": 5,
    "experiences": 12,
    "achievements": 3,
    "certificates": 8,
    "total": 28
  }
}
```

---

### 2. GET /get_pending_profiles

Paginated list of students with `profile_complete=true` and `profile_approval_status='pending'`.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `search` | string | — | Search by name or email |
| `dept_id` | UUID | — | Filter by department |
| `student_passout_year` | number | — | Filter by passout year |
| `sort_by` | string | `created_at` | `created_at`, `updated_at`, `first_name`, `last_name` |
| `sort_order` | string | `DESC` | `ASC` or `DESC` |

**Response:**
```json
{
  "success": true,
  "message": "Pending profiles retrieved successfully",
  "data": [
    {
      "student_id": "uuid",
      "first_name": "Rahul",
      "last_name": "Sharma",
      "student_email": "rahul@college.edu",
      "dept_id": "uuid",
      "student_passout_year": 2026,
      "profile_complete": true,
      "profile_is_approved": false,
      "profile_approval_status": "pending",
      "profile_rejection_reason": null,
      "rejected_at": null,
      "dept_name": "Computer Science",
      "created_at": "2025-01-15T10:00:00Z",
      "updated_at": "2025-01-20T14:30:00Z"
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### 3. GET /get_pending_experiences

Paginated list of experiences with `verification_status='pending'`, joined with student info.

**Query Parameters:** Same as pending profiles.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "experience_id": "uuid",
      "student_id": "uuid",
      "company_name": "TCS",
      "position_title": "Software Intern",
      "employment_type": "internship",
      "start_date": "2024-06-01",
      "end_date": "2024-08-31",
      "verification_status": "pending",
      "first_name": "Rahul",
      "last_name": "Sharma",
      "student_email": "rahul@college.edu",
      "dept_name": "Computer Science"
    }
  ],
  "pagination": { "total": 12, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### 4. GET /get_pending_achievements

Same pattern as experiences. Returns achievements with `verification_status='pending'`.

---

### 5. GET /get_pending_certificates

Same pattern. Returns certificates with `verification_status='pending'`.

---

### 6. PATCH /verify_student_profile/:studentId

Approve or reject a student profile.

**URL Params:** `studentId` (UUID)

**Request Body:**
```json
// Approve
{ "action": "approved" }

// Reject (rejection_reason required)
{ "action": "rejected", "rejection_reason": "Academic information is incomplete" }
```

**Response (approved):**
```json
{
  "success": true,
  "message": "Student profile approved",
  "data": {
    "student_id": "uuid",
    "first_name": "Rahul",
    "last_name": "Sharma",
    "profile_complete": true,
    "profile_is_approved": true,
    "profile_approval_status": "approved",
    "approved_by": "uuid",
    "approved_at": "2025-01-20T15:00:00Z",
    "profile_rejection_reason": null,
    "rejected_at": null
  }
}
```

**Response (rejected):**
```json
{
  "success": true,
  "message": "Student profile sent back for corrections",
  "data": {
    "profile_is_approved": false,
    "profile_approval_status": "rejected",
    "profile_rejection_reason": "Academic information is incomplete",
    "rejected_at": "2025-01-20T15:00:00Z"
  }
}
```

**Validation Rules:**
- Cannot approve if `profile_complete = false` → 400 error
- `rejection_reason` is **required** when action is `rejected` → 422 validation error

---

### 7. PATCH /verify_experience/:experienceId

**URL Params:** `experienceId` (UUID)

**Request Body:**
```json
{ "action": "approved" }
// or
{ "action": "rejected", "rejection_reason": "Certificate image is not readable" }
```

**Response:** Returns the full experience record with updated `verification_status`, `verified_by`, `verified_at`, `is_verified`.

---

### 8. PATCH /verify_achievement/:achievementId

Same pattern as verify_experience.

---

### 9. PATCH /verify_certificate/:certificateId

Same pattern as verify_experience.

---

### 10. PATCH /bulk_verify_profiles

Bulk approve/reject multiple student profiles at once.

**Request Body:**
```json
{
  "ids": ["student-uuid-1", "student-uuid-2", "student-uuid-3"],
  "action": "approved"
}
// or
{
  "ids": ["student-uuid-1", "student-uuid-2"],
  "action": "rejected",
  "rejection_reason": "Incomplete information"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bulk verification completed",
  "data": {
    "requested": 3,
    "updated": 3,
    "updated_ids": ["student-uuid-1", "student-uuid-2", "student-uuid-3"]
  }
}
```

**Notes:**
- Maximum 100 IDs per request
- When bulk approving, only profiles with `profile_complete=true` are updated. `updated` count may be less than `requested` if some profiles are incomplete.
- When bulk rejecting, all valid IDs in the college are updated with the same rejection_reason.

---

### 11. PATCH /bulk_verify_experiences

Same pattern as bulk_verify_profiles. Body: `{ ids: [experienceId, ...], action, rejection_reason? }`

---

### 12. PATCH /bulk_verify_achievements

Same pattern. Body: `{ ids: [achievementId, ...], action, rejection_reason? }`

---

### 13. PATCH /bulk_verify_certificates

Same pattern. Body: `{ ids: [certificateId, ...], action, rejection_reason? }`

---

## Updated Existing API

### PATCH /approve_student_profile/:studentId (UPDATED)

**Old body:** `{ "profile_is_approved": true }` (DEPRECATED)  
**New body:** `{ "action": "approved" }` or `{ "action": "rejected", "rejection_reason": "..." }`

This existing endpoint now uses the same action-based schema. Response includes all new approval fields.

---

## Auto-Reset Behavior

When a student updates any of the following, the verification status is automatically reset to `pending`:

| Student Action | What Resets |
|---------------|-------------|
| Update personal info (`savePersonalInfo`) | `profile_approval_status` → pending |
| Update academic info (`saveAcademicInfo`) | `profile_approval_status` → pending |
| Update profile links (`saveProfileLinks`) | `profile_approval_status` → pending |
| Update experience (`updateExperience`) | That experience's `verification_status` → pending |
| Update achievement (`updateAchievement`) | That achievement's `verification_status` → pending |
| Update certificate (`updateCertificate`) | That certificate's `verification_status` → pending |

On reset:
- `is_verified` / `profile_is_approved` → `false`
- `verified_by` / `approved_by` → `NULL`
- `verified_at` / `approved_at` → `NULL`
- `rejection_reason` / `profile_rejection_reason` → `NULL`
- `rejected_at` → `NULL`

---

## Student-Side Response Changes

The following student APIs now return additional fields:

### Experience (GET /student/get_experience)
New fields in each experience object:
```json
{
  "verification_status": "pending",
  "verified_by": null,
  "verified_at": null,
  "rejection_reason": null,
  "rejected_at": null
}
```

### Achievements (GET /student/get_achievements)
Same new fields as experience.

### Certificates (GET /student/get_certificates)
Same new fields as experience.

### Student Full Profile (GET /college/get_student_full_profile/:studentId)
New fields in `profile_summary`:
```json
{
  "profile_summary": {
    "profile_approval_status": "pending",
    "approved_by": null,
    "approved_at": null,
    "profile_rejection_reason": null,
    "rejected_at": null
  }
}
```

---

## Error Responses

| Status | When |
|--------|------|
| 400 | Approving incomplete profile |
| 404 | Student/experience/achievement/certificate not found |
| 422 | Validation failed (missing action, missing rejection_reason on reject, invalid UUID) |

---

## Frontend Integration Guide

### Verification Center Dashboard
1. Call `GET /get_pending_verification_counts` to show overview cards
2. Each card links to its respective pending list

### Pending List Pages
1. Call the appropriate `GET /get_pending_*` endpoint with pagination/filters
2. Each row has "Approve" and "Reject" buttons
3. Reject button opens a modal for rejection_reason
4. Support checkbox multi-select for bulk operations
5. Bulk action bar appears when items are selected

### Student Profile View
1. Show `verification_status` badges on each experience/achievement/certificate
2. Show `profile_approval_status` in profile header
3. If rejected, show `rejection_reason` in a warning banner
4. After student edits, status auto-resets to "pending" (visually update the badge)
