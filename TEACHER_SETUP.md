# Teacher Dashboard - Database Setup Guide

## Overview

This document provides instructions for setting up the database tables and configurations needed for the teacher dashboard feature in SideKick.

## Database Schema Changes

### Summary of Changes

1. **users table** - Add `role` column to distinguish teachers from students
2. **classes table** - New table to store class information
3. **class_members table** - New junction table linking students to classes
4. **Row Level Security (RLS)** - Implement security policies to ensure data privacy
5. **Helper Functions** - Add utility functions for code generation and timestamp management

## Setup Instructions

### Step 1: Run SQL Schema Script

1. Go to your Supabase dashboard
2. Navigate to the SQL Editor
3. Create a new query
4. Copy all contents from `TEACHER_DATABASE_SETUP.sql`
5. Run the script

### Step 2: Verify Database Setup

After running the script, verify the tables were created:

```sql
-- Check users table has role column
SELECT column_name FROM information_schema.columns 
WHERE table_name='users' AND column_name='role';

-- Check classes table exists
SELECT * FROM information_schema.tables 
WHERE table_name='classes';

-- Check class_members table exists
SELECT * FROM information_schema.tables 
WHERE table_name='class_members';
```

### Step 3: Configure Initial Teachers

```sql
-- Set specific users as teachers
UPDATE users SET role = 'teacher' 
WHERE id = 'user-uuid-here';

-- Verify the update
SELECT id, email, full_name, role FROM users 
WHERE role = 'teacher';
```

### Step 4: Test Create a Class

```sql
-- Create a test class
INSERT INTO classes (teacher_id, name, join_code, subject)
VALUES (
    'teacher-uuid-here',
    'Class Name',
    'SK-' || upper(substr(md5(random()::text), 1, 4)),
    'Mathematics - O-Level'
);
```

## Database Tables

### users table

**New column:**
```sql
role text DEFAULT 'student'
-- Values: 'student' or 'teacher'
```

### classes table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| teacher_id | uuid | Foreign key to users table |
| name | text | Class name (e.g., "Sec 3A Class") |
| join_code | text | Unique 6-character code for students to join (e.g., "SK-4A29") |
| subject | text | Subject name (default: "Mathematics") |
| created_at | timestamp | Timestamp when class was created |
| updated_at | timestamp | Timestamp of last update |

### class_members table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| class_id | uuid | Foreign key to classes table |
| student_id | uuid | Foreign key to users table |
| joined_at | timestamp | Timestamp when student joined the class |

**Constraint:** Each combination of class_id and student_id must be unique

## Row Level Security (RLS) Policies

### classes table

- **Teachers** can only view, create, update, and delete their own classes
- **Students** can view classes they're enrolled in and can look up classes by join code
- **Public** can verify join code exists (for joining flow)

### class_members table

- **Teachers** can view and manage all members in their classes
- **Students** can only see their own class memberships

## Helper Functions

### `generate_join_code()`

Generates a random 6-character join code in the format "SK-XXXX"

**Usage:**
```sql
INSERT INTO classes (teacher_id, name, join_code, subject)
VALUES ('teacher-id', 'Class Name', generate_join_code(), 'Subject');
```

### `update_timestamp()`

Automatically updates the `updated_at` column whenever a record is modified

## Common Queries

### Get all students in a class

```sql
SELECT u.* FROM users u
JOIN class_members cm ON u.id = cm.student_id
WHERE cm.class_id = 'class-id';
```

### Get class statistics

```sql
SELECT 
    COUNT(DISTINCT ua.id) as total_attempts,
    COUNT(CASE WHEN ua.is_correct THEN 1 END) as correct_answers,
    ROUND(100.0 * COUNT(CASE WHEN ua.is_correct THEN 1 END) / COUNT(ua.id), 2) as accuracy_percent
FROM user_attempts ua
JOIN class_members cm ON ua.user_id = cm.student_id
WHERE cm.class_id = 'class-id';
```

### Get weak topics for a class

```sql
SELECT 
    ua.topic,
    COUNT(*) as attempts,
    COUNT(CASE WHEN ua.is_correct THEN 1 END) as correct,
    ROUND(100.0 * COUNT(CASE WHEN ua.is_correct THEN 1 END) / COUNT(*), 2) as accuracy_percent
FROM user_attempts ua
JOIN class_members cm ON ua.user_id = cm.student_id
WHERE cm.class_id = 'class-id'
GROUP BY ua.topic
ORDER BY accuracy_percent ASC;
```

### Get active students today

```sql
SELECT DISTINCT cm.student_id, u.full_name
FROM class_members cm
JOIN user_attempts ua ON cm.student_id = ua.user_id
JOIN users u ON cm.student_id = u.id
WHERE cm.class_id = 'class-id'
AND DATE(ua.created_at) = CURRENT_DATE;
```

## Migration Guide (Existing Users)

If you have existing users and want to designate some as teachers:

```sql
-- Step 1: Update specific users to teacher role
BEGIN;

UPDATE users SET role = 'teacher' 
WHERE email IN (
    'teacher1@example.com',
    'teacher2@example.com'
);

-- Step 2: Create classes for these teachers
INSERT INTO classes (teacher_id, name, join_code, subject)
SELECT 
    u.id,
    'Class Name',
    generate_join_code(),
    'Mathematics - O-Level'
FROM users u
WHERE u.role = 'teacher'
AND NOT EXISTS (
    SELECT 1 FROM classes WHERE classes.teacher_id = u.id
);

COMMIT;
```

## Troubleshooting

### Issue: Permission denied when accessing classes table

**Solution:** Make sure you have enabled RLS on the tables and created the appropriate policies. Run the RLS section of the SQL script again.

### Issue: Student can't join a class

**Solution:** Verify:
1. The join code exists in the `classes` table
2. The student's ID is correctly inserted into `class_members`
3. RLS policies on `class_members` allow student inserts

### Issue: Teacher can't see their class

**Solution:** Verify:
1. The teacher's ID is correctly set as `teacher_id` in the `classes` row
2. The teacher's `role` in the `users` table is set to 'teacher'
3. RLS policies are enabled

## Next Steps

1. ✅ Run the SQL schema setup script
2. ✅ Verify the tables were created successfully
3. ✅ Set initial teachers using UPDATE queries
4. ✅ Test the teacher login page: `/teacher/login`
5. ✅ Test the teacher dashboard: `/teacher`
6. ✅ Implement "Create Class" feature (currently shows placeholder)
7. ✅ Implement student "Join Class" feature on index.html
8. ⏳ Monitor teacher dashboard usage and gather feedback

## Support

For issues or questions:
- Check the troubleshooting section above
- Review the Supabase documentation on RLS: https://supabase.com/docs/guides/auth/row-level-security
- Check browser console for JavaScript errors
- Review server logs for backend errors
