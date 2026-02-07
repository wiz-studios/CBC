-- CBC Academic Administration System - Minimal RLS
-- CRITICAL: Keep this simple - enforce permissions in backend service layer
-- Only enforce school isolation at database level

BEGIN;

-- Enable RLS on critical tables
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_versions ENABLE ROW LEVEL SECURITY;

-- Re-runnable: drop existing policies if they already exist
DROP POLICY IF EXISTS "School isolation" ON schools;
DROP POLICY IF EXISTS "School data isolation" ON academic_terms;
DROP POLICY IF EXISTS "School data isolation" ON classes;
DROP POLICY IF EXISTS "School data isolation" ON subjects;
DROP POLICY IF EXISTS "School data isolation" ON students;
DROP POLICY IF EXISTS "School data isolation" ON teachers;
DROP POLICY IF EXISTS "School data isolation" ON users;
DROP POLICY IF EXISTS "School timetable access" ON timetable_slots;
DROP POLICY IF EXISTS "School lesson access" ON lesson_sessions;
DROP POLICY IF EXISTS "Attendance access" ON attendance;
DROP POLICY IF EXISTS "Assessment access" ON assessments;
DROP POLICY IF EXISTS "Marks access" ON student_marks;
DROP POLICY IF EXISTS "Report card access" ON report_card_versions;

-- ============================================================================
-- POLICY: School Isolation
-- Only SUPER_ADMIN can see all schools; others see only their school
-- ============================================================================

CREATE POLICY "School isolation" ON schools
FOR SELECT USING (
  -- Platform admins see all
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR
  -- Non-admin sees their school only
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.school_id = schools.id
  )
);

-- ============================================================================
-- POLICY: Data belongs to user's school only
-- ============================================================================

CREATE POLICY "School data isolation" ON academic_terms
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.school_id = academic_terms.school_id
  )
);

CREATE POLICY "School data isolation" ON classes
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.school_id = classes.school_id
  )
);

CREATE POLICY "School data isolation" ON subjects
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.school_id = subjects.school_id
  )
);

CREATE POLICY "School data isolation" ON students
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.school_id = students.school_id
  )
);

CREATE POLICY "School data isolation" ON teachers
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.school_id = teachers.school_id
  )
);

CREATE POLICY "School data isolation" ON users
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.school_id = users.school_id
  )
);

-- Timetable slots visible to school users
CREATE POLICY "School timetable access" ON timetable_slots
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR
  EXISTS (
    SELECT 1 FROM teachers t
    JOIN user_roles ur ON ur.school_id = t.school_id
    WHERE t.id = timetable_slots.teacher_id
    AND ur.user_id = auth.uid()
  )
);

-- Lesson sessions visible to school users
CREATE POLICY "School lesson access" ON lesson_sessions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR
  EXISTS (
    SELECT 1 FROM teachers t
    JOIN user_roles ur ON ur.school_id = t.school_id
    WHERE t.id = lesson_sessions.teacher_id
    AND ur.user_id = auth.uid()
  )
);

-- Attendance visible to teacher and their school
CREATE POLICY "Attendance access" ON attendance
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR
  EXISTS (
    SELECT 1 FROM lesson_sessions ls
    JOIN teachers t ON ls.teacher_id = t.id
    JOIN user_roles ur ON ur.school_id = t.school_id
    WHERE ls.id = attendance.lesson_session_id
    AND ur.user_id = auth.uid()
  )
);

-- Assessments visible to school
CREATE POLICY "Assessment access" ON assessments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR
  EXISTS (
    SELECT 1 FROM classes c
    JOIN user_roles ur ON c.school_id = ur.school_id
    WHERE c.id = assessments.class_id
    AND ur.user_id = auth.uid()
  )
);

-- Marks visible to school
CREATE POLICY "Marks access" ON student_marks
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR
  EXISTS (
    SELECT 1 FROM assessments a
    JOIN classes c ON a.class_id = c.id
    JOIN user_roles ur ON c.school_id = ur.school_id
    WHERE a.id = student_marks.assessment_id
    AND ur.user_id = auth.uid()
  )
);

-- Report cards visible to school
CREATE POLICY "Report card access" ON report_card_versions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'SUPER_ADMIN'
  )
  OR
  EXISTS (
    SELECT 1 FROM students s
    JOIN user_roles ur ON s.school_id = ur.school_id
    WHERE s.id = report_card_versions.student_id
    AND ur.user_id = auth.uid()
  )
);

-- ============================================================================
-- NOTE: INSERT/UPDATE/DELETE policies are handled by backend service layer
-- This RLS is read-only to prevent accidental data leaks
-- ============================================================================

COMMIT;
