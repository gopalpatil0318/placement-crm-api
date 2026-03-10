# Student Feedback & Interview Questions API Documentation

> **APIs #172–#175** — Student-side endpoints for placement feedback and interview questions  
> **Base URL:** `/api/student`  
> **Auth:** JWT (HttpOnly cookie) — student authentication required

---

## Table of Contents

1. [POST /submit_feedback](#1-submit-placement-feedback)
2. [GET /get_my_feedback](#2-get-my-feedback)
3. [POST /submit_interview_question](#3-submit-interview-question)
4. [GET /browse_interview_questions](#4-browse-interview-questions)
5. [Database Schema Reference](#5-database-schema-reference)
6. [Frontend Implementation Guide](#6-frontend-implementation-guide)
7. [Integration with Other APIs](#7-integration-with-other-apis)
8. [Edge Case Test Scenarios](#8-edge-case-test-scenarios)

---

## 1. Submit Placement Feedback

**`POST /api/student/submit_feedback`** — Rate limited

Submit feedback and rating for a placement drive the student participated in. One feedback per job per student.

### Request Body

```json
{
  "job_id": "uuid-of-job",
  "company_id": "uuid-of-company",
  "rating": 4,
  "feedback_text": "The interview process was well-organized. HR was professional and communicated timelines clearly.",
  "is_anonymous": false
}
```

| Field           | Type    | Required | Validation | Description |
|----------------|---------|----------|------------|-------------|
| `job_id`       | UUID    | Yes      | Valid UUID  | Job posting the feedback is for |
| `company_id`   | UUID    | Yes      | Valid UUID  | Company that conducted the drive |
| `rating`       | integer | Yes      | 1–5        | Overall rating (1 = poor, 5 = excellent) |
| `feedback_text`| string  | No       | Max 3000 chars | Detailed feedback text |
| `is_anonymous` | boolean | No       | Default: `false` | Hide identity from admin view |

### Success Response — `201 Created`

```json
{
  "success": true,
  "message": "Thank you for your feedback!",
  "data": {
    "feedback_id": "uuid",
    "job_id": "uuid",
    "company_id": "uuid",
    "rating": 4,
    "feedback_text": "The interview process was well-organized...",
    "is_anonymous": false,
    "is_approved": false,
    "created_at": "2025-03-05T10:30:00.000Z"
  }
}
```

### Error Responses

| Status | Message | Scenario |
|--------|---------|----------|
| `404`  | `"Job posting not found"` | Invalid job/company ID, student didn't apply to this job, or different college |
| `409`  | `"You have already submitted feedback for this job"` | Duplicate feedback (unique constraint) |
| `429`  | Rate limited | Too many requests |

### Business Rules

- Student **must have applied** to the job to submit feedback
- Job and company must belong to the same college as the student
- One feedback per student per job (enforced by unique constraint)
- Feedback starts as `is_approved = false` — visible to admin for review
- When `is_anonymous = true`, admin sees "Anonymous" instead of student name

### Frontend UI — Submit Feedback Form

| Input | Type | Mandatory | Validation |
|-------|------|-----------|------------|
| Job selection | **Dropdown** | Yes | Populate from student's applications (`GET /student/get_my_applications`) |
| Company | **Auto-filled** | — | Auto-populated based on selected job |
| Rating | **Star rating** (1–5 clickable stars) | Yes | At least 1 star required |
| Feedback text | **Textarea** (multi-line) | No | Max 3000 characters, show char counter |
| Anonymous toggle | **Checkbox / Toggle** | No | Default unchecked |
| Submit button | **Button** | — | Disabled until rating selected |

**UX Notes:**
- Show star rating component with hover preview
- Show character count for feedback text: `"245 / 3000"`
- After submission, show success toast and redirect to "My Feedback" page
- If already submitted for that job, show warning or disable the job in dropdown

---

## 2. Get My Feedback

**`GET /api/student/get_my_feedback`**

View all feedback submitted by the authenticated student.

### Query Parameters

| Parameter    | Type   | Required | Default      | Description |
|-------------|--------|----------|--------------|-------------|
| `sort_by`   | string | No       | `created_at` | `created_at` or `rating` |
| `sort_order`| string | No       | `desc`       | `asc` or `desc` |
| `page`      | number | No       | `1`          | Page number |
| `limit`     | number | No       | `20`         | Items per page (1–100) |

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
      "rating": 4,
      "feedback_text": "Great experience overall.",
      "is_anonymous": false,
      "is_approved": true,
      "created_at": "2025-03-01T10:30:00.000Z",
      "updated_at": "2025-03-03T09:00:00.000Z",
      "company_name": "Infosys",
      "job_title": "Software Engineer"
    },
    {
      "feedback_id": "uuid",
      "job_id": "uuid",
      "company_id": "uuid",
      "rating": 2,
      "feedback_text": null,
      "is_anonymous": true,
      "is_approved": false,
      "created_at": "2025-02-28T14:00:00.000Z",
      "updated_at": "2025-02-28T14:00:00.000Z",
      "company_name": "TCS",
      "job_title": "Graduate Engineer Trainee"
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

### Frontend UI — My Feedback Page

**Layout:** Card list showing each submitted feedback with:
- Company name + Job title
- Star rating display
- Feedback text (or "No text provided")
- Approval status badge: `Pending` (yellow) / `Approved` (green)
- Anonymous indicator
- Submitted date

**UX Notes:**
- No edit/delete capability (feedback is permanent)
- Show "No feedback submitted yet" empty state with link to submit

---

## 3. Submit Interview Question

**`POST /api/student/submit_interview_question`** — Rate limited

Share an interview question from a placement drive for future batches.

### Request Body

```json
{
  "company_id": "uuid-of-company",
  "job_id": "uuid-of-job",
  "question_description": "Explain the difference between process and thread in OS. Give real-world examples.",
  "topic": "Operating Systems",
  "sample_answer": "A process is an independent unit of execution with its own memory space. A thread is a lightweight unit within a process that shares memory..."
}
```

| Field                  | Type   | Required | Validation | Description |
|-----------------------|--------|----------|------------|-------------|
| `company_id`          | UUID   | Yes      | Valid UUID  | Company that asked this question |
| `job_id`              | UUID   | Yes      | Valid UUID  | Job posting reference |
| `question_description`| string | Yes      | 5–2000 chars | The interview question |
| `topic`               | string | No       | Max 100 chars | Topic/category (e.g., "DSA", "DBMS", "HR") |
| `sample_answer`       | string | No       | Max 3000 chars | Student's answer or suggested answer |

### Success Response — `201 Created`

```json
{
  "success": true,
  "message": "Interview question submitted for review",
  "data": {
    "question_id": "uuid",
    "company_id": "uuid",
    "job_id": "uuid",
    "question_description": "Explain the difference between process and thread in OS...",
    "topic": "Operating Systems",
    "sample_answer": "A process is an independent unit...",
    "is_approved": false,
    "created_at": "2025-03-05T11:00:00.000Z"
  }
}
```

### Error Responses

| Status | Message | Scenario |
|--------|---------|----------|
| `404`  | `"Job posting not found"` | Invalid job/company ID or different college |
| `429`  | Rate limited | Too many requests |

### Business Rules

- Job and company must belong to the student's college
- No unique constraint — students can submit multiple questions per job
- Starts as `is_approved = false` — admin must approve before visible to other students
- No requirement for application — any student from the college can submit (they may have heard questions from peers)

### Frontend UI — Submit Question Form

| Input | Type | Mandatory | Validation |
|-------|------|-----------|------------|
| Company | **Dropdown** | Yes | Populate from available companies |
| Job | **Dropdown** (filtered by company) | Yes | Populate from jobs for selected company |
| Question | **Textarea** (multi-line) | Yes | Min 5 chars, max 2000, show char counter |
| Topic | **Single-line input** with suggestions | No | Max 100 chars. Suggest: "DSA", "DBMS", "OS", "CN", "HR", "Aptitude", "Coding", "System Design" |
| Sample Answer | **Textarea** (multi-line) | No | Max 3000 chars, show char counter |
| Submit button | **Button** | — | Disabled until required fields filled |

**UX Notes:**
- After submission, show "Submitted for review" message
- Allow multiple submissions (no duplicate restriction)
- Consider adding a "Submit Another" button after success
- Filter jobs dropdown based on selected company
- Show topic suggestions as autocomplete/tags

---

## 4. Browse Interview Questions

**`GET /api/student/browse_interview_questions`**

Browse approved interview questions shared by other students. Only approved questions are visible.

### Query Parameters

| Parameter    | Type   | Required | Default      | Description |
|-------------|--------|----------|--------------|-------------|
| `company_id` | UUID   | No       | —            | Filter by company |
| `job_id`     | UUID   | No       | —            | Filter by specific job |
| `topic`      | string | No       | —            | Filter by topic (partial match) |
| `search`     | string | No       | —            | Search in question_description and topic |
| `sort_by`    | string | No       | `created_at` | `created_at` or `topic` |
| `sort_order` | string | No       | `desc`       | `asc` or `desc` |
| `page`       | number | No       | `1`          | Page number |
| `limit`      | number | No       | `20`         | Items per page (1–100) |

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
      "question_description": "Explain the difference between process and thread in OS.",
      "topic": "Operating Systems",
      "sample_answer": "A process is an independent unit of execution...",
      "created_at": "2025-03-01T10:30:00.000Z",
      "company_name": "Google",
      "job_title": "Software Engineer",
      "passout_year": 2025
    },
    {
      "question_id": "uuid",
      "company_id": "uuid",
      "job_id": "uuid",
      "question_description": "Write a function to find the longest palindromic substring.",
      "topic": "DSA",
      "sample_answer": null,
      "created_at": "2025-02-28T14:00:00.000Z",
      "company_name": "Google",
      "job_title": "Software Engineer",
      "passout_year": 2025
    }
  ],
  "pagination": {
    "total": 85,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

### Response Notes

- **Only approved questions** are returned (hardcoded `is_approved = true` filter)
- **Student identity is hidden** — no `student_id` or `student_name` in the response
- `passout_year` included to let students see which year the question was from

### Frontend UI — Browse Questions Page

| Input | Type | Notes |
|-------|------|-------|
| Company filter | **Dropdown** | Populate from `GET /student/get_available_jobs` (extract unique companies) |
| Topic filter | **Single-line input** or **Tag selector** | Partial match |
| Search | **Single-line input** | Searches question text and topic |
| Sort | **Dropdown** (`Newest / Oldest / Topic A-Z`) | |

**Layout:**
- Card/accordion per question
- Title: Question description (full text)
- Tags: Topic badge, Company name, Job title, Passout year
- Expandable: Sample answer (collapsible "Show Answer" section)
- Group by company option for easier browsing

**UX Notes:**
- Default view: newest questions first
- Show company logo if available
- "No questions found" empty state with message "Be the first to share!"
- Link to "Submit Question" page from browse page
- Consider bookmark/save functionality for future reference

---

## 5. Database Schema Reference

### placement_feedback

```sql
CREATE TABLE placement_feedback (
  feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL REFERENCES colleges(college_id),
  job_id UUID NOT NULL REFERENCES job_postings(job_id),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  student_id UUID NOT NULL REFERENCES students(student_id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  is_anonymous BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (student_id, job_id)  -- one feedback per student per job
);
```

### interview_questions

```sql
CREATE TABLE interview_questions (
  question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL REFERENCES colleges(college_id),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  job_id UUID NOT NULL REFERENCES job_postings(job_id),
  student_id UUID NOT NULL REFERENCES students(student_id),
  question_description TEXT NOT NULL,
  topic TEXT,
  sample_answer TEXT,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
-- No unique constraint: multiple questions per student per job allowed
```

---

## 6. Frontend Implementation Guide

### Page: Submit Feedback (`/feedback/submit`)

**When to show:**
- After a placement drive is completed
- In the student's application detail page (link: "Submit Feedback")
- In placement results page

**Form Flow:**
1. Student selects a job from their applied jobs dropdown
2. Company name auto-populates from the selected job
3. Student rates 1–5 stars
4. Optionally writes feedback text
5. Optionally toggles anonymous mode
6. Submits

**Required Frontend Validations:**
- Rating: Required, 1–5
- Job: Required, must be from student's applications
- Feedback text: Max 3000 chars
- Show confirmation dialog if submitting anonymously: "Your identity will be hidden from college admin"

### Page: My Feedback (`/feedback/my`)

**Simple list of all submitted feedback with approval status badges.**

### Page: Submit Interview Question (`/interview-questions/submit`)

**When to show:**
- After placing/completing rounds in a company
- Dedicated menu item: "Share Interview Experience"

**Form Flow:**
1. Select company from dropdown
2. Select job from filtered dropdown (by company)
3. Write the question (required)
4. Add topic tag (optional)
5. Add sample answer (optional)
6. Submit

**Required Frontend Validations:**
- Company: Required
- Job: Required
- Question: Required, min 5 chars, max 2000 chars
- Topic: Max 100 chars
- Sample answer: Max 3000 chars

### Page: Browse Questions (`/interview-questions/browse`)

**Discovery page for preparation:**
- Filter by company (primary filter)
- Search across all questions
- Group results by company for better UX
- Expandable cards with sample answers
- Good for pre-interview preparation

---

## 7. Integration with Other APIs

### Related Student APIs

| Purpose | API | Usage |
|---------|-----|-------|
| Get applied jobs (for feedback dropdown) | `GET /student/get_my_applications` | Populate job dropdown in feedback form |
| Get available jobs (for browse context) | `GET /student/get_available_jobs` | Extract company list for browse filter |
| Get application details | `GET /student/get_application_details/:id` | Link "Submit Feedback" button |
| Get placement results | `GET /student/get_my_placements` | Link "Submit Feedback" after placement |

### Related College APIs (#99–#102)

| Student Action | Admin Follow-up |
|---------------|----------------|
| Student submits feedback | Admin sees in `GET /college/get_all_feedback?is_approved=false` |
| Admin approves feedback | Feedback status changes to approved |
| Student submits question | Admin sees in `GET /college/get_all_interview_questions?is_approved=false` |
| Admin approves question | Question visible in `GET /student/browse_interview_questions` |

### Complete Lifecycle

```
Placement Drive Complete
    │
    ├── Student submits feedback (#172)
    │     └── Admin reviews & approves (#100)
    │
    └── Student submits interview questions (#174)
          └── Admin reviews & approves (#102)
                └── Future students browse approved questions (#175)
```

### Feature Flag Check

Before showing feedback/interview-questions pages, check if the college has these features enabled:
- `colleges.enabled_features` should include `"feedback"` for feedback APIs
- `colleges.enabled_features` should include `"interview_questions"` for question APIs

---

## 8. Edge Case Test Scenarios

### Submit Feedback (#172)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Submit valid feedback with all fields | `201`, feedback created with `is_approved: false` |
| 2 | Submit without `feedback_text` | `201`, `feedback_text: null` in response |
| 3 | Submit with `is_anonymous: true` | `201`, feedback saved with `is_anonymous: true` |
| 4 | Submit with `is_anonymous` omitted | `201`, defaults to `false` |
| 5 | Submit duplicate (same student + job) | `409` "Already submitted feedback" |
| 6 | Invalid `job_id` | `404` Job not found |
| 7 | Invalid `company_id` (mismatched with job) | `404` Job not found |
| 8 | Job from different college | `404` Job not found |
| 9 | Student didn't apply to this job | `404` Job not found |
| 10 | Rating below 1 | `422` validation error |
| 11 | Rating above 5 | `422` validation error |
| 12 | Rating as float (3.5) | `422` validation error |
| 13 | `feedback_text` exceeding 3000 chars | `422` validation error |
| 14 | Missing `rating` field | `422` validation error |
| 15 | Missing `job_id` field | `422` validation error |

### Get My Feedback (#173)

| # | Test Case | Expected |
|---|-----------|----------|
| 16 | No feedback submitted | Empty array, `total: 0` |
| 17 | Multiple feedback entries | All returned with job/company names |
| 18 | Sort by `rating` desc | Highest rated first |
| 19 | Sort by `created_at` asc | Oldest first |
| 20 | Pagination page 2 | Correct offset |
| 21 | Feedback with `feedback_text: null` | `feedback_text` is null in response |
| 22 | Shows both approved and pending | Both visible to student |
| 23 | Other student's feedback not visible | Only own feedback returned |

### Submit Interview Question (#174)

| # | Test Case | Expected |
|---|-----------|----------|
| 24 | Submit with all fields | `201`, question created with `is_approved: false` |
| 25 | Submit without `topic` | `201`, `topic: null` |
| 26 | Submit without `sample_answer` | `201`, `sample_answer: null` |
| 27 | Submit multiple questions for same job | `201` each time (no unique constraint) |
| 28 | Invalid `job_id` | `404` Job not found |
| 29 | Mismatched company and job | `404` Job not found |
| 30 | Job from different college | `404` Job not found |
| 31 | `question_description` < 5 chars | `422` validation error |
| 32 | `question_description` > 2000 chars | `422` validation error |
| 33 | `topic` > 100 chars | `422` validation error |
| 34 | `sample_answer` > 3000 chars | `422` validation error |
| 35 | Missing `question_description` | `422` validation error |

### Browse Interview Questions (#175)

| # | Test Case | Expected |
|---|-----------|----------|
| 36 | No approved questions | Empty array, `total: 0` |
| 37 | Mix of approved/pending questions | Only approved returned |
| 38 | Filter by `company_id` | Only questions for that company |
| 39 | Filter by `topic=DSA` | Questions with "DSA" in topic |
| 40 | Search `"palindrome"` | Matches in question_description or topic |
| 41 | Sort by `topic` asc | Alphabetical order |
| 42 | Pagination | Correct total/pages |
| 43 | No `student_id` or `student_name` in response | Identity hidden in browse view |
| 44 | `passout_year` present in response | Year context for question relevance |
| 45 | Questions from other college | Not visible (college isolation) |
| 46 | Combine `company_id` + `topic` filters | Both applied |

### Postman Test Data

**Submit feedback:**
```
POST /api/student/submit_feedback
Body:
{
  "job_id": "{{jobId}}",
  "company_id": "{{companyId}}",
  "rating": 4,
  "feedback_text": "Great interview experience. The panel was friendly.",
  "is_anonymous": false
}
```

**Get my feedback:**
```
GET /api/student/get_my_feedback?sort_by=rating&sort_order=desc&page=1&limit=10
```

**Submit interview question:**
```
POST /api/student/submit_interview_question
Body:
{
  "company_id": "{{companyId}}",
  "job_id": "{{jobId}}",
  "question_description": "What is the difference between TCP and UDP? When would you use each?",
  "topic": "Computer Networks",
  "sample_answer": "TCP is connection-oriented and provides reliable delivery with ordering. UDP is connectionless and faster but unreliable..."
}
```

**Browse questions by company:**
```
GET /api/student/browse_interview_questions?company_id={{companyId}}&page=1&limit=20
```

**Search questions:**
```
GET /api/student/browse_interview_questions?search=sorting&topic=DSA
```
