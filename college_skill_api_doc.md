# College Skills Master — Frontend API Documentation

> **APIs #103–#104** — Skills Master Management (College Admin / TPO)
> **Base URL**: `/api/college`
> **Auth**: HttpOnly cookie JWT (`college_id` + `user_id` + `role`)

---

## Database Schema Reference

```sql
CREATE TABLE skills (
  skill_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id   UUID NOT NULL REFERENCES colleges(college_id),
  skill_name   TEXT NOT NULL,
  skill_category TEXT,                          -- freeform (e.g. "Programming", "Database", "Cloud")
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Each college has its own skill catalog — no cross-college sharing
UNIQUE INDEX (college_id, lower(skill_name));   -- case-insensitive duplicate prevention

-- Student skills reference this table
CREATE TABLE student_skills (
  student_skill_id UUID PRIMARY KEY,
  student_id   UUID REFERENCES students(student_id),
  skill_id     UUID REFERENCES skills(skill_id),  -- FK to master list
  proficiency_level TEXT CHECK (IN ('beginner','intermediate','advanced','expert')),
  ...
);
```

---

## API #103 — Create Skill

| Field | Value |
|-------|-------|
| **Endpoint** | `POST /api/college/create_skill` |
| **Auth** | College Admin / TPO |
| **Rate Limit** | API limiter (50 req/min) |
| **Content-Type** | `application/json` |

### Request Body

| Field | Type | Required | Validation | Input Type |
|-------|------|----------|------------|------------|
| `skill_name` | string | **Yes** | 1–100 chars, trimmed | Single-line text input |
| `skill_category` | string | No | max 100 chars | Dropdown (populated from categories list) or freeform text with autocomplete |

### Response — 201 Created

```json
{
  "success": true,
  "message": "Skill added successfully",
  "data": {
    "skill_id": "a1b2c3d4-...",
    "skill_name": "React.js",
    "skill_category": "Frontend",
    "created_at": "2026-03-09T10:30:00.000Z"
  }
}
```

### Error Responses

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Missing skill_name or too long | `{ success: false, error: "Skill name is required" }` |
| 401 | Not authenticated | `{ success: false, error: "Unauthorized" }` |
| 403 | Role not College Admin/TPO | `{ success: false, error: "Forbidden" }` |
| 409 | Duplicate skill name (case-insensitive) | `{ success: false, error: "Skill \"React.js\" already exists in your college" }` |

### Sample Postman Request

```
POST /api/college/create_skill
Content-Type: application/json
Cookie: token=<jwt>

{
  "skill_name": "React.js",
  "skill_category": "Frontend"
}
```

### Frontend Validations

| Field | Validation |
|-------|-----------|
| `skill_name` | Required, min 1 char, max 100 chars, trim whitespace before submit |
| `skill_category` | Optional, max 100 chars. Show autocomplete from existing categories |

---

## API #104 — Get All Skills

| Field | Value |
|-------|-------|
| **Endpoint** | `GET /api/college/get_all_skills` |
| **Auth** | College Admin / TPO |
| **Rate Limit** | API limiter |

### Query Parameters

| Param | Type | Required | Default | Description | Input Type |
|-------|------|----------|---------|-------------|------------|
| `page` | number | No | 1 | Page number | Auto (pagination controls) |
| `limit` | number | No | 50 | Items per page (max 100) | Dropdown: 25, 50, 100 |
| `search` | string | No | — | Search skill_name or skill_category (ILIKE) | Search input with debounce |
| `skill_category` | string | No | — | Exact category filter | Dropdown populated from `categories` in response |
| `sort_by` | string | No | `skill_name` | Sort column: `skill_name`, `created_at`, `skill_category` | Dropdown or column header click |
| `sort_order` | string | No | `asc` | `asc` or `desc` | Toggle on column header |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Skills retrieved successfully",
  "data": {
    "skills": [
      {
        "skill_id": "a1b2c3d4-...",
        "skill_name": "React.js",
        "skill_category": "Frontend",
        "student_count": 42,
        "created_at": "2026-01-15T08:00:00.000Z"
      },
      {
        "skill_id": "e5f6g7h8-...",
        "skill_name": "Node.js",
        "skill_category": "Backend",
        "student_count": 38,
        "created_at": "2026-01-15T08:01:00.000Z"
      }
    ],
    "categories": [
      { "category": "Backend", "count": 12 },
      { "category": "Cloud", "count": 5 },
      { "category": "Database", "count": 8 },
      { "category": "Frontend", "count": 15 }
    ]
  },
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 85,
    "totalPages": 2
  }
}
```

### Sample Postman Requests

```
# Basic list
GET /api/college/get_all_skills
Cookie: token=<jwt>

# Search
GET /api/college/get_all_skills?search=react&page=1&limit=25
Cookie: token=<jwt>

# Filter by category
GET /api/college/get_all_skills?skill_category=Frontend&sort_by=created_at&sort_order=desc
Cookie: token=<jwt>
```

---

## Frontend Implementation Guide

### Page: Skills Master Management

**Layout**: Single page with a table and a top action bar.

```
┌──────────────────────────────────────────────────────┐
│  Skills Master                        [+ Add Skill]  │
│──────────────────────────────────────────────────────│
│  [🔍 Search skills...] [Category ▼] [Sort ▼]        │
│──────────────────────────────────────────────────────│
│  # │ Skill Name    │ Category  │ Students │ Added    │
│  1 │ React.js      │ Frontend  │ 42       │ Jan 15   │
│  2 │ Node.js       │ Backend   │ 38       │ Jan 15   │
│  3 │ PostgreSQL    │ Database  │ 31       │ Jan 16   │
│  ...                                                 │
│──────────────────────────────────────────────────────│
│  ◄ 1 2 ►                          Showing 1-50 of 85 │
└──────────────────────────────────────────────────────┘
```

### Add Skill Modal / Side Panel

```
┌──────────────────────────────┐
│  Add New Skill               │
│──────────────────────────────│
│  Skill Name *                │
│  [________________________]  │
│                              │
│  Category                    │
│  [Frontend          ▼]      │
│  (autocomplete from existing)│
│                              │
│  [Cancel]      [Add Skill]   │
└──────────────────────────────┘
```

### Input Specifications

| Field | Input Type | Details |
|-------|-----------|---------|
| Skill Name | `<input type="text">` | Required, maxLength=100, autofocus, show error on duplicate (409) |
| Category | Combo box (dropdown + freeform) | Populated from `categories[]` in list response, allow new values |
| Search | `<input type="search">` | Debounce 300ms, clear button, searches skill_name and category |
| Category filter | `<select>` dropdown | Populated from `categories[]`, include "All Categories" option |

### Category Dropdown Population

The `GET /api/college/get_all_skills` response includes a `categories` array. Use this to populate:
1. The category filter dropdown on the main table
2. The category autocomplete/dropdown in the Add Skill form

### Data Flow & Entity Relationships

```
skills (master list, college-scoped)
  │
  ├── Used by: Student Skills module (student adds from this list)
  │     Student selects skill_id → student_skills.skill_id FK
  │
  ├── Populated by: College Admin / TPO via these APIs
  │
  └── Referenced in: Student profile completion calculation
        (15% weight for skills section)
```

### Integration with Existing APIs

| Module | Relationship |
|--------|-------------|
| **Student Skills** (APIs #124–#127) | Students browse this master list and add skills to their profile with proficiency levels |
| **Student Profile Completion** (API #114) | Skills section contributes 15% to profile completion score |
| **Student Full Profile** (API #113) | Student skills display the `skill_name` from this master table |
| **Job Eligibility** | Future: could filter students by specific skills |

### Future APIs That Will Use This

| Future API | How It Uses Skills |
|------------|-------------------|
| Dashboard APIs (#105–#108) | Skill distribution stats across students |
| Export Students (#31) | Include student skills in export |

---

## Test Scenarios

### API #103 — Create Skill

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 1 | Create skill with name + category | 201, skill returned | ✅ |
| 2 | Create skill with name only (no category) | 201, category is null | ✅ |
| 3 | Create duplicate skill (same name, same college) | 409 conflict | ✅ |
| 4 | Create duplicate skill (different case: "react.js" vs "React.js") | 409 conflict (case-insensitive unique) | ✅ |
| 5 | Create skill without name (empty body) | 400 validation error | ✅ |
| 6 | Create skill with name > 100 chars | 400 validation error | ✅ |
| 7 | Create skill without auth | 401 unauthorized | ✅ |
| 8 | Create skill as Teacher role | 403 forbidden | ✅ |
| 9 | Create skill with only whitespace name | 400 (trimmed to empty) | ✅ |
| 10 | Create same skill name in different college | 201 (allowed — college-scoped) | ✅ |

### API #104 — Get All Skills

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| 11 | List all skills (no filters) | 200, paginated list with categories | ✅ |
| 12 | Search by skill name ("react") | 200, filtered results | ✅ |
| 13 | Search by category name ("front") | 200, ILIKE match on category | ✅ |
| 14 | Filter by exact category ("Frontend") | 200, only Frontend skills | ✅ |
| 15 | Sort by created_at desc | 200, newest first | ✅ |
| 16 | Sort by skill_category asc | 200, alphabetical by category | ✅ |
| 17 | Pagination: page=2, limit=10 | 200, correct offset | ✅ |
| 18 | Empty college (no skills) | 200, empty array, total=0 | ✅ |
| 19 | Verify student_count is accurate | 200, count matches student_skills rows | ✅ |
| 20 | Verify categories array is independent of filters | 200, shows ALL categories regardless of search | ✅ |
| 21 | Invalid sort_by value | 400 validation error | ✅ |
| 22 | Without auth | 401 unauthorized | ✅ |

### Sample Test Data

```json
// Skill 1
{ "skill_name": "React.js", "skill_category": "Frontend" }

// Skill 2
{ "skill_name": "Node.js", "skill_category": "Backend" }

// Skill 3
{ "skill_name": "PostgreSQL", "skill_category": "Database" }

// Skill 4 — no category
{ "skill_name": "Problem Solving" }

// Skill 5
{ "skill_name": "AWS", "skill_category": "Cloud" }

// Skill 6
{ "skill_name": "Docker", "skill_category": "DevOps" }

// Skill 7
{ "skill_name": "Python", "skill_category": "Programming" }

// Skill 8
{ "skill_name": "Machine Learning", "skill_category": "AI/ML" }

// Skill 9
{ "skill_name": "Communication", "skill_category": "Soft Skills" }

// Skill 10
{ "skill_name": "Git", "skill_category": "DevOps" }
```

### Edge Case Tests

| # | Scenario | Expected |
|---|----------|----------|
| 23 | Create skill with special chars: "C++" | 201, accepted |
| 24 | Create skill with special chars: "C#" | 201, accepted |
| 25 | Search with special chars: "c++" | 200, matches C++ |
| 26 | Category with spaces: "Soft Skills" | 201, accepted |
| 27 | Very long search string (100 chars) | 200, no crash |
| 28 | limit=0 | 400, min is 1 |
| 29 | limit=200 | Uses max 100 |
| 30 | page=-1 | 400, min is 1 |
