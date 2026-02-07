-- CBC Academic Administration System - Core Schema
-- Phase 1: Schools, Classes, Timetables, Students, Teachers, Attendance, Marks, Report Cards
-- ACADEMICS ONLY - No parent/student portals yet

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SCHOOLS & ORGANIZATIONAL STRUCTURE
-- ============================================================================

CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  motto TEXT,
  principal_name VARCHAR(255),
  principal_email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  county VARCHAR(100),
  sub_county VARCHAR(100),
  logo_url TEXT,
  school_type VARCHAR(50) NOT NULL CHECK (school_type IN ('PRIMARY', 'SECONDARY', 'BOTH')),
  curriculum_version VARCHAR(50) DEFAULT 'CBC2023',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_schools_code ON schools(code);
CREATE INDEX IF NOT EXISTS idx_schools_active ON schools(is_active);

-- Academic years/terms
CREATE TABLE IF NOT EXISTS academic_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  term INTEGER NOT NULL CHECK (term IN (1, 2, 3)),
  term_name VARCHAR(100),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, year, term)
);

CREATE INDEX IF NOT EXISTS idx_academic_terms_school ON academic_terms(school_id);
CREATE INDEX IF NOT EXISTS idx_academic_terms_current ON academic_terms(school_id, is_current);

-- ============================================================================
-- CLASSES & SUBJECTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  grade_level INTEGER NOT NULL CHECK (grade_level >= 7 AND grade_level <= 12), -- JSS & Senior only
  stream VARCHAR(50),
  class_teacher_id UUID,
  capacity INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(school_id, grade_level, stream)
);

CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_active ON classes(is_active);

-- Subjects per school
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  curriculum_area VARCHAR(100),
  is_compulsory BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, code)
);

CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);

-- Class-Subject assignment
CREATE TABLE IF NOT EXISTS class_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, subject_id)
);

-- ============================================================================
-- USERS (STAFF)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  id_number VARCHAR(50),
  status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  auth_id VARCHAR(255),
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- TEACHERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  tsc_number VARCHAR(50),
  is_head_of_department BOOLEAN DEFAULT FALSE,
  is_class_teacher BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, school_id)
);

CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user ON teachers(user_id);

-- Teacher-Class assignments
CREATE TABLE IF NOT EXISTS teacher_class_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  academic_term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(teacher_id, class_id, subject_id, academic_term_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher ON teacher_class_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class ON teacher_class_assignments(class_id);

-- ============================================================================
-- STUDENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  admission_number VARCHAR(50) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(10),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  academic_term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, admission_number)
);

CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_term ON students(academic_term_id);

-- ============================================================================
-- TIMETABLE & LESSON SESSIONS (KEY IMPROVEMENT)
-- ============================================================================

-- Timetable slots (term-specific, recurring Mon-Fri)
CREATE TABLE IF NOT EXISTS timetable_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academic_term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 5), -- Mon-Fri
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(academic_term_id, teacher_id, class_id, subject_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_timetable_slots_teacher ON timetable_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_class ON timetable_slots(class_id);

-- CRITICAL: Lesson sessions generated from timetable
-- One row = one lesson on one specific date
-- Prevents duplicate attendance + allows proper locking
CREATE TABLE IF NOT EXISTS lesson_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academic_term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  timetable_slot_id UUID NOT NULL REFERENCES timetable_slots(id) ON DELETE CASCADE,
  lesson_date DATE NOT NULL,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  
  -- Attendance status
  session_status VARCHAR(50) DEFAULT 'OPEN' CHECK (session_status IN ('OPEN', 'SUBMITTED', 'LOCKED')),
  is_attended BOOLEAN DEFAULT FALSE,
  
  -- Locking (immutable once locked)
  submitted_at TIMESTAMP, -- When teacher submitted attendance
  locked_at TIMESTAMP, -- When HOD/admin locked (no changes allowed)
  locked_by_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  lock_reason TEXT, -- Why it was locked
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Prevent duplicates: one lesson per slot per date
  UNIQUE(timetable_slot_id, lesson_date)
);

CREATE INDEX IF NOT EXISTS idx_lesson_sessions_slot ON lesson_sessions(timetable_slot_id);
CREATE INDEX IF NOT EXISTS idx_lesson_sessions_date ON lesson_sessions(lesson_date);
CREATE INDEX IF NOT EXISTS idx_lesson_sessions_teacher ON lesson_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lesson_sessions_class ON lesson_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_lesson_sessions_locked_at ON lesson_sessions(locked_at);

-- ============================================================================
-- ATTENDANCE (PRESENT/ABSENT ONLY - NO LATE/EXCUSED IN V1)
-- ============================================================================

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_session_id UUID NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL CHECK (status IN ('PRESENT', 'ABSENT')),
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  marked_by_teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lesson_session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(lesson_session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_marked_by ON attendance(marked_by_teacher_id);

-- ============================================================================
-- ASSESSMENTS & MARKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS assessment_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  weight DECIMAL(5, 2) NOT NULL,
  max_score INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, name)
);

CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  assessment_type_id UUID NOT NULL REFERENCES assessment_types(id) ON DELETE RESTRICT,
  academic_term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assessment_date DATE,
  max_score INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assessments_class ON assessments(class_id);
CREATE INDEX IF NOT EXISTS idx_assessments_term ON assessments(academic_term_id);

CREATE TABLE IF NOT EXISTS student_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  score DECIMAL(5, 2) NOT NULL,
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, assessment_id)
);

CREATE INDEX IF NOT EXISTS idx_student_marks_student ON student_marks(student_id);
CREATE INDEX IF NOT EXISTS idx_student_marks_assessment ON student_marks(assessment_id);

-- ============================================================================
-- REPORT CARDS (IMMUTABLE SNAPSHOTS)
-- ============================================================================

-- Report card versions (immutable snapshots, never updated)
CREATE TABLE IF NOT EXISTS report_card_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  
  -- Version metadata (immutable once created)
  generated_at TIMESTAMP NOT NULL,
  generated_by_teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  status VARCHAR(50) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RELEASED')),
  
  -- Attendance snapshot
  days_present INTEGER,
  days_absent INTEGER,
  attendance_percentage DECIMAL(5, 2),
  
  -- Full marks snapshot (JSON - immutable)
  marks_snapshot JSONB, -- Complete marks data at time of generation
  
  -- Grading snapshot
  total_marks DECIMAL(8, 2),
  average_percentage DECIMAL(5, 2),
  position_in_class INTEGER,
  class_size INTEGER,
  overall_grade VARCHAR(2),
  
  -- Teacher comments (optional, immutable)
  teacher_comments TEXT,
  principal_comments TEXT,
  
  -- Publishing
  released_at TIMESTAMP,
  released_by_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  
  -- Immutable creation timestamp (no updates)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(student_id, academic_term_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_report_card_versions_student ON report_card_versions(student_id);
CREATE INDEX IF NOT EXISTS idx_report_card_versions_term ON report_card_versions(academic_term_id);
CREATE INDEX IF NOT EXISTS idx_report_card_versions_status ON report_card_versions(status);

-- Report card subject details (denormalized for snapshot)
CREATE TABLE IF NOT EXISTS report_card_version_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_card_version_id UUID NOT NULL REFERENCES report_card_versions(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  marks_obtained DECIMAL(5, 2),
  max_marks INTEGER,
  percentage DECIMAL(5, 2),
  grade VARCHAR(2),
  position_in_subject INTEGER,
  subject_teacher_comments TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(report_card_version_id, subject_id)
);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  changes JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_school ON audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
