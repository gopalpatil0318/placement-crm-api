# College Dashboard & Statistics — Frontend Integration Reference

## Architecture: Lazy-Loading for Fast Performance

The dashboard is split into **9 focused APIs** to avoid loading everything on login.  
**Only 1 API fires on login.** The other 8 fire **only when the user navigates to that section/tab.**

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER LOGS IN                                 │
│                        │                                        │
│                        ▼                                        │
│           ┌──────────────────────┐                              │
│           │  dashboard_overview  │  ← ONLY this fires on login  │
│           │  (lightweight KPIs)  │                              │
│           └──────────────────────┘                              │
│                        │                                        │
│           Dashboard renders with headline cards                 │
│                        │                                        │
│    User clicks a tab/section → fire the specific API            │
│                        │                                        │
│    ┌───────────────────┼───────────────────────┐                │
│    ▼                   ▼                       ▼                │
│ [Placement]    [Departments]    [Companies]   ...               │
│ Stats Tab       Stats Tab       Stats Tab                       │
│    │                   │                       │                │
│    ▼                   ▼                       ▼                │
│ placement_stats  department_wise  company_wise                  │
│ API fires        API fires        API fires                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints Summary

| # | Endpoint | When to Call | Purpose |
|---|----------|-------------|---------|
| 105a | `GET /api/college/dashboard_overview` | **ON LOGIN** | Headline KPIs for dashboard cards |
| 105b | `GET /api/college/dashboard_placement_stats` | Tab click: "Placement Details" | Package slabs, offer breakdown |
| 105c | `GET /api/college/dashboard_application_funnel` | Tab click: "Applications" | Pipeline analysis |
| 105d | `GET /api/college/dashboard_student_readiness` | Tab click: "Students" | Profile status, restrictions |
| 105e | `GET /api/college/dashboard_diversity_stats` | Tab click: "Diversity / NAAC" | Gender & category breakdown |
| 105f | `GET /api/college/dashboard_training_stats` | Tab click: "Training & Feedback" | Training programs + feedback |
| 106 | `GET /api/college/dashboard_department_wise` | Tab click: "Departments" | Per-department stats table |
| 107 | `GET /api/college/dashboard_company_wise` | Tab click: "Companies" | Per-company stats table |
| 108 | `GET /api/college/dashboard_year_comparison` | Tab click: "Year Comparison" | Multi-year side-by-side |

**Auth:** All endpoints require `HttpOnly cookie` + role `collegeadmin` or `tpo`.

---

## Recommended Frontend Loading Strategy

### Step 1: On Login — Fetch Overview Only
```js
// Called ONCE when dashboard page mounts
const passoutYear = college.default_academic_year; // from login/college info

const overview = await fetch(
  `/api/college/dashboard_overview?passout_year=${passoutYear}`
);
```

### Step 2: Cache & Display Cards
Render the 6 headline cards immediately:
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Placement % │  │ Avg Package  │  │  Companies   │
│    72.5%     │  │   ₹6.2 LPA   │  │     45       │
├──────────────┤  ├──────────────┤  ├──────────────┤
│    289/398   │  │ Highest:     │  │  Total Jobs: │
│   students   │  │  ₹24 LPA     │  │     62       │
└──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Total Offers │  │ Median Pkg   │  │  Unplaced    │
│    342       │  │  ₹5.5 LPA    │  │    109       │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Step 3: Lazy-Load Tabs On Demand
```js
// Only fetch when user clicks the tab
const [activeTab, setActiveTab] = useState('overview');
const [tabData, setTabData] = useState({});

async function loadTabData(tab) {
  if (tabData[tab]) return; // Already cached — don't re-fetch

  const endpoints = {
    placement:   'dashboard_placement_stats',
    funnel:      'dashboard_application_funnel',
    students:    'dashboard_student_readiness',
    diversity:   'dashboard_diversity_stats',
    training:    'dashboard_training_stats',
    departments: 'dashboard_department_wise',
    companies:   'dashboard_company_wise',
  };

  const res = await fetch(
    `/api/college/${endpoints[tab]}?passout_year=${passoutYear}`
  );
  const json = await res.json();
  setTabData(prev => ({ ...prev, [tab]: json.data }));
}
```

### Step 4: Year Comparison (separate flow)
```js
// Only when user opens year comparison section
const yearRes = await fetch(
  `/api/college/dashboard_year_comparison?passout_years=2026,2025,2024`
);
```

### Step 5: Caching Rules
| Rule | Implementation |
|------|---------------|
| Cache overview for session | Store in state/context after first fetch |
| Cache tab data | Don't re-fetch if tab was already loaded |
| Refresh on year change | When user changes passout_year dropdown, clear all cache and re-fetch overview |
| Manual refresh button | Clear all cache, re-fetch current tab + overview |
| NO polling/auto-refresh | Stats don't change frequently; manual refresh is sufficient |

---

## API #105a — Dashboard Overview (ON LOGIN)

**`GET /api/college/dashboard_overview?passout_year=2026`**

### Query Parameters
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `passout_year` | integer | Yes | Batch year (2000-2100) |

### Success Response (200)
```json
{
  "success": true,
  "message": "Dashboard overview retrieved",
  "data": {
    "total_students": 398,
    "placed_count": 289,
    "placement_percentage": 72.61,
    "total_offers": 342,
    "highest_package": 2400000,
    "lowest_package": 280000,
    "average_package": 620000,
    "median_package": 550000,
    "unplaced_count": 109,
    "total_companies": 45,
    "total_job_postings": 62
  }
}
```

### Frontend Usage
| Field | Card Label | Format |
|-------|-----------|--------|
| `placement_percentage` | Placement Rate | `72.61%` |
| `placed_count / total_students` | Students Placed | `289 / 398` |
| `average_package` | Average Package | `₹6.20 LPA` (divide by 100000) |
| `highest_package` | Highest Package | `₹24.00 LPA` |
| `median_package` | Median Package | `₹5.50 LPA` |
| `lowest_package` | Lowest Package | `₹2.80 LPA` |
| `total_offers` | Total Offers | `342` |
| `unplaced_count` | Yet to be Placed | `109` (highlight red if > 30%) |
| `total_companies` | Companies Visited | `45` |
| `total_job_postings` | Job Postings | `62` |

### Package Display Helper
```js
function formatPackage(amount) {
  if (!amount || amount === 0) return '—';
  return `₹${(amount / 100000).toFixed(2)} LPA`;
}
```

---

## API #105b — Placement Statistics (ON DEMAND)

**`GET /api/college/dashboard_placement_stats?passout_year=2026`**

### When to Call
User clicks **"Placement Details"** or **"Package Analysis"** tab.

### Query Parameters
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `passout_year` | integer | Yes | Batch year |

### Success Response (200)
```json
{
  "success": true,
  "message": "Placement statistics retrieved",
  "data": {
    "package_slabs": {
      "below_3l": 12,
      "3l_to_5l": 85,
      "5l_to_8l": 120,
      "8l_to_12l": 45,
      "12l_to_20l": 18,
      "above_20l": 5
    },
    "offer_breakdown": {
      "fulltime_offers": 280,
      "internship_offers": 62,
      "pending_offers": 15,
      "accepted_offers": 240,
      "joined_count": 180,
      "rejected_offers": 8,
      "cancelled_offers": 3,
      "students_with_multiple_offers": 42
    },
    "internship_stats": {
      "highest_stipend": 60000,
      "average_stipend": 25000,
      "with_stipend_count": 55
    }
  }
}
```

### Recommended Visualizations
| Data | Chart Type | Notes |
|------|-----------|-------|
| `package_slabs` | Bar chart / Donut chart | X-axis: slab labels, Y-axis: count |
| `offer_breakdown` | Stacked bar or pie | Show fulltime vs internship split |
| `internship_stats` | Stat cards | Highest / Average / Count |
| `students_with_multiple_offers` | Badge/highlight | "42 students received 2+ offers" |

### Package Slab Labels
```js
const SLAB_LABELS = {
  below_3l:  '< ₹3 LPA',
  '3l_to_5l':  '₹3-5 LPA',
  '5l_to_8l':  '₹5-8 LPA',
  '8l_to_12l': '₹8-12 LPA',
  '12l_to_20l': '₹12-20 LPA',
  above_20l:  '₹20+ LPA',
};
```

---

## API #105c — Application Funnel (ON DEMAND)

**`GET /api/college/dashboard_application_funnel?passout_year=2026`**

### When to Call
User clicks **"Applications"** or **"Funnel Analysis"** tab.

### Success Response (200)
```json
{
  "success": true,
  "message": "Application funnel retrieved",
  "data": {
    "total_applications": 2450,
    "unique_applicants": 356,
    "pending": 120,
    "under_review": 85,
    "shortlisted": 430,
    "selected": 289,
    "offered": 53,
    "rejected": 1200,
    "withdrawn": 273,
    "selection_rate": 13.96,
    "applications_per_student": 6.88,
    "eligible_not_applied_count": 89
  }
}
```

### Recommended Visualizations
| Data | Chart Type | Notes |
|------|-----------|-------|
| Status breakdown | Funnel chart | Stages: Applied → Under Review → Shortlisted → Selected |
| `selection_rate` | Percentage badge | "13.96% selection rate" |
| `applications_per_student` | Stat card | "Avg 6.88 applications per student" |
| `eligible_not_applied_count` | Warning card (red) | "89 eligible students didn't apply!" — internal problem flag |
| `withdrawn` | Info card | "273 applications withdrawn" — may indicate issues |

### Internal Problem Indicators
- **`eligible_not_applied_count > 0`**: Students meeting criteria but not applying. TPO should investigate: awareness issue? motivation issue?
- **`withdrawn` is high**: Students are dropping out of process. Possible reasons: better offer elsewhere, company reputation, process too long.
- **`selection_rate < 10%`**: Either criteria too loose (too many unqualified Apply) or companies are very selective.

---

## API #105d — Student Readiness (ON DEMAND)

**`GET /api/college/dashboard_student_readiness?passout_year=2026`**

### When to Call
User clicks **"Students"** or **"Student Overview"** tab.

### Success Response (200)
```json
{
  "success": true,
  "message": "Student readiness data retrieved",
  "data": {
    "student_status": {
      "total_students": 420,
      "active": 380,
      "inactive": 10,
      "suspended": 5,
      "graduated": 20,
      "dropout": 5,
      "profile_complete": 310,
      "profile_incomplete": 110,
      "profile_approved": 290,
      "profile_pending_approval": 20
    },
    "restrictions": {
      "total_active_restrictions": 12,
      "bar_from_placements": 3,
      "bar_from_company": 4,
      "probation": 2,
      "warning": 2,
      "temporary_suspension": 1,
      "restricted_students": 10
    }
  }
}
```

### Recommended Visualizations
| Data | Chart Type | Notes |
|------|-----------|-------|
| `student_status` | Donut chart | Active vs Inactive vs others |
| Profile completeness | Progress bar | `310/420 = 73.8%` profile complete |
| Profile approval | Progress bar | `290/310 = 93.5%` approved |
| Restrictions | Stat card (red) | "10 students with active restrictions" |

### Internal Problem Indicators
- **`profile_incomplete > 25%`**: Many students haven't filled profiles — push notifications needed
- **`profile_pending_approval > 0`**: TPO needs to review and approve pending profiles
- **`restricted_students > 0`**: Show breakdown by restriction type

---

## API #105e — Diversity Statistics (ON DEMAND)

**`GET /api/college/dashboard_diversity_stats?passout_year=2026`**

### When to Call
User clicks **"Diversity"** or **"NAAC Reports"** tab.  
**Critical for:** NAAC accreditation, AICTE reports, college magazine, advertisement.

### Success Response (200)
```json
{
  "success": true,
  "message": "Diversity statistics retrieved",
  "data": {
    "gender_wise": [
      { "gender": "Male", "total": 280, "placed": 210, "placement_percentage": 75.00 },
      { "gender": "Female", "total": 115, "placed": 78, "placement_percentage": 67.83 },
      { "gender": "Other", "total": 3, "placed": 1, "placement_percentage": 33.33 }
    ],
    "category_wise": [
      { "category": "General", "total": 150, "placed": 120, "placement_percentage": 80.00 },
      { "category": "OBC", "total": 130, "placed": 90, "placement_percentage": 69.23 },
      { "category": "SC", "total": 45, "placed": 28, "placement_percentage": 62.22 },
      { "category": "ST", "total": 20, "placed": 10, "placement_percentage": 50.00 },
      { "category": "NT", "total": 25, "placed": 18, "placement_percentage": 72.00 },
      { "category": "VJ", "total": 15, "placed": 12, "placement_percentage": 80.00 },
      { "category": "SBC", "total": 10, "placed": 8, "placement_percentage": 80.00 },
      { "category": "Not specified", "total": 3, "placed": 3, "placement_percentage": 100.00 }
    ]
  }
}
```

### Recommended Visualizations
| Data | Chart Type | Notes |
|------|-----------|-------|
| `gender_wise` | Grouped bar chart | Male/Female/Other — total vs placed |
| `category_wise` | Horizontal bar chart | Category on Y-axis, placement % on X-axis |
| Both | Data table | For NAAC/AICTE report export |

### Use Cases
- **NAAC Self-Study Report (SSR)**: Criterion 5.2 — Student Progression → Placement data by gender/category
- **Advertisement**: "75% male placement, 68% female placement" — shows inclusive placement
- **Internal Analysis**: Identify categories with low placement % → targeted training programs

---

## API #105f — Training & Feedback Stats (ON DEMAND)

**`GET /api/college/dashboard_training_stats?passout_year=2026`**

### When to Call
User clicks **"Training & Feedback"** tab.

### Success Response (200)
```json
{
  "success": true,
  "message": "Training & feedback statistics retrieved",
  "data": {
    "training": {
      "total_programs": 12,
      "upcoming": 2,
      "enrollment_open": 1,
      "in_progress": 3,
      "completed": 5,
      "cancelled": 1,
      "total_enrolled": 580,
      "total_completed_enrollment": 420,
      "total_dropped": 45,
      "overall_avg_rating": 3.8
    },
    "feedback": {
      "total_feedback": 180,
      "average_rating": 3.6,
      "five_star": 35,
      "four_star": 55,
      "three_star": 50,
      "two_star": 25,
      "one_star": 15
    }
  }
}
```

### Recommended Visualizations
| Data | Chart Type | Notes |
|------|-----------|-------|
| Training programs by status | Stacked bar | Color-coded status segments |
| `total_enrolled` vs `total_completed` | Progress ring | Completion rate = 420/580 = 72.4% |
| `overall_avg_rating` | Star rating | ★★★★☆ (3.8/5) |
| Feedback distribution | Horizontal bar | 5→1 star bars |
| `total_dropped` | Warning badge | If high, indicates training quality issues |

### Internal Problem Indicators
- **`total_dropped / total_enrolled > 15%`**: High dropout → training quality/relevance issue
- **`average_rating < 3.0`**: Students unhappy with placement process
- **Low `total_enrolled` relative to students**: Need better awareness of training programs

---

## API #106 — Department-Wise Statistics (ON DEMAND)

**`GET /api/college/dashboard_department_wise?passout_year=2026`**  
**`GET /api/college/dashboard_department_wise?passout_year=2026&dept_id={uuid}`** (single dept detail)

### When to Call
User clicks **"Departments"** tab.

### Query Parameters
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `passout_year` | integer | Yes | Batch year |
| `dept_id` | UUID | No | Filter for single department detail |

### Success Response (200) — All Departments
```json
{
  "success": true,
  "message": "Department-wise statistics retrieved",
  "data": [
    {
      "dept_id": "uuid-1",
      "dept_name": "Computer Engineering",
      "total_students": 120,
      "placed_count": 105,
      "placement_percentage": 87.50,
      "unplaced_count": 15,
      "highest_package": 2400000,
      "average_package": 750000,
      "avg_cgpa": 7.85,
      "profile_complete_count": 115
    },
    {
      "dept_id": "uuid-2",
      "dept_name": "Electronics & Telecom",
      "total_students": 80,
      "placed_count": 52,
      "placement_percentage": 65.00,
      "unplaced_count": 28,
      "highest_package": 1200000,
      "average_package": 520000,
      "avg_cgpa": 7.20,
      "profile_complete_count": 68
    }
  ]
}
```

### Recommended Visualizations
| Data | Chart Type | Notes |
|------|-----------|-------|
| All departments | Data table (sortable) | Columns: Dept, Total, Placed, %, Avg Pkg, Highest Pkg |
| `placement_percentage` | Bar chart | Department on X-axis, % on Y-axis |
| `average_package` | Grouped bars | Compare package across departments |
| `avg_cgpa` | Column in table | Academic quality indicator |
| `profile_complete_count` | Progress column | `115/120 = 95.8%` |

### Use Cases
- **Higher Authorities**: "Computer Eng has 87.5% placement while EXTC has 65%" — resource allocation decisions
- **Companies**: Show per-department talent pool quality
- **Internal**: Identify weak departments needing more training/support

---

## API #107 — Company-Wise Statistics (ON DEMAND)

**`GET /api/college/dashboard_company_wise?passout_year=2026`**  
**`GET /api/college/dashboard_company_wise?passout_year=2026&company_id={uuid}`** (single company)

### When to Call
User clicks **"Companies"** tab.

### Query Parameters
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `passout_year` | integer | Yes | Batch year |
| `company_id` | UUID | No | Filter for single company detail |

### Success Response (200)
```json
{
  "success": true,
  "message": "Company-wise statistics retrieved",
  "data": [
    {
      "company_id": "uuid-a",
      "company_name": "TCS",
      "industry": "IT Services",
      "total_jobs": 3,
      "total_positions": 50,
      "total_applications": 320,
      "shortlisted": 120,
      "selected": 45,
      "rejected": 175,
      "selection_rate": 14.06,
      "offers_made": 45,
      "avg_package": 700000,
      "highest_package": 700000,
      "feedback_avg_rating": 4.2,
      "feedback_count": 30
    },
    {
      "company_id": "uuid-b",
      "company_name": "Infosys",
      "industry": "IT Services",
      "total_jobs": 2,
      "total_positions": 30,
      "total_applications": 250,
      "shortlisted": 80,
      "selected": 28,
      "rejected": 170,
      "selection_rate": 11.20,
      "offers_made": 28,
      "avg_package": 650000,
      "highest_package": 800000,
      "feedback_avg_rating": 3.8,
      "feedback_count": 18
    }
  ]
}
```

### Recommended Visualizations
| Data | Chart Type | Notes |
|------|-----------|-------|
| All companies | Data table (sortable) | Sort by offers_made DESC by default |
| Top 10 hirers | Horizontal bar | Company name vs offers count |
| `selection_rate` | Column in table | Color-code: green (>20%), yellow (10-20%), red (<10%) |
| `feedback_avg_rating` | Star display | ★★★★☆ inline |
| Industry distribution | Pie/donut chart | Group companies by industry, sum offers |

### Use Cases
- **Advertisement**: "45 students placed in TCS, 28 in Infosys"
- **Company Relations**: Identify companies with low selection → discuss criteria alignment
- **For Companies**: Show your hiring history at this college per year
- **Internal**: `companies with 0 selections` (came but didn't hire) — investigate why

---

## API #108 — Year Comparison (ON DEMAND)

**`GET /api/college/dashboard_year_comparison?passout_years=2026,2025,2024`**

### When to Call
User clicks **"Year Comparison"** or **"Trends"** tab.

### Query Parameters
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `passout_years` | string | Yes | 2-5 comma-separated years (e.g., `2026,2025,2024`) |

### Validation
- Minimum 2 years, maximum 5 years
- Each year must be 4 digits (2000-2100)
- Format: comma-separated, no spaces

### Success Response (200)
```json
{
  "success": true,
  "message": "Year comparison data retrieved",
  "data": [
    {
      "passout_year": 2026,
      "total_students": 398,
      "placed_count": 289,
      "placement_percentage": 72.61,
      "total_offers": 342,
      "fulltime_count": 280,
      "internship_count": 62,
      "highest_package": 2400000,
      "average_package": 620000,
      "total_companies": 45,
      "total_jobs": 62,
      "total_applications": 2450,
      "selection_rate": 13.96
    },
    {
      "passout_year": 2025,
      "total_students": 380,
      "placed_count": 260,
      "placement_percentage": 68.42,
      "total_offers": 300,
      "fulltime_count": 250,
      "internship_count": 50,
      "highest_package": 2000000,
      "average_package": 580000,
      "total_companies": 38,
      "total_jobs": 52,
      "total_applications": 2100,
      "selection_rate": 12.38
    },
    {
      "passout_year": 2024,
      "total_students": 360,
      "placed_count": 240,
      "placement_percentage": 66.67,
      "total_offers": 270,
      "fulltime_count": 230,
      "internship_count": 40,
      "highest_package": 1800000,
      "average_package": 520000,
      "total_companies": 32,
      "total_jobs": 45,
      "total_applications": 1800,
      "selection_rate": 11.67
    }
  ]
}
```

### Recommended Visualizations
| Data | Chart Type | Notes |
|------|-----------|-------|
| `placement_percentage` | Line chart (primary) | Year-over-year trend — the headline chart |
| `average_package` | Line chart | Package growth trend |
| `highest_package` | Line chart overlaid | Show ceiling growth |
| `total_companies` | Bar chart | Company engagement trend |
| All fields | Comparison table | Side-by-side columns per year |

### Computed Frontend Metrics
```js
// Package growth % (current vs previous year)
function getGrowth(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous * 100).toFixed(2);
}

// Example: Average package grew 6.9% from 2025 to 2026
const growth = getGrowth(620000, 580000); // "6.90"
```

### Use Cases
- **AICTE Reports**: Year-over-year placement data is mandatory
- **Advertisement**: "Placement rate improved from 67% to 73% in 3 years"
- **Higher Authorities**: Trend shows whether placement cell is improving
- **Internal**: Identify declining metrics for course correction

---

## Full Dashboard UI Wireframe

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Dashboard                              [Year: 2026 ▼] [↻ Refresh]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ 72.61%  │  │ ₹6.20L  │  │   45    │  │   342   │  │   109   │     │
│  │Placement│  │ Avg Pkg │  │Companies│  │ Offers  │  │Unplaced │     │
│  │  Rate   │  │         │  │ Visited │  │  Made   │  │Students │     │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │
│                                                                         │
│  ← These 5 cards load from dashboard_overview (ON LOGIN) →             │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [Placement] [Applications] [Students] [Departments] [Companies]       │
│  [Diversity] [Training] [Year Comparison]                               │
│                                                                         │
│  ← Tabs below are LAZY LOADED — API fires only when tab is clicked →   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │              Tab Content Area (API data renders here)           │   │
│  │                                                                 │   │
│  │   Loading spinner shown while API is fetching                   │   │
│  │   Data cached after first load — no re-fetch on tab switch     │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Passout Year Dropdown Behavior

1. **Default**: Use `college.default_academic_year` from login response
2. **On Change**: Clear ALL cached tab data → re-fetch overview for new year
3. **Tab data**: NOT pre-fetched for new year — lazy-load when user clicks tab
4. **Year options**: Derive from available data or use last 5 years

```js
function onYearChange(newYear) {
  setPassoutYear(newYear);
  setTabData({});           // Clear all cached tab data
  fetchOverview(newYear);   // Re-fetch overview only
  setActiveTab('overview'); // Reset to overview tab
}
```

---

## Error Handling

All endpoints return standard error responses:

```json
{
  "success": false,
  "error": "passout_year is required",
  "details": [...]
}
```

| Status | Meaning | Frontend Action |
|--------|---------|----------------|
| 400 | Validation error | Show inline error message |
| 401 | Not authenticated | Redirect to login |
| 403 | Not authorized (wrong role) | Show "Access Denied" |
| 429 | Rate limited | Show "Too many requests, try again later" |
| 500 | Server error | Show generic error + retry button |

---

## Who Uses What — Statistics by Audience

### For Higher Authorities (Principal, University, NAAC, AICTE)
| Stat | Source API | Report Usage |
|------|----------|--------------|
| Overall placement % | `dashboard_overview` | NAAC SSR Criterion 5.2 |
| Avg/Highest package | `dashboard_overview` | Annual report headline |
| Year-over-year trend | `dashboard_year_comparison` | AICTE mandatory, shows improvement |
| Department-wise placement | `dashboard_department_wise` | Resource allocation decisions |
| Gender-wise placement | `dashboard_diversity_stats` | NAAC diversity mandate |
| Category-wise placement | `dashboard_diversity_stats` | Reservation/equity analysis |
| Company count & industry distribution | `dashboard_company_wise` | Industry engagement metric |

### For Advertisement (Prospectus, Website, Social Media)
| Stat | Source API | Ad Usage |
|------|----------|----------|
| Placement % | `dashboard_overview` | "73% placement rate!" |
| Highest package | `dashboard_overview` | "₹24 LPA highest offer!" |
| Total companies | `dashboard_overview` | "45+ companies visited" |
| Package growth | `dashboard_year_comparison` | "Avg package grew 50% in 3 years" |
| Top hiring companies | `dashboard_company_wise` | Company logos on website |
| Department highlights | `dashboard_department_wise` | "CS: 87% placement, ₹24L highest" |

### For Company Presentations (Pre-Placement Talks)
| Stat | Source API | Presentation Usage |
|------|----------|-------------------|
| Department-wise CGPA | `dashboard_department_wise` | Talent pool academic quality |
| Department-wise student count | `dashboard_department_wise` | Available talent pool size |
| Profile complete % | `dashboard_student_readiness` | Students ready for applications |
| Training programs | `dashboard_training_stats` | "12 training programs conducted" |
| Previous year data | `dashboard_year_comparison` | Historical placement trend |

### For Internal Problem Identification (TPO/Admin)
| Problem | Source API | What to Look For |
|---------|----------|-----------------|
| Students not applying | `dashboard_application_funnel` | `eligible_not_applied_count > 0` |
| High withdrawal rate | `dashboard_application_funnel` | `withdrawn` count high |
| Low selection rate | `dashboard_application_funnel` | `selection_rate < 10%` |
| Incomplete profiles | `dashboard_student_readiness` | `profile_incomplete > 25%` |
| Active restrictions | `dashboard_student_readiness` | `restricted_students > 0` |
| Training dropouts | `dashboard_training_stats` | `total_dropped / total_enrolled > 15%` |
| Low feedback scores | `dashboard_training_stats` | `average_rating < 3.0` |
| Department lagging | `dashboard_department_wise` | Compare placement % across depts |
| Companies not selecting | `dashboard_company_wise` | Companies with applications but 0 offers |
| Declining trends | `dashboard_year_comparison` | Year-over-year comparison dropping |
| Gender/category gap | `dashboard_diversity_stats` | Low placement % for specific groups |

---

## React Implementation Example

```jsx
import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api/college';

const TAB_ENDPOINTS = {
  placement:   'dashboard_placement_stats',
  funnel:      'dashboard_application_funnel',
  students:    'dashboard_student_readiness',
  diversity:   'dashboard_diversity_stats',
  training:    'dashboard_training_stats',
  departments: 'dashboard_department_wise',
  companies:   'dashboard_company_wise',
};

export function useDashboard(initialYear) {
  const [passoutYear, setPassoutYear] = useState(initialYear);
  const [overview, setOverview] = useState(null);
  const [tabData, setTabData] = useState({});
  const [loading, setLoading] = useState({ overview: true });

  // Fetch overview ON LOGIN
  useEffect(() => {
    setLoading(prev => ({ ...prev, overview: true }));
    fetch(`${API_BASE}/dashboard_overview?passout_year=${passoutYear}`)
      .then(res => res.json())
      .then(json => {
        setOverview(json.data);
        setLoading(prev => ({ ...prev, overview: false }));
      });
  }, [passoutYear]);

  // Lazy-load tab data
  const loadTab = useCallback(async (tab) => {
    if (tabData[tab]) return; // Already cached

    setLoading(prev => ({ ...prev, [tab]: true }));

    const endpoint = TAB_ENDPOINTS[tab];
    const res = await fetch(
      `${API_BASE}/${endpoint}?passout_year=${passoutYear}`
    );
    const json = await res.json();

    setTabData(prev => ({ ...prev, [tab]: json.data }));
    setLoading(prev => ({ ...prev, [tab]: false }));
  }, [passoutYear, tabData]);

  // Year comparison (special — needs years array)
  const loadYearComparison = useCallback(async (years) => {
    if (tabData.yearComparison) return;

    setLoading(prev => ({ ...prev, yearComparison: true }));
    const res = await fetch(
      `${API_BASE}/dashboard_year_comparison?passout_years=${years.join(',')}`
    );
    const json = await res.json();

    setTabData(prev => ({ ...prev, yearComparison: json.data }));
    setLoading(prev => ({ ...prev, yearComparison: false }));
  }, [tabData]);

  // Change year — clear cache
  const changeYear = useCallback((newYear) => {
    setPassoutYear(newYear);
    setTabData({});
  }, []);

  // Manual refresh
  const refresh = useCallback(() => {
    setTabData({});
    setOverview(null);
  }, []);

  return {
    passoutYear, overview, tabData, loading,
    loadTab, loadYearComparison, changeYear, refresh
  };
}
```

---

## Performance Notes

| Aspect | Detail |
|--------|--------|
| Login load | **1 API call** — `dashboard_overview` uses a single CTE query (1 DB round-trip) |
| Tab load | **1 API call per tab** — each uses 1-3 parallel queries via `Promise.all()` |
| Caching | Frontend caches per-tab per-year — no re-fetch until year changes |
| DB indexes | Placement queries use `college_id + passout_year` which matches existing indexes |
| No N+1 | Department/Company queries use subquery JOINs, not correlated subqueries |
| Median | Uses PostgreSQL `PERCENTILE_CONT` — computed in-database, not in JS |

---

## Test Scenarios

### Overview Tests
| # | Test | passout_year | Expected |
|---|------|-------------|----------|
| 1 | Valid year with data | 2026 | 200, all fields populated |
| 2 | Valid year with no data | 2030 | 200, all zeros |
| 3 | Missing passout_year | — | 400, validation error |
| 4 | Invalid year (text) | "abc" | 400, validation error |
| 5 | Year below range | 1999 | 400, validation error |
| 6 | Unauthenticated | — | 401 |
| 7 | Student role (forbidden) | 2026 | 403 |
| 8 | Teacher role (forbidden) | 2026 | 403 |

### Placement Stats Tests
| # | Test | Expected |
|---|------|----------|
| 9 | Valid request | 200, package_slabs + offer_breakdown + internship_stats |
| 10 | Year with no placements | 200, all slab counts = 0 |
| 11 | Only internship placements | 200, package slabs all 0, internship_stats populated |

### Application Funnel Tests
| # | Test | Expected |
|---|------|----------|
| 12 | Valid request | 200, all status counts + selection_rate + eligible_not_applied |
| 13 | No applications | 200, all zeros, selection_rate = 0 |

### Student Readiness Tests
| # | Test | Expected |
|---|------|----------|
| 14 | Valid request | 200, student_status + restrictions objects |
| 15 | No restrictions | 200, all restriction counts = 0 |

### Diversity Tests
| # | Test | Expected |
|---|------|----------|
| 16 | Valid request | 200, gender_wise array + category_wise array |
| 17 | Students with no personal info | 200, "Not specified" in gender/category |

### Training Tests
| # | Test | Expected |
|---|------|----------|
| 18 | Valid request | 200, training + feedback objects |
| 19 | No training programs | 200, all counts = 0 |
| 20 | No feedback | 200, feedback counts = 0, average = 0 |

### Department-Wise Tests
| # | Test | Expected |
|---|------|----------|
| 21 | All departments | 200, array of department objects |
| 22 | Single dept_id | 200, array with 1 department |
| 23 | Invalid dept_id | 400, UUID validation error |
| 24 | Dept with no students | 200, all zeros for that dept |

### Company-Wise Tests
| # | Test | Expected |
|---|------|----------|
| 25 | All companies | 200, array sorted by offers DESC |
| 26 | Single company_id | 200, array with 1 company |
| 27 | Company with no offers | Not in results (filtered out) |

### Year Comparison Tests
| # | Test | Expected |
|---|------|----------|
| 28 | 3 valid years | 200, array with 3 objects sorted DESC |
| 29 | 2 years (minimum) | 200, array with 2 objects |
| 30 | 5 years (maximum) | 200, array with 5 objects |
| 31 | 1 year only | 400, validation error (need 2+) |
| 32 | 6 years | 400, validation error (max 5) |
| 33 | Invalid format | 400, "must be 2-5 comma-separated years" |
| 34 | Years with no data | 200, all zeros for those years |

### Cross-Cutting Tests
| # | Test | Expected |
|---|------|----------|
| 35 | Multi-tenant isolation | College A data not visible to College B |
| 36 | Dropout students excluded | Overview total_students excludes dropouts |
| 37 | Cancelled placements excluded | Not counted in placed_count |
| 38 | Rate limiting | 429 after exceeding limit |
