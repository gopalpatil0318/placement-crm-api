# Student Notifications API Documentation

> **APIs #168–#171** — Student-side notification endpoints  
> **Base URL:** `/api/student`  
> **Auth:** All endpoints require student authentication (JWT HttpOnly cookie)

---

## Table of Contents

1. [GET /get_my_notifications](#1-get-my-notifications)
2. [GET /get_unread_notification_count](#2-get-unread-notification-count)
3. [PATCH /mark_notification_read/:notificationId](#3-mark-notification-as-read)
4. [PATCH /mark_all_notifications_read](#4-mark-all-notifications-as-read)
5. [Notification Types Reference](#5-notification-types-reference)
6. [Deep-Linking Guide](#6-deep-linking-guide)
7. [Polling Strategy](#7-polling-strategy)
8. [Integration with College-Side APIs](#8-integration-with-college-side-apis)
9. [Edge Case Test Scenarios](#9-edge-case-test-scenarios)

---

## 1. Get My Notifications

**`GET /api/student/get_my_notifications`**

List all notifications for the authenticated student, with optional filters for read status and type.

### Query Parameters

| Parameter           | Type    | Required | Default      | Description |
|---------------------|---------|----------|--------------|-------------|
| `is_read`           | boolean | No       | —            | `true` = only read, `false` = only unread, omit = all |
| `notification_type` | string  | No       | —            | Filter by one of 13 types |
| `sort_by`           | string  | No       | `created_at` | Only `created_at` supported |
| `sort_order`        | string  | No       | `desc`       | `asc` or `desc` |
| `page`              | number  | No       | `1`          | Page number |
| `limit`             | number  | No       | `20`         | Items per page (1–100) |

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": [
    {
      "notification_id": "uuid",
      "title": "Round 1 Result: You Passed!",
      "body": "Congratulations! You have cleared Round 1 for Infosys. Prepare for Round 2.",
      "notification_type": "round_result",
      "related_entity_type": "round",
      "related_entity_id": "uuid-round-id",
      "is_read": false,
      "read_at": null,
      "created_at": "2025-02-15T10:30:00.000Z"
    },
    {
      "notification_id": "uuid",
      "title": "New Job Posted: Google",
      "body": "Google is hiring for Software Engineer. Apply now!",
      "notification_type": "new_job_posted",
      "related_entity_type": "job",
      "related_entity_id": "uuid-job-id",
      "is_read": true,
      "read_at": "2025-02-15T11:00:00.000Z",
      "created_at": "2025-02-14T09:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 24,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}
```

### Notification Object Fields

| Field                 | Type    | Description |
|-----------------------|---------|-------------|
| `notification_id`     | UUID    | Unique identifier for the notification |
| `title`               | string  | Notification title (always present) |
| `body`                | string \| null | Detailed notification body (may be null) |
| `notification_type`   | string  | One of 13 types (see [reference](#5-notification-types-reference)) |
| `related_entity_type` | string \| null | Entity type for deep-linking |
| `related_entity_id`   | UUID \| null | Entity ID for deep-linking |
| `is_read`             | boolean | Whether the student has read this notification |
| `read_at`             | string \| null | Timestamp when marked as read |
| `created_at`          | string  | When the notification was sent |

### Frontend Notes

- **Tabs**: Use `is_read` parameter for "All / Unread / Read" tab UI
- **Type filter**: Dropdown with notification type options
- **Unread indicator**: Show dot/badge on unread items (`is_read === false`)
- **Click behavior**: Mark as read on click + navigate using deep-link (see [section 6](#6-deep-linking-guide))
- **Empty state**: Show "No notifications yet" with illustration

---

## 2. Get Unread Notification Count

**`GET /api/student/get_unread_notification_count`**

Returns the count of unread notifications. Use this for the notification bell badge.

### Query Parameters

None.

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Unread count retrieved",
  "data": {
    "unread_count": 7
  }
}
```

### Frontend Notes

- **Badge**: Show `unread_count` as a badge on the notification bell icon
- **Hide badge**: When `unread_count === 0`, hide the badge entirely
- **Polling**: Call this endpoint periodically to keep the badge updated (see [polling strategy](#7-polling-strategy))
- **Max display**: Show `"99+"` if `unread_count > 99`
- **Lightweight**: This is a single COUNT query — safe to call frequently

---

## 3. Mark Notification as Read

**`PATCH /api/student/mark_notification_read/:notificationId`** — Rate limited

Mark a single notification as read.

### Path Parameters

| Parameter        | Type | Description |
|------------------|------|-------------|
| `notificationId` | UUID | Notification to mark as read |

### Request Body

None required.

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Notifications marked as read",
  "data": {
    "notification_id": "uuid",
    "title": "Round 1 Result: You Passed!",
    "notification_type": "round_result",
    "is_read": true,
    "read_at": "2025-02-15T12:00:00.000Z"
  }
}
```

### Error Responses

| Status | Message | Scenario |
|--------|---------|----------|
| `404`  | `"Notification not found"` | Invalid ID, belongs to another student, or different college |
| `429`  | Rate limited | Too many requests |

### Frontend Notes

- **Auto-mark on click**: Call this when a notification is clicked/opened
- **Already read**: Calling on an already-read notification still returns `200` (idempotent — it just re-sets `read_at`)
- **Update local state**: After success, update `is_read` to `true` in local notification list and decrement badge count

---

## 4. Mark All Notifications as Read

**`PATCH /api/student/mark_all_notifications_read`** — Rate limited

Mark all unread notifications as read in one operation.

### Request Body

None required.

### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Notifications marked as read",
  "data": {
    "marked_count": 7
  }
}
```

### Frontend Notes

- **"Mark all as read" button**: Place in notification panel header
- **`marked_count`**: Show toast: `"7 notifications marked as read"`
- **If 0**: Show `"No unread notifications"` — no error, just `marked_count: 0`
- **Update state**: Set all local notification `is_read` to `true`, clear badge count to `0`
- **Disable button**: When no unread notifications exist

---

## 5. Notification Types Reference

| Type | Display Name | Icon Suggestion | Description |
|------|-------------|-----------------|-------------|
| `new_job_posted` | New Job | 💼 Briefcase | A new job matching your profile has been posted |
| `application_received` | Application | 📋 Clipboard | *(Admin-side)* A student submitted an application |
| `application_status_changed` | Status Update | 🔄 Refresh | Your application status has changed |
| `round_scheduled` | Round Scheduled | 📅 Calendar | A selection round has been scheduled |
| `round_result` | Round Result | 📊 Chart | Your round result is available |
| `offer_received` | Offer Received | 🎉 Celebration | You received a placement offer! |
| `deadline_reminder` | Deadline Reminder | ⏰ Clock | Application deadline approaching |
| `restriction_applied` | Restriction | 🚫 Block | A restriction has been applied to your account |
| `restriction_removed` | Restriction Removed | ✅ Check | A restriction has been removed |
| `training_enrollment` | Training | 📚 Book | Training program enrollment update |
| `training_completed` | Training Complete | 🎓 Graduation | Training program completed |
| `profile_incomplete` | Profile Alert | ⚠️ Warning | Your profile is incomplete |
| `general` | Announcement | 📢 Megaphone | General college announcement |

### Suggested Color Coding

| Notification Type | Color | Priority |
|-------------------|-------|----------|
| `offer_received` | Green | High |
| `restriction_applied` | Red | High |
| `round_result` | Blue | Medium |
| `deadline_reminder` | Orange | Medium |
| `application_status_changed` | Blue | Medium |
| `new_job_posted` | Purple | Medium |
| `round_scheduled` | Teal | Normal |
| `training_enrollment` | Indigo | Normal |
| `training_completed` | Green | Normal |
| `restriction_removed` | Green | Normal |
| `profile_incomplete` | Orange | Normal |
| `general` | Gray | Low |

---

## 6. Deep-Linking Guide

Use `related_entity_type` and `related_entity_id` to navigate the user to the relevant page when they click a notification.

### Routing Map

| `related_entity_type` | Notification Types | Navigate To |
|-----------------------|-------------------|-------------|
| `job` | `new_job_posted`, `deadline_reminder` | `/jobs/:related_entity_id` |
| `application` | `application_status_changed` | `/my-applications/:related_entity_id` |
| `round` | `round_scheduled`, `round_result` | `/my-applications` (with round details) |
| `placement` | `offer_received` | `/my-placements/:related_entity_id` |
| `restriction` | `restriction_applied`, `restriction_removed` | `/my-restrictions` |
| `training` | `training_enrollment`, `training_completed` | `/trainings/:related_entity_id` |
| `enrollment` | `training_enrollment` | `/my-trainings/:related_entity_id` |
| *(null)* | `general`, `profile_incomplete` | `/notifications` (stay on notification page) |

### Example Implementation

```javascript
function handleNotificationClick(notification) {
  // Mark as read first
  await api.patch(`/student/mark_notification_read/${notification.notification_id}`);
  
  // Navigate based on entity type
  const { related_entity_type, related_entity_id } = notification;
  
  switch (related_entity_type) {
    case 'job':
      navigate(`/jobs/${related_entity_id}`);
      break;
    case 'application':
      navigate(`/my-applications/${related_entity_id}`);
      break;
    case 'placement':
      navigate(`/my-placements/${related_entity_id}`);
      break;
    case 'restriction':
      navigate('/my-restrictions');
      break;
    case 'training':
    case 'enrollment':
      navigate(`/my-trainings`);
      break;
    default:
      // Stay on notifications page
      break;
  }
}
```

---

## 7. Polling Strategy

Since the system uses polling (no WebSocket/SSE), here's the recommended approach:

### Unread Count Badge

```javascript
// Poll every 30 seconds for unread count
const POLL_INTERVAL = 30000;

useEffect(() => {
  const fetchUnreadCount = async () => {
    const res = await api.get('/student/get_unread_notification_count');
    setBadgeCount(res.data.data.unread_count);
  };
  
  fetchUnreadCount(); // Initial fetch
  const interval = setInterval(fetchUnreadCount, POLL_INTERVAL);
  
  return () => clearInterval(interval);
}, []);
```

### When to Refresh Full List

- After marking a notification as read
- After marking all as read
- When notification panel is opened
- After polling detects badge count increase

### Optimization Tips

- Only poll when the browser tab is active (`document.visibilityState === 'visible'`)
- Increase interval when idle (e.g., 60s after 5 min inactivity)
- Use the unread count endpoint for polling (lightweight), not the full list

---

## 8. Integration with College-Side APIs

These student endpoints work in conjunction with the college notification APIs (#96–#98):

| College Action | Student Effect |
|---------------|----------------|
| `POST /send_notification` with `recipient_type: 'student'` | Notification appears in student's list |
| `POST /send_bulk_notification` with student filters | All matching students see notification |
| College sends `notification_type: 'new_job_posted'` | Student sees job notification → deep-links to job page |
| College sends `notification_type: 'round_result'` | Student sees result notification → deep-links to application |
| College sends `notification_type: 'restriction_applied'` | Student sees restriction alert → navigates to restrictions |
| College sends `notification_type: 'general'` | Student sees announcement in notification list |

### Data Flow

```
College Admin/TPO
    │
    ├─ POST /send_notification (to specific students)
    │   └─ Creates notification rows in DB
    │
    ├─ POST /send_bulk_notification (by filters)
    │   └─ Creates batch notification rows in DB
    │
    └─ GET /get_sent_notifications (view sent history + read rates)

Student
    │
    ├─ GET /get_unread_notification_count (badge polling)
    │   └─ Returns count of is_read=false
    │
    ├─ GET /get_my_notifications (full list with filters)
    │   └─ Returns paginated notifications
    │
    ├─ PATCH /mark_notification_read/:id (single)
    │   └─ Sets is_read=true, read_at=NOW()
    │
    └─ PATCH /mark_all_notifications_read (bulk)
        └─ Sets all unread to read
```

---

## 9. Edge Case Test Scenarios

### Get My Notifications (#168)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | No notifications exist | Empty array, `total: 0` |
| 2 | Filter `is_read=false` | Only unread notifications |
| 3 | Filter `is_read=true` | Only read notifications |
| 4 | Filter `notification_type=round_result` | Only round result notifications |
| 5 | Combine `is_read=false` + `notification_type=new_job_posted` | Unread job notifications only |
| 6 | Sort `sort_order=asc` | Oldest first |
| 7 | Default (no params) | All notifications, newest first, page 1, limit 20 |
| 8 | Page 2 with 25 total | Items 21–25 |
| 9 | Invalid `notification_type` | `422` validation error |
| 10 | Notifications from different college not visible | Only own college's notifications returned |
| 11 | Notifications sent to other students not visible | Only own notifications returned |
| 12 | Notification with `body: null` | `body` field is null in response |
| 13 | All 13 notification types present | Each renders with correct type |

### Get Unread Count (#169)

| # | Test Case | Expected |
|---|-----------|----------|
| 14 | No notifications | `unread_count: 0` |
| 15 | 5 unread, 3 read | `unread_count: 5` |
| 16 | All read | `unread_count: 0` |
| 17 | Mark one as read, re-check count | Count decreases by 1 |
| 18 | Mark all as read, re-check count | `unread_count: 0` |
| 19 | New notification sent by college, re-check | Count increases |

### Mark Notification Read (#170)

| # | Test Case | Expected |
|---|-----------|----------|
| 20 | Mark unread notification as read | `200`, `is_read: true`, `read_at` populated |
| 21 | Mark already-read notification | `200` (idempotent, updates `read_at`) |
| 22 | Invalid notification ID | `404` Notification not found |
| 23 | Notification belongs to another student | `404` Notification not found |
| 24 | Notification from different college | `404` Notification not found |
| 25 | Non-UUID notification ID | `500` or parameter error |
| 26 | Verify `read_at` timestamp is set | `read_at` is a valid ISO timestamp |

### Mark All Notifications Read (#171)

| # | Test Case | Expected |
|---|-----------|----------|
| 27 | 7 unread notifications | `200`, `marked_count: 7` |
| 28 | All already read | `200`, `marked_count: 0` |
| 29 | No notifications exist | `200`, `marked_count: 0` |
| 30 | After mark-all, check unread count | `unread_count: 0` |
| 31 | After mark-all, list with `is_read=false` | Empty array |
| 32 | Only current student's notifications affected | Other students' unread count unchanged |
| 33 | Verify all `read_at` timestamps are set | Each notification has valid `read_at` |
| 34 | Call twice in a row | First returns count > 0, second returns `marked_count: 0` |
