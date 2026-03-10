# Profile Verification Filtering — Frontend Reference Document

## Overview

This document explains the **verification-aware profile filtering** system. Both the **student-side** and **college-side** full profile APIs now filter out unapproved experiences, achievements, and certificates from the profile view. College users get a **review mode** (`?review=true`) to see all items with their verification status. When a college user **approves a student's profile**, all pending items are **auto-approved** in a single transaction.

---

## 1. Verification Status Flow

```
┌──────────┐     Student edits      ┌──────────┐     College rejects     ┌──────────┐
│          │     after rejection     │          │     with reason         │          │
│ PENDING  │◄────────────────────────│ REJECTED │◄────────────────────────│ APPROVED │
│          │                         │          │                         │          │
└────┬─────┘                         └──────────┘                         └──────────┘
     │                                                                         ▲
     │              College approves individually                              │
     │              OR auto-approved when profile approved                     │
     └─────────────────────────────────────────────────────────────────────────┘
```

### States Explained

| Status | Meaning | Visible in Profile? |
|--------|---------|---------------------|
| `pending` | Newly added or edited by student, awaiting college review | **No** |
| `approved` | Verified by college user | **Yes** |
| `rejected` | Rejected by college user with reason | **No** |

### Auto-Reset Triggers
When a student **edits** an experience/achievement/certificate that was previously approved or rejected, its status auto-resets to `pending`. This ensures re-verification after changes.

### Auto-Approve Trigger
When a college user **approves a student's profile** (`PATCH /approve_student_profile/:studentId` with `action: "approved"`), ALL items with `verification_status = 'pending'` across experiences, achievements, and certificates are **auto-approved**. Items that were explicitly `rejected` remain rejected.

---

## 2. Student-Side API

### `GET /api/student/get_full_profile`

**Auth:** Student JWT cookie

**What changed:** The `experience`, `achievements`, and `certificates` arrays now **only contain approved items**. A new `verification_summary` object is included so the UI can show badge counts.

#### Response Structure

```json
{
  "success": true,
  "message": "Student profile retrieved successfully",
  "data": {
    "student": {
      "student_id": "uuid",
      "first_name": "Rahul",
      "middle_name": null,
      "last_name": "Sharma",
      "student_email": "rahul@college.edu",
      "dept_id": "uuid",
      "college_id": "uuid",
      "student_passout_year": 2026,
      "current_year": 3,
      "student_status": "active",
      "profile_complete": true,
      "profile_is_approved": false,
      "created_at": "2025-06-01T...",
      "updated_at": "2025-09-15T...",
      "dept_name": "Computer Science",
      "college_name": "XYZ Engineering College"
    },

    "personal_information": {
      "mobile_number": "9876543210",
      "birth_date": "2004-05-15",
      "gender": "Male",
      "blood_group": "O+",
      "category": "General",
      "nationality": "Indian",
      "father_name": "Suresh Sharma",
      "permanent_address": "123 Main St",
      "permanent_city": "Pune",
      "permanent_state": "Maharashtra",
      "permanent_pincode": "411001",
      "...": "all personal fields"
    },

    "academic_information": {
      "roll_number": "CS2023001",
      "enrollment_number": "EN123456",
      "admission_year": 2023,
      "tenth_percentage": 92.5,
      "tenth_board": "CBSE",
      "overall_cgpa": 8.75,
      "total_live_kts": 0,
      "total_dead_kts": 0,
      "...": "all academic fields"
    },

    "semester_grades": [
      {
        "semester_number": 1,
        "academic_year": "2023-24",
        "sgpa": 8.5,
        "cgpa": 8.5,
        "backlogs_in_semester": 0,
        "backlog_subjects": [],
        "semester_status": "completed"
      }
    ],

    "skills": [
      {
        "student_skill_id": "uuid",
        "skill_id": "uuid",
        "proficiency_level": "advanced",
        "skill_name": "JavaScript",
        "skill_category": "Programming"
      }
    ],

    "projects": [
      {
        "project_id": "uuid",
        "project_title": "E-Commerce Platform",
        "project_type": "personal",
        "technologies_used": ["React", "Node.js"],
        "start_date": "2025-01-01",
        "end_date": "2025-03-15",
        "is_featured": true,
        "...": "all project fields"
      }
    ],

    "experience": [
      {
        "experience_id": "uuid",
        "company_name": "TechCorp",
        "position_title": "Software Intern",
        "employment_type": "internship",
        "start_date": "2025-05-01",
        "end_date": "2025-07-31",
        "is_verified": true,
        "...": "all experience fields"
      }
    ],

    "achievements": [
      {
        "achievement_id": "uuid",
        "achievement_title": "Smart India Hackathon Winner",
        "achievement_type": "hackathon",
        "achievement_level": "national",
        "is_verified": true,
        "...": "all achievement fields"
      }
    ],

    "certificates": [
      {
        "certificate_id": "uuid",
        "certificate_name": "AWS Cloud Practitioner",
        "certificate_type": "certification",
        "issuing_organization": "Amazon Web Services",
        "is_verified": true,
        "...": "all certificate fields"
      }
    ],

    "activities": [
      {
        "activity_id": "uuid",
        "activity_name": "NSS Volunteer",
        "activity_type": "volunteer",
        "...": "all activity fields"
      }
    ],

    "profile_links": {
      "resume_url": "https://...",
      "linkedin_url": "https://linkedin.com/in/rahul",
      "github_url": "https://github.com/rahul",
      "bio": "Passionate developer...",
      "area_of_interest": ["Web Development", "Cloud Computing"],
      "...": "all profile link fields"
    },

    "profile_completion": {
      "total_percentage": 100,
      "is_complete": true,
      "sections": { "...": "section breakdown" }
    },

    "verification_summary": {
      "experience": { "pending": 2, "rejected": 1 },
      "achievements": { "pending": 0, "rejected": 0 },
      "certificates": { "pending": 1, "rejected": 0 }
    }
  }
}
```

#### Key Points for Frontend

1. **`experience`, `achievements`, `certificates` arrays** contain ONLY `approved` items — render these directly in the profile UI.
2. **`verification_summary`** tells you how many items are pending/rejected per type. Use this to show notification badges:
   - "2 experiences pending review"
   - "1 certificate pending review"
   - "1 experience rejected — tap to see details"
3. Students can see ALL their items (including pending/rejected) in their **individual management pages** (e.g., `GET /api/student/get_all_experience`). Those APIs are unchanged — they return all items with `verification_status` field.
4. The individual APIs already return `verification_status`, `rejection_reason`, `rejected_at` fields. Use `rejection_reason` to show what the college admin said about a rejection so the student can fix it.

#### UI Suggestions

```
┌─────────────────────────────────────────────┐
│  Profile Page                               │
│                                             │
│  ┌─ Experience ────────────────────────┐    │
│  │  ✅ TechCorp — Software Intern      │    │
│  │  ✅ DataInc — Data Analyst          │    │
│  │                                     │    │
│  │  ⚠️ 2 pending verification          │    │
│  │  ❌ 1 rejected — View Details       │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─ Certificates ──────────────────────┐    │
│  │  ✅ AWS Cloud Practitioner          │    │
│  │                                     │    │
│  │  ⚠️ 1 pending verification          │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

---

## 3. College-Side API

### `GET /api/college/get_student_full_profile/:studentId`

**Auth:** College user JWT cookie (any college role: collegeadmin, tpo, hod, teacher)  
**Role Required:** COLLEGEADMIN

#### Default Mode (No query param or `?review=false`)

Returns the same structure as the student API — only **approved** items in `experience`, `achievements`, `certificates` arrays, plus `verification_summary`.

**Use case:** When college admin is viewing the student's "public profile" as it would appear to companies/recruiters.

#### Review Mode (`?review=true`)

Returns **ALL** items regardless of verification status. Each item includes verification metadata fields.

**Use case:** When college admin is reviewing/verifying a student's profile — needs to see pending/rejected items to approve or reject them.

```
GET /api/college/get_student_full_profile/550e8400-e29b-41d4-a716-446655440000?review=true
```

#### Review Mode Response Differences

When `review=true`, the `experience`, `achievements`, and `certificates` arrays include ALL items with these additional fields per item:

```json
{
  "experience": [
    {
      "experience_id": "uuid",
      "company_name": "TechCorp",
      "position_title": "Software Intern",
      "verification_status": "approved",
      "is_verified": true,
      "verified_by": "user-uuid",
      "verified_at": "2025-09-10T14:30:00.000Z",
      "rejection_reason": null,
      "rejected_at": null,
      "...": "all experience fields"
    },
    {
      "experience_id": "uuid",
      "company_name": "StartupXYZ",
      "position_title": "Frontend Developer",
      "verification_status": "pending",
      "is_verified": false,
      "verified_by": null,
      "verified_at": null,
      "rejection_reason": null,
      "rejected_at": null,
      "...": "all experience fields"
    },
    {
      "experience_id": "uuid",
      "company_name": "FakeCompany",
      "position_title": "CEO",
      "verification_status": "rejected",
      "is_verified": false,
      "verified_by": "admin-uuid",
      "verified_at": null,
      "rejection_reason": "Company does not exist. Please provide valid experience.",
      "rejected_at": "2025-09-08T10:00:00.000Z",
      "...": "all experience fields"
    }
  ],

  "verification_summary": {
    "experience": { "pending": 1, "rejected": 1 },
    "achievements": { "pending": 3, "rejected": 0 },
    "certificates": { "pending": 0, "rejected": 1 }
  }
}
```

#### Key Points for Frontend

1. **Default mode** (`review=false`): Use for displaying the student profile as end-users/companies see it.
2. **Review mode** (`review=true`): Use when an admin clicks "Review Profile" or "Verify Student". Show all items with status badges:
   - `pending` → yellow/amber badge, show "Approve" and "Reject" buttons
   - `approved` → green badge/checkmark
   - `rejected` → red badge, show `rejection_reason`
3. **`verification_summary`** is always included (both modes) — use for header badges and counts.
4. In review mode, group items by status or show inline status badges — let the admin see everything at a glance.

#### Review Mode UI Suggestion

```
┌────────────────────────────────────────────────────────┐
│  Student Profile Review                                │
│  Rahul Sharma — CS — 2026                              │
│                                                        │
│  Profile Status: ⚠️ Pending Approval                   │
│  Completion: 100%                                      │
│                                                        │
│  ┌─ Experience (1 pending, 1 rejected) ────────────┐   │
│  │                                                  │   │
│  │  ✅ TechCorp — Software Intern                   │   │
│  │     Approved by Admin on Sep 10, 2025            │   │
│  │                                                  │   │
│  │  ⏳ StartupXYZ — Frontend Developer              │   │
│  │     [Approve]  [Reject]                          │   │
│  │                                                  │   │
│  │  ❌ FakeCompany — CEO                            │   │
│  │     Rejected: "Company does not exist"           │   │
│  │     Rejected on Sep 8, 2025                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                        │
│  ┌─ Actions ───────────────────────────────────────┐   │
│  │  [Approve Profile]  [Reject Profile]            │   │
│  │                                                  │   │
│  │  ℹ️ Approving profile will auto-approve all      │   │
│  │    pending experiences, achievements, and        │   │
│  │    certificates. Rejected items stay rejected.   │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

---

## 4. Profile Approval API (with Auto-Approve)

### `PATCH /api/college/approve_student_profile/:studentId`

**Auth:** College user JWT cookie  
**Role Required:** COLLEGEADMIN

#### Request Body

```json
{
  "action": "approved",
  "rejection_reason": null
}
```

Or for rejection:

```json
{
  "action": "rejected",
  "rejection_reason": "Please update your academic information with correct CGPA"
}
```

#### Approve Response (NEW: includes `auto_approved`)

```json
{
  "success": true,
  "message": "Student profile approved successfully",
  "data": {
    "student_id": "uuid",
    "first_name": "Rahul",
    "last_name": "Sharma",
    "student_email": "rahul@college.edu",
    "profile_complete": true,
    "profile_is_approved": true,
    "profile_approval_status": "approved",
    "approved_by": "admin-uuid",
    "approved_at": "2025-09-15T14:30:00.000Z",
    "profile_rejection_reason": null,
    "rejected_at": null,
    "updated_at": "2025-09-15T14:30:00.000Z",
    "auto_approved": {
      "experiences": 2,
      "achievements": 3,
      "certificates": 1
    }
  }
}
```

#### Reject Response (unchanged)

```json
{
  "success": true,
  "message": "Student profile rejected",
  "data": {
    "student_id": "uuid",
    "first_name": "Rahul",
    "last_name": "Sharma",
    "student_email": "rahul@college.edu",
    "profile_complete": true,
    "profile_is_approved": false,
    "profile_approval_status": "rejected",
    "approved_by": "admin-uuid",
    "approved_at": null,
    "profile_rejection_reason": "Please update academic info",
    "rejected_at": "2025-09-15T14:35:00.000Z",
    "updated_at": "2025-09-15T14:35:00.000Z"
  }
}
```

#### Key Points for Frontend

1. **`auto_approved`** object is only present when `action: "approved"`. Use it to show a success toast: "Profile approved! Auto-approved 2 experiences, 3 achievements, 1 certificate."
2. **Rejection** does NOT affect individual item verification status.
3. **Validation rules:**
   - `action` is required, must be `"approved"` or `"rejected"`
   - `rejection_reason` is required when `action: "rejected"`, max 500 chars
   - Cannot approve if `profile_complete` is `false` — will return 400 error

---

## 5. Individual Item Verification APIs (Unchanged)

These existing APIs are used in review mode to approve/reject individual items:

### Single Item Verify

| Method | Endpoint | Request Body |
|--------|----------|-------------|
| `PATCH` | `/api/college/verify_experience/:experienceId` | `{ "action": "approved" }` or `{ "action": "rejected", "rejection_reason": "..." }` |
| `PATCH` | `/api/college/verify_achievement/:achievementId` | Same format |
| `PATCH` | `/api/college/verify_certificate/:certificateId` | Same format |
| `PATCH` | `/api/college/verify_student_profile/:studentId` | Same format |

### Bulk Verify

| Method | Endpoint | Request Body |
|--------|----------|-------------|
| `PATCH` | `/api/college/bulk_verify_profiles` | `{ "ids": ["uuid1", "uuid2"], "action": "approved" }` |
| `PATCH` | `/api/college/bulk_verify_experiences` | Same format (max 100 IDs) |
| `PATCH` | `/api/college/bulk_verify_achievements` | Same format |
| `PATCH` | `/api/college/bulk_verify_certificates` | Same format |

### Pending Lists (for dedicated verification page)

| Method | Endpoint | Query Params |
|--------|----------|-------------|
| `GET` | `/api/college/get_pending_verification_counts` | None |
| `GET` | `/api/college/get_pending_profiles` | `page`, `limit`, `search`, `dept_id`, `passout_year`, `sort_by`, `sort_order` |
| `GET` | `/api/college/get_pending_experiences` | Same |
| `GET` | `/api/college/get_pending_achievements` | Same |
| `GET` | `/api/college/get_pending_certificates` | Same |

---

## 6. Student Individual Management APIs (Unchanged)

Students use these to manage their own items (see all statuses, edit rejected items):

| Method | Endpoint | Returns |
|--------|----------|---------|
| `GET` | `/api/student/get_all_experience` | All experiences with `verification_status` |
| `GET` | `/api/student/get_all_achievements` | All achievements with `verification_status` |
| `GET` | `/api/student/get_all_certificates` | All certificates with `verification_status` |
| `PUT` | `/api/student/update_experience/:id` | Auto-resets `verification_status` to `pending` |
| `PUT` | `/api/student/update_achievement/:id` | Same auto-reset |
| `PUT` | `/api/student/update_certificate/:id` | Same auto-reset |

### Fields Available for UI

Each item from these APIs includes:
```json
{
  "verification_status": "pending | approved | rejected",
  "is_verified": true | false,
  "verified_by": "uuid | null",
  "verified_at": "timestamp | null",
  "rejection_reason": "string | null",
  "rejected_at": "timestamp | null"
}
```

---

## 7. Complete Data Flow Diagram

```
STUDENT ADDS/EDITS ITEM
          │
          ▼
  ┌──────────────┐
  │ Status:      │
  │ PENDING      │ ◄─── Auto-reset on edit
  │ is_verified: │
  │ false        │
  └──────┬───────┘
         │
         │  Hidden from profile APIs
         │  Visible in student management APIs
         │  Visible in college review mode (?review=true)
         │  Listed in college pending verification page
         │
         ▼
  College Reviews Item
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────┐
│APPROVED│ │ REJECTED │
│        │ │          │
│Visible │ │Hidden    │
│in all  │ │from      │
│profile │ │profile   │
│APIs    │ │APIs      │
│        │ │          │
│        │ │Student   │
│        │ │sees      │
│        │ │reason in │
│        │ │mgmt page │
└────────┘ └────┬─────┘
                │
                │ Student edits the item
                │
                ▼
         Back to PENDING
         (auto-reset)
```

### Profile Approval Flow

```
College opens student profile
          │
          ├── ?review=false (default)
          │   └── Sees only approved items
          │       (like a company would see)
          │
          └── ?review=true
              └── Sees ALL items with status badges
                  │
                  ├── Reviews individual items
                  │   ├── Approve ✅
                  │   └── Reject ❌ (with reason)
                  │
                  └── Approves entire profile
                      │
                      ├── Student profile_approval_status → 'approved'
                      ├── All PENDING items → auto-approved
                      ├── All REJECTED items → stay rejected
                      └── Response includes auto_approved counts
```

---

## 8. Error Responses

| Status | When | Response |
|--------|------|----------|
| `400` | Approve profile but `profile_complete = false` | `"Cannot approve an incomplete profile"` |
| `400` | Reject without `rejection_reason` | `"Rejection reason is required when rejecting"` |
| `404` | Student not found or wrong college | `"Student not found"` |
| `422` | Invalid request body / params | Joi validation error details |

---

## 9. Summary of Changes from Previous Version

| What | Before | After |
|------|--------|-------|
| Student `get_full_profile` experience/achievements/certificates | All items returned | Only `approved` items + `verification_summary` counts |
| College `get_student_full_profile` (default) | All items returned | Only `approved` items + `verification_summary` counts |
| College `get_student_full_profile?review=true` | N/A (new) | All items with verification fields + `verification_summary` |
| `approve_student_profile` (approve action) | Only updates student table | Also auto-approves all pending items in 3 tables + returns `auto_approved` counts |
| `approve_student_profile` (reject action) | Only updates student table | Same as before (no change to items) |
