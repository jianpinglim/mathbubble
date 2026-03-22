-- DATABASE SCHEMA CHANGES FOR TEACHER DASHBOARD
-- Run these SQL commands in your Supabase SQL editor to set up the teacher dashboard

-- ===========================
-- 1. ALTER USERS TABLE
-- ===========================
-- Add role column to users table (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text DEFAULT 'student';

-- Create index on role for faster queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ===========================
-- 2. CREATE CLASSES TABLE
-- ===========================
CREATE TABLE IF NOT EXISTS classes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    join_code text UNIQUE NOT NULL,
    subject text DEFAULT 'Mathematics',
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create indices for classes table
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_join_code ON classes(join_code);

-- ===========================
-- 3. CREATE CLASS_MEMBERS TABLE
-- ===========================
CREATE TABLE IF NOT EXISTS class_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at timestamp with time zone DEFAULT now(),
    UNIQUE(class_id, student_id)
);

-- Create indices for class_members table
CREATE INDEX IF NOT EXISTS idx_class_members_class_id ON class_members(class_id);
CREATE INDEX IF NOT EXISTS idx_class_members_student_id ON class_members(student_id);

-- ===========================
-- 4. SET UP ROW LEVEL SECURITY (RLS)
-- ===========================

-- Enable RLS on classes
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Classes: Teachers can only see their own classes
CREATE POLICY classes_teacher_select ON classes
FOR SELECT USING (teacher_id = auth.uid());

CREATE POLICY classes_teacher_insert ON classes
FOR INSERT WITH CHECK (teacher_id = auth.uid());

CREATE POLICY classes_teacher_update ON classes
FOR UPDATE USING (teacher_id = auth.uid());

CREATE POLICY classes_teacher_delete ON classes
FOR DELETE USING (teacher_id = auth.uid());

-- Students can see classes they're enrolled in (for join verification)
CREATE POLICY classes_student_select ON classes
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM class_members
        WHERE class_members.class_id = classes.id
        AND class_members.student_id = auth.uid()
    )
    OR join_code IS NOT NULL -- Allow public join code lookup
);

-- Enable RLS on class_members
ALTER TABLE class_members ENABLE ROW LEVEL SECURITY;

-- Class members: Teachers can manage their class members
CREATE POLICY class_members_teacher_select ON class_members
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = class_members.class_id
        AND classes.teacher_id = auth.uid()
    )
);

CREATE POLICY class_members_teacher_insert ON class_members
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = class_members.class_id
        AND classes.teacher_id = auth.uid()
    )
);

CREATE POLICY class_members_teacher_delete ON class_members
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM classes
        WHERE classes.id = class_members.class_id
        AND classes.teacher_id = auth.uid()
    )
);

-- Students can see their own class memberships
CREATE POLICY class_members_student_select ON class_members
FOR SELECT USING (student_id = auth.uid());

CREATE POLICY class_members_student_insert ON class_members
FOR INSERT WITH CHECK (student_id = auth.uid());

-- ===========================
-- 5. HELPER SQL FUNCTIONS
-- ===========================

-- Function to generate unique join code
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS text AS $$
DECLARE
    code text;
BEGIN
    code := 'SK-' || upper(substr(md5(random()::text), 1, 4));
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_classes_timestamp ON classes;
CREATE TRIGGER update_classes_timestamp
BEFORE UPDATE ON classes
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ===========================
-- 6. HELPFUL QUERIES FOR DATA MIGRATION
-- ===========================

-- Set specific users as teachers
-- UPDATE users SET role = 'teacher' WHERE id = 'user-id-here';

-- Create a test class for a teacher
-- INSERT INTO classes (teacher_id, name, join_code, subject)
-- VALUES ('teacher-id', 'Class Name', generate_join_code(), 'Mathematics');

-- Add students to a class
-- INSERT INTO class_members (class_id, student_id)
-- VALUES ('class-id', 'student-id');

-- ===========================
-- 7. DATA VALIDATION QUERIES
-- ===========================

-- View all teachers
-- SELECT id, email, full_name, role FROM users WHERE role = 'teacher';

-- View all classes for a teacher
-- SELECT * FROM classes WHERE teacher_id = 'teacher-id';

-- View all students in a class
-- SELECT u.id, u.email, u.full_name
-- FROM users u
-- JOIN class_members cm ON u.id = cm.student_id
-- WHERE cm.class_id = 'class-id';

-- View class statistics (questions answered, accuracy)
-- SELECT 
--     COUNT(DISTINCT ua.id) as total_questions,
--     COUNT(CASE WHEN ua.is_correct THEN 1 END) as correct_answers,
--     ROUND(100.0 * COUNT(CASE WHEN ua.is_correct THEN 1 END) / COUNT(DISTINCT ua.id), 2) as accuracy_percent
-- FROM user_attempts ua
-- JOIN class_members cm ON ua.user_id = cm.student_id
-- WHERE cm.class_id = 'class-id';
