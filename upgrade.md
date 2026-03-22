Build a teacher dashboard for SideKick, a Singapore O-Level math quiz app.
The existing app uses Vanilla JS, Express + Node.js backend, Supabase for 
the database, and is deployed on Railway. Match the existing design exactly:
white background, Nunito font, #F5B000 yellow as the primary accent color,
clean minimal cards with subtle borders.

PAGES TO BUILD:

1. /teacher/login — Separate login page for teachers
   - Same Google OAuth flow as students (reuse auth.js)
   - After login, check users table for role = 'teacher'
   - If not a teacher, redirect to /login with error message

2. /teacher — Teacher dashboard (the main page)

LAYOUT: Same sidebar layout as index.html
Sidebar items: Dashboard, Students, Questions (coming soon), Reports (coming soon)
Show teacher's name and avatar in sidebar header (same as student sidebar)

DASHBOARD SECTIONS:

Section 1 — Class join card
- Shows class name, join code (e.g. SK-4A29), and student count
- "Copy link" button copies sidekick.app/join/[code] to clipboard
- Join code is stored in a 'classes' table in Supabase

Section 2 — 3 stat cards in a row
- Total questions answered (sum across all students in class)
- Class accuracy % (correct answers / total attempts)
- Active today (students who have attempted at least 1 question today)

Section 3 — Two column grid
LEFT: "Class weak topics" — bar chart showing topics sorted by lowest 
accuracy. Pull from user_attempts table, filter by students in this class,
group by topic, calculate accuracy per topic.

RIGHT: "Students" — list of all students in the class showing:
- Avatar initials circle (colored by first letter of name)
- Student name
- Questions answered count  
- Accuracy % (color coded: green >70%, amber 50-70%, red <50%)
- Clicking a student row navigates to /teacher/student/[id]

3. /teacher/student/[id] — Individual student breakdown
- Back button to dashboard
- Student name, total questions, accuracy, streak
- Topic breakdown: same bar chart style but for this one student
- Recent attempts: last 10 questions answered with correct/incorrect indicator

DATABASE CHANGES NEEDED:

Add to users table:
- role: text (default 'student', can be 'teacher')

New 'classes' table:
- id, teacher_id (FK to users), name, join_code, subject, created_at

New 'class_members' table:  
- id, class_id (FK to classes), student_id (FK to users), joined_at

JOINING FLOW (student side):
- Add a "Join a class" option on index.html for logged-in students
- Student enters 6-character join code
- App looks up class by join_code, inserts into class_members

STYLE REQUIREMENTS:
- White background (#ffffff)
- Primary accent: #F5B000
- Font: Nunito (already loaded)
- Cards: white bg, border: 1px solid #e5e7eb, border-radius: 16px
- Accuracy bars: red (#f87171) for <50%, amber (#fbbf24) for 50-70%, 
  green (#34d399) for >70%
- Avatar circles: colored by first letter (use a consistent color map)
- Sidebar: 280px wide, same as existing sidebar in index.css
- Mobile responsive — stack to single column on <768px

Keep all existing files intact. Add new files:
- teacher_login.html
- teacher.html  
- teacher_student.html
- teacher.css
- teacher.js

Add new routes to server.js:
- GET /teacher/login → teacher_login.html
- GET /teacher → teacher.html
- GET /teacher/student/:id → teacher_student.html