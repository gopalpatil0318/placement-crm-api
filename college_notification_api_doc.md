# College Notifications API Documentation

> **APIs #96–#98** — College-side notification management  
> **Base URL:** `/api/college`  
> **Auth:** All endpoints require college admin authentication + role `COLLEGEADMIN` or `TPO`

---

## Table of Contents

1. [POST /send_notification](#1-send-notification)
2. [POST /send_bulk_notification](#2-send-bulk-notification)
3. [GET /get_sent_notifications](#3-get-sent-notifications)
4. [Notification Types Reference](#4-notification-types-reference)
5. [Bulk Filter Combinations](#5-bulk-filter-combinations)
6. [Auto-Trigger Integration Guide](#6-auto-trigger-integration-guide)
7. [Edge Case Test Scenarios](#7-edge-case-test-scenarios)

---

## 1. Send Notification

**`POST /api/college/send_notification`** — Rate limited

Send a notification to specific recipients (students or college users) by their IDs.

### Request Body

```json
{
  "recipient_type": "student",
  "recipient_ids": [
    "uuid-student-1",
    "uuid-student-2",
    "uuid-student-3"
  ],
  "title": "Round 2 Results Published",
  "body": "Your Round 2 results for TCS are now available. Please check your application status.",
  "notification_type": "round_result",
  "related_entity_type": "job",
  "related_entity_id": "uuid-job-id"
}
```

| Field                  | Type     | Required | Validation |
|------------------------|----------|----------|------------|
| `recipient_type`       | string   | Yes      | `student` or `user` |
| `recipient_ids`        | UUID[]   | Yes      | 1–100 items |
| `title`                | string   | Yes      | 2–200 characters |
| `body`                 | string   | No       | Max 3000 characters |
| `notification_type`    | string   | Yes      | One of 13 types (see [reference](#4-notification-types-reference)) |
| `related_entity_type`  | string   | No       | `job`, `application`, `round`, `placement`, `restriction`, `training`, `enrollment`, `student`, `user` |
| `related_entity_id`    | UUID     | No       | ID of the related entity for deep-linking |

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Notification sent successfully",
  "data": {
    "sent_count": 3,
    "invalid_count": 0,
    "notification_type": "round_result",
    "recipient_type": "student"
  }
}
```

### Error Responses

| Status | Message | Scenario |
|--------|---------|----------|
| `400`  | `"No matching recipients found for the given criteria"` | All IDs are invalid or don't belong to this college |
| `422`  | Validation error | Missing fields, invalid type, too many recipients, etc. |
| `429`  | Rate limited | Too many requests |

### Frontend Notes

- **Autocomplete**: Build a recipient picker that searches students/users by name, then passes UUIDs
- **`invalid_count`**: Show warning if > 0: `"3 sent, 1 invalid ID skipped"`
- **`related_entity_type` + `related_entity_id`**: Enables deep-linking on the student side (e.g., click notification → navigate to job details)
- Max 100 recipients per call — use bulk endpoint for larger audiences

---

## 2. Send Bulk Notification

**`POST /api/college/send_bulk_notification`** — Rate limited

Send notifications to a large group of recipients based on filter criteria. Supports deduplication when `related_entity_id` is provided.

### Request Body

```json
{
  "title": "New Job Posted: Software Engineer at Google",
  "body": "Google is hiring! Apply before the deadline. Check the job details in your dashboard.",
  "notification_type": "new_job_posted",
  "related_entity_type": "job",
  "related_entity_id": "uuid-job-id",
  "filters": {
    "recipient_type": "student",
    "dept_ids": ["uuid-cse-dept", "uuid-it-dept"],
    "passout_years": [2026, 2027],
    "student_status": "active",
    "profile_status": "approved",
    "is_profile_complete": true,
    "exclude_ids": ["uuid-student-to-skip"]
  }
}
```

### Filters Object

| Field                 | Type      | Required | Description |
|-----------------------|-----------|----------|-------------|
| `recipient_type`      | string    | **Yes**  | `student` or `user` |
| `dept_ids`            | UUID[]    | No       | Filter students by department(s) |
| `passout_years`       | number[]  | No       | Filter by passout year(s): `[2025, 2026]` |
| `student_status`      | string    | No       | `active`, `inactive`, or `graduated` |
| `profile_status`      | string    | No       | `approved`, `pending`, or `rejected` |
| `is_profile_complete` | boolean   | No       | `true` = 100% complete, `false` = incomplete |
| `user_roles`          | string[]  | No       | For `user` recipient type: `["tpo", "hod", "teacher"]` |
| `exclude_ids`         | UUID[]    | No       | Exclude specific IDs (max 500) |

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Bulk notifications sent successfully",
  "data": {
    "sent_count": 187,
    "skipped_count": 12,
    "total_eligible": 199,
    "notification_type": "new_job_posted",
    "recipient_type": "student"
  }
}
```

### Key Fields Explained

| Field            | Description |
|------------------|-------------|
| `sent_count`     | Notifications actually created |
| `skipped_count`  | Recipients who already had this exact notification (dedup by type + entity) |
| `total_eligible` | Total recipients matching filters |

### Error Responses

| Status | Message | Scenario |
|--------|---------|----------|
| `400`  | `"No matching recipients found for the given criteria"` | Filters match zero recipients |
| `422`  | Validation error | Missing filters, invalid types, etc. |
| `429`  | Rate limited | Too many requests |

### Frontend Notes

- **Preview count**: Consider adding a separate "preview" API or showing `total_eligible` after sending
- **Deduplication**: When `related_entity_id` is set, students who already received the same notification (type + entity combo) are skipped
- **No dedup for general**: When no `related_entity_id`, every call creates new notifications (useful for announcements)
- **Filter builder UI**: Render filter options based on `recipient_type` selection:
  - If `student` → show dept, year, status, profile fields
  - If `user` → show role filter only

---

## 3. Get Sent Notifications

**`GET /api/college/get_sent_notifications`**

List all notifications sent from this college, grouped by batch (same title + type + timestamp).

### Query Parameters

| Parameter           | Type   | Required | Default      | Description |
|---------------------|--------|----------|--------------|-------------|
| `notification_type` | string | No       | —            | Filter by one of 13 types |
| `recipient_type`    | string | No       | —            | `student` or `user` |
| `search`            | string | No       | —            | Search in title or body (max 100 chars) |
| `date_from`         | date   | No       | —            | ISO date: `2025-01-01` |
| `date_to`           | date   | No       | —            | ISO date, must be >= date_from |
| `sort_by`           | string | No       | `created_at` | `created_at`, `title`, `notification_type` |
| `sort_order`        | string | No       | `desc`       | `asc` or `desc` |
| `page`              | number | No       | `1`          | Page number |
| `limit`             | number | No       | `20`         | Items per page (1–100) |

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Sent notifications retrieved successfully",
  "data": {
    "notifications": [
      {
        "title": "Round 2 Results Published",
        "body": "Your Round 2 results for TCS are now available.",
        "notification_type": "round_result",
        "recipient_type": "student",
        "related_entity_type": "job",
        "related_entity_id": "uuid-job-id",
        "sent_at": "2025-02-15T10:30:00.000Z",
        "total_recipients": 45,
        "read_count": 38,
        "unread_count": 7
      }
    ],
    "summary": {
      "total_sent": 1250,
      "unique_recipients": 340,
      "total_read": 980,
      "total_unread": 270,
      "by_type": {
        "general": 50,
        "new_job_posted": 320,
        "deadline_reminder": 180,
        "round_result": 240,
        "offer_received": 45,
        "restriction_applied": 15,
        "training_enrollment": 60
      }
    }
  },
  "pagination": {
    "total": 28,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}
```

### Key Fields Explained

| Field              | Description |
|--------------------|-------------|
| `sent_at`          | Timestamp when the batch was sent (grouped to second precision) |
| `total_recipients` | How many individuals received this notification batch |
| `read_count`       | How many have read it |
| `unread_count`     | How many haven't read it yet |
| `summary`          | College-wide aggregate stats (independent of filters) |
| `summary.by_type`  | Breakdown by notification type across all time |

### Frontend Notes

- **Dashboard cards**: Use `summary.by_type` for notification analytics
- **Read rate**: Calculate `read_count / total_recipients * 100` for each batch
- **Date range picker**: Use `date_from` + `date_to` for date filtering
- Pagination applies to batches (grouped), not individual notification rows

---

## 4. Notification Types Reference

All 13 types from the database CHECK constraint, with descriptions and when to use each:

| Type | Display Name | Recipient | Trigger Scenario |
|------|-------------|-----------|-----------------|
| `new_job_posted` | New Job Posted | Student | When a job is published — notify eligible students by dept/year |
| `application_received` | Application Received | User (TPO) | When a student submits an application — notify admin |
| `application_status_changed` | Application Status Changed | Student | When admin changes application status (shortlisted, rejected, selected, offered) |
| `round_scheduled` | Round Scheduled | Student | When a new selection round is scheduled for a job |
| `round_result` | Round Result | Student | When round results are published (passed/failed/on_hold) |
| `offer_received` | Offer Received | Student | When placement record is created — student got an offer |
| `deadline_reminder` | Deadline Reminder | Student | Remind eligible students who haven't applied before deadline |
| `restriction_applied` | Restriction Applied | Student | When a restriction is placed on a student |
| `restriction_removed` | Restriction Removed | Student | When a restriction is deactivated or resolved |
| `training_enrollment` | Training Enrollment | Student | When enrolled in a training program |
| `training_completed` | Training Completed | Student | When training program is marked completed |
| `profile_incomplete` | Profile Incomplete | Student | Reminder to complete profile sections |
| `general` | General Announcement | Both | Custom announcements, college notices, etc. |

### Related Entity Types

| Entity Type    | Used With Notification Types |
|----------------|------------------------------|
| `job`          | `new_job_posted`, `deadline_reminder`, `round_scheduled` |
| `application`  | `application_received`, `application_status_changed` |
| `round`        | `round_scheduled`, `round_result` |
| `placement`    | `offer_received` |
| `restriction`  | `restriction_applied`, `restriction_removed` |
| `training`     | `training_enrollment`, `training_completed` |
| `enrollment`   | `training_enrollment` |
| `student`      | `profile_incomplete`, `application_received` |
| *(none)*       | `general` |

---

## 5. Bulk Filter Combinations

### Common Use Cases

**a) New Job Published — Notify All Eligible Active Students**
```json
{
  "title": "New Job: Software Engineer at Google",
  "body": "Google is hiring for 2026 batch. Apply now!",
  "notification_type": "new_job_posted",
  "related_entity_type": "job",
  "related_entity_id": "uuid-job-id",
  "filters": {
    "recipient_type": "student",
    "passout_years": [2026],
    "student_status": "active",
    "profile_status": "approved"
  }
}
```

**b) Deadline Reminder — Specific Departments**
```json
{
  "title": "Application Deadline Tomorrow: TCS",
  "body": "Don't miss the deadline! Apply by tomorrow 11:59 PM.",
  "notification_type": "deadline_reminder",
  "related_entity_type": "job",
  "related_entity_id": "uuid-tcs-job-id",
  "filters": {
    "recipient_type": "student",
    "dept_ids": ["uuid-cse", "uuid-it", "uuid-ece"],
    "passout_years": [2026],
    "student_status": "active"
  }
}
```

**c) Profile Incomplete — Nudge Students**
```json
{
  "title": "Complete Your Profile",
  "body": "Your profile is incomplete. Companies can't shortlist you without a complete profile.",
  "notification_type": "profile_incomplete",
  "filters": {
    "recipient_type": "student",
    "student_status": "active",
    "is_profile_complete": false
  }
}
```

**d) Restriction Applied — Single Student**
Use `POST /send_notification` instead (targeted):
```json
{
  "recipient_type": "student",
  "recipient_ids": ["uuid-restricted-student"],
  "title": "Placement Restriction Applied",
  "body": "A restriction has been placed on your account. Check your restrictions page for details.",
  "notification_type": "restriction_applied",
  "related_entity_type": "restriction",
  "related_entity_id": "uuid-restriction-id"
}
```

**e) Training Program Open — Target Departments**
```json
{
  "title": "New Training: Aptitude Workshop",
  "body": "A new aptitude training program is open for enrollment. Enroll now!",
  "notification_type": "training_enrollment",
  "related_entity_type": "training",
  "related_entity_id": "uuid-training-program",
  "filters": {
    "recipient_type": "student",
    "dept_ids": ["uuid-cse", "uuid-it"],
    "passout_years": [2026, 2027],
    "student_status": "active"
  }
}
```

**f) General Announcement — All Active Students**
```json
{
  "title": "Placement Drive Schedule Released",
  "body": "The placement drive schedule for 2025-26 is now available on the notice board.",
  "notification_type": "general",
  "filters": {
    "recipient_type": "student",
    "student_status": "active"
  }
}
```

**g) Notify TPOs/HODs — User Recipients**
```json
{
  "title": "Monthly Placement Report Available",
  "body": "The placement report for February 2026 has been generated.",
  "notification_type": "general",
  "filters": {
    "recipient_type": "user",
    "user_roles": ["tpo", "hod"]
  }
}
```

**h) Round Results — Notify Batch of Students**
Use `POST /send_notification` (targeted):
```json
{
  "recipient_type": "student",
  "recipient_ids": ["uuid-s1", "uuid-s2", "uuid-s3"],
  "title": "Round 1 Result: You Passed!",
  "body": "Congratulations! You have cleared Round 1 for Infosys. Prepare for Round 2.",
  "notification_type": "round_result",
  "related_entity_type": "round",
  "related_entity_id": "uuid-round-id"
}
```

---

## 6. Auto-Trigger Integration Guide

For future integration — call the notification service from existing services to automatically generate notifications when key events occur:

| Event | Where to Add | Notification Type | Recipients |
|-------|-------------|-------------------|------------|
| Job published | `job.service.js` → `updateJobStatus()` when status changes to `published` | `new_job_posted` | Eligible students (by dept/year/criteria) |
| Application submitted | `student/job.service.js` → `applyToJob()` | `application_received` | TPO/Admin users |
| Application status changed | `application.service.js` → `updateApplicationStatus()` | `application_status_changed` | The student whose status changed |
| Round scheduled | `jobRound.service.js` → `addRound()` | `round_scheduled` | Students in that job's shortlisted pool |
| Round result added | `roundResult.service.js` → `addRoundResult()` | `round_result` | The student(s) whose results were added |
| Offer created | `placement.service.js` → `createPlacement()` | `offer_received` | The placed student |
| Restriction applied | `restriction.service.js` → `addRestriction()` | `restriction_applied` | The restricted student |
| Restriction removed | `restriction.service.js` → `updateRestriction()` when `is_active = false` | `restriction_removed` | The student |
| Training enrollment open | `training.service.js` → `toggleTrainingStatus()` to `enrollment_open` | `training_enrollment` | Students in target depts/years |
| Training completed | `training.service.js` → `updateEnrollment()` when `completion_status = completed` | `training_completed` | The student |
| Deadline approaching | Cron job / manual trigger | `deadline_reminder` | Eligible students who haven't applied |
| Profile incomplete | Cron job / manual trigger | `profile_incomplete` | Students with < 100% profile completion |

**Pattern for integration:**
```javascript
// In any service file, after the main operation:
const notificationService = require('./notification.service');

// After creating a placement:
await notificationService.sendNotification(collegeId, userId, {
    recipient_type: 'student',
    recipient_ids: [studentId],
    title: `Offer Received: ${companyName}`,
    body: `Congratulations! You have received an offer from ${companyName}.`,
    notification_type: 'offer_received',
    related_entity_type: 'placement',
    related_entity_id: placementId,
});
```

---

## 7. Edge Case Test Scenarios

### Send Notification (#96)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Send to 1 valid student | `200`, `sent_count: 1`, `invalid_count: 0` |
| 2 | Send to 5 valid students | `200`, `sent_count: 5` |
| 3 | Send to mix of valid + invalid IDs | `200`, `sent_count` = valid, `invalid_count` > 0 |
| 4 | Send to all invalid IDs | `400` No matching recipients found |
| 5 | Send to student from different college | `400` (ID won't match college_id filter) |
| 6 | Send to user (`recipient_type: 'user'`) | `200` sends to users table |
| 7 | Send with `related_entity_type` + `related_entity_id` | `200`, fields stored for deep-linking |
| 8 | Send without `body` (title only) | `200`, body stored as null |
| 9 | Send with all 13 notification types | `200` for each |
| 10 | Send > 100 recipient_ids | `422` validation error |
| 11 | Empty `recipient_ids` array | `422` at least one required |
| 12 | Invalid notification_type | `422` must be one of 13 types |
| 13 | Title > 200 chars | `422` validation error |
| 14 | Body > 3000 chars | `422` validation error |
| 15 | Missing required fields | `422` validation error |

### Send Bulk Notification (#97)

| # | Test Case | Expected |
|---|-----------|----------|
| 16 | Active students in CSE, 2026 | `200`, `sent_count` = matching students |
| 17 | Multiple departments | `200`, includes students from all specified depts |
| 18 | Multiple passout years | `200`, `[2025, 2026]` both matched |
| 19 | Filter by `student_status=active` | Only active students receive |
| 20 | Filter by `profile_status=approved` | Only approved profiles |
| 21 | Filter by `is_profile_complete=false` | Only incomplete profiles |
| 22 | Filter by `is_profile_complete=true` | Only 100% complete profiles |
| 23 | Send to users with `user_roles=["tpo", "hod"]` | Only those roles receive |
| 24 | `exclude_ids` with some target IDs | Excluded students don't receive |
| 25 | Filters match zero students | `400` No matching recipients |
| 26 | Dedup: same type + entity sent twice | Second call: `sent_count` lower, `skipped_count` > 0 |
| 27 | General (no entity): sent twice | Both calls create notifications (no dedup) |
| 28 | No filters except `recipient_type` | All students/users in college |
| 29 | `exclude_ids` > 500 | `422` validation error |
| 30 | Missing `filters` object | `422` required |
| 31 | Missing `filters.recipient_type` | `422` required in filters |

### Get Sent Notifications (#98)

| # | Test Case | Expected |
|---|-----------|----------|
| 32 | No filters | All notification batches, latest first |
| 33 | Filter by `notification_type=general` | Only general notifications |
| 34 | Filter by `recipient_type=student` | Only student-targeted |
| 35 | Search by title keyword | Matching batches |
| 36 | Search by body keyword | Matching batches |
| 37 | Date range filter | Only notifications within range |
| 38 | `date_to` before `date_from` | `422` validation error |
| 39 | Sort by `title` ASC | Alphabetical order |
| 40 | Empty college (no notifications) | Empty array, all summary counts 0 |
| 41 | Summary `by_type` counts | Accurate per-type breakdown |
| 42 | `read_count` + `unread_count` per batch | Matches actual read status |
| 43 | Pagination with large dataset | Correct `totalPages` |
