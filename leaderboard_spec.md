# SideKick Leaderboard System

## Overview
Add a leaderboard to SideKick with two views: **Global** (all users) and **Class** (students within a teacher's class). Accessible from the main nav sidebar.

---

## Data Available
All data needed already exists in Supabase:

```
users             — id, full_name, role, streak, created_at
user_attempts     — user_id, question_id, is_correct, created_at
class_members     — user_id, class_id
classes           — id, name, teacher_id, join_code
```

---

## What to Build

### 1. Backend — New Supabase SQL Functions

#### `get_global_leaderboard(limit int)`
Returns top N users ranked by accuracy (min 10 attempts to qualify).

```sql
SELECT
  u.id,
  u.full_name,
  COUNT(a.id) AS total_attempts,
  SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END) AS correct,
  ROUND(100.0 * SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END) / COUNT(a.id), 1) AS accuracy,
  u.streak
FROM users u
JOIN user_attempts a ON a.user_id = u.id
WHERE u.role = 'student'
GROUP BY u.id, u.full_name, u.streak
HAVING COUNT(a.id) >= 10
ORDER BY accuracy DESC, total_attempts DESC
LIMIT limit;
```

#### `get_class_leaderboard(class_id uuid)`
Same but scoped to one class — no minimum attempt requirement.

```sql
SELECT
  u.id,
  u.full_name,
  COUNT(a.id) AS total_attempts,
  SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END) AS correct,
  ROUND(100.0 * SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END) / COUNT(a.id), 1) AS accuracy,
  u.streak
FROM users u
JOIN class_members cm ON cm.user_id = u.id
LEFT JOIN user_attempts a ON a.user_id = u.id
WHERE cm.class_id = class_id
GROUP BY u.id, u.full_name, u.streak
ORDER BY accuracy DESC, total_attempts DESC;
```

#### `get_current_user_rank(user_id uuid)`
Returns the logged-in user's rank on the global board (so they can see their position even if not in top 10).

```sql
WITH ranked AS (
  SELECT
    u.id,
    RANK() OVER (ORDER BY
      ROUND(100.0 * SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id),0), 1) DESC,
      COUNT(a.id) DESC
    ) AS rank,
    COUNT(a.id) AS total_attempts,
    ROUND(100.0 * SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id),0), 1) AS accuracy
  FROM users u
  JOIN user_attempts a ON a.user_id = u.id
  WHERE u.role = 'student'
  GROUP BY u.id
  HAVING COUNT(a.id) >= 10
)
SELECT * FROM ranked WHERE id = user_id;
```

---

### 2. Frontend — Leaderboard Page

**Route:** `/leaderboard`

**Add to sidebar nav** (between Analytics and the bottom) with a 🏆 icon.

#### Layout
```
┌─────────────────────────────────────┐
│  🏆 Leaderboard                     │
│                                     │
│  [Global]  [My Class]   ← tab toggle│
│                                     │
│  ┌──────────────────────────────┐   │
│  │ # │ Name        │ Acc  │ 🔥 │   │
│  │ 1 │ Alice Tan   │ 94%  │ 12 │   │
│  │ 2 │ Bob Lim     │ 91%  │  8 │   │
│  │ 3 │ You ←       │ 88%  │  5 │   │  ← highlight current user
│  └──────────────────────────────┘   │
│                                     │
│  ── Your rank: #3 of 42 students ── │  ← shown below table
└─────────────────────────────────────┘
```

#### Tab behaviour
- **Global tab**: calls `get_global_leaderboard(50)`. Shows top 50. If current user not in top 50, show their row pinned at the bottom with a divider and their rank.
- **My Class tab**: calls `get_class_leaderboard(classId)` for the user's class. If user is not in any class, show an empty state: *"You're not in a class yet. Ask your teacher for a join code."*

#### Row styling
- **Rank 1**: gold accent `#F59E0B`
- **Rank 2**: silver accent `#9CA3AF`
- **Rank 3**: bronze accent `#B45309`
- **Current user row**: subtle highlight (light orange background), bold name
- **Streak**: show 🔥 icon + number, grey out if streak = 0

#### Columns
| Column | Value | Notes |
|--------|-------|-------|
| Rank | #1, #2 ... | Medal emoji for top 3 |
| Name | full_name | Truncate at 20 chars |
| Accuracy | 88.5% | Colour: green ≥80%, amber 60–79%, red <60% |
| Questions | 42 | Total attempts |
| Streak | 🔥5 | From users.streak |

---

### 3. API/Service layer

Create a `leaderboardService.js` (or equivalent in your pattern):

```js
// Get global leaderboard
export async function getGlobalLeaderboard() {
  const { data, error } = await supabase.rpc('get_global_leaderboard', { limit: 50 })
  return { data, error }
}

// Get class leaderboard
export async function getClassLeaderboard(classId) {
  const { data, error } = await supabase.rpc('get_class_leaderboard', { class_id: classId })
  return { data, error }
}

// Get current user's rank on global board
export async function getCurrentUserRank(userId) {
  const { data, error } = await supabase.rpc('get_current_user_rank', { user_id: userId })
  return { data, error }
}

// Get user's class (to know which class leaderboard to load)
export async function getUserClass(userId) {
  const { data, error } = await supabase
    .from('class_members')
    .select('class_id, classes(id, name)')
    .eq('user_id', userId)
    .single()
  return { data, error }
}
```

---

## Implementation Order

1. **Run the 3 SQL functions** in Supabase SQL Editor first
2. **Create leaderboardService.js**
3. **Build the leaderboard page component**
4. **Add the nav link** to the sidebar
5. **Test** with at least 2 student accounts

---

## Out of Scope (for now)
- Weekly / monthly filters (all-time only for now)
- Subject-specific leaderboards (E. Math vs A. Math)
- Push notifications for rank changes
- Animated rank transitions

---

## Notes
- The minimum 10 attempts threshold on global prevents new accounts from topping the board with 1/1 = 100%
- Class leaderboard has no minimum — a student with 1 attempt still shows up so teachers can see everyone
- RLS: ensure `get_global_leaderboard` only exposes `full_name`, not emails or sensitive fields
- The "My Class" tab should only appear if the user is in a class (`class_members` row exists)
