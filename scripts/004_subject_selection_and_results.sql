-- CBC Academic Administration System - Subject Selection & Results Settings
-- Phase: Senior school realism (admin-controlled subject selection + KCSE grading model)

-- ============================================================================
-- STUDENT SUBJECT ENROLLMENTS (source of truth for who takes what)
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_subject_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  is_compulsory BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DROPPED')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  dropped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(term_id, student_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_sse_school_term ON student_subject_enrollments(school_id, term_id);
CREATE INDEX IF NOT EXISTS idx_sse_student_term ON student_subject_enrollments(student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_sse_subject_term ON student_subject_enrollments(subject_id, term_id);
CREATE INDEX IF NOT EXISTS idx_sse_status ON student_subject_enrollments(status);

-- ============================================================================
-- GRADE SCALES & BANDS (school-configurable, seeded with KCSE 12-point)
-- ============================================================================

CREATE TABLE IF NOT EXISTS grade_scales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, name)
);

CREATE TABLE IF NOT EXISTS grade_bands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade_scale_id UUID NOT NULL REFERENCES grade_scales(id) ON DELETE CASCADE,
  min_score DECIMAL(5,2) NOT NULL,
  max_score DECIMAL(5,2) NOT NULL,
  letter_grade VARCHAR(5) NOT NULL,
  points DECIMAL(4,2) NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(grade_scale_id, letter_grade),
  CHECK (min_score >= 0),
  CHECK (max_score <= 100),
  CHECK (max_score >= min_score)
);

CREATE INDEX IF NOT EXISTS idx_grade_scales_school ON grade_scales(school_id);
CREATE INDEX IF NOT EXISTS idx_grade_bands_scale_order ON grade_bands(grade_scale_id, sort_order);

-- ============================================================================
-- SCHOOL RESULTS SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS school_results_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
  grade_scale_id UUID REFERENCES grade_scales(id) ON DELETE SET NULL,
  ranking_method VARCHAR(20) NOT NULL DEFAULT 'BEST_N' CHECK (ranking_method IN ('BEST_N', 'ALL_TAKEN')),
  ranking_n INTEGER NOT NULL DEFAULT 7 CHECK (ranking_n >= 1 AND ranking_n <= 12),
  min_total_subjects INTEGER NOT NULL DEFAULT 7 CHECK (min_total_subjects >= 1 AND min_total_subjects <= 12),
  max_total_subjects INTEGER NOT NULL DEFAULT 9 CHECK (max_total_subjects >= 1 AND max_total_subjects <= 12),
  min_sciences INTEGER NOT NULL DEFAULT 2 CHECK (min_sciences >= 0 AND min_sciences <= 12),
  max_humanities INTEGER NOT NULL DEFAULT 2 CHECK (max_humanities >= 0 AND max_humanities <= 12),
  excluded_subject_codes TEXT[] NOT NULL DEFAULT ARRAY['PE', 'ICT'],
  cat_weight DECIMAL(5,2) NOT NULL DEFAULT 30 CHECK (cat_weight >= 0 AND cat_weight <= 100),
  exam_weight DECIMAL(5,2) NOT NULL DEFAULT 70 CHECK (exam_weight >= 0 AND exam_weight <= 100),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (max_total_subjects >= min_total_subjects),
  CHECK (cat_weight + exam_weight = 100)
);

-- ============================================================================
-- REPORT SNAPSHOT ENHANCEMENTS
-- ============================================================================

ALTER TABLE report_card_versions
  ADD COLUMN IF NOT EXISTS mean_points DECIMAL(6,3),
  ADD COLUMN IF NOT EXISTS ranking_method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ranking_subject_count INTEGER;

ALTER TABLE report_card_version_subjects
  ADD COLUMN IF NOT EXISTS points DECIMAL(4,2);

-- ============================================================================
-- SEED DEFAULT KCSE SCALE FOR ALL SCHOOLS
-- ============================================================================

WITH created_scales AS (
  INSERT INTO grade_scales (school_id, name, is_default)
  SELECT s.id, 'KCSE 12-point (Default)', TRUE
  FROM schools s
  WHERE NOT EXISTS (
    SELECT 1 FROM grade_scales gs
    WHERE gs.school_id = s.id
  )
  RETURNING id, school_id
), existing_scales AS (
  SELECT gs.id, gs.school_id
  FROM grade_scales gs
  WHERE gs.name = 'KCSE 12-point (Default)'
), all_scales AS (
  SELECT * FROM created_scales
  UNION
  SELECT * FROM existing_scales
)
INSERT INTO grade_bands (grade_scale_id, min_score, max_score, letter_grade, points, sort_order)
SELECT a.id, b.min_score, b.max_score, b.letter_grade, b.points, b.sort_order
FROM all_scales a
CROSS JOIN (
  VALUES
    (80.00, 100.00, 'A', 12.00, 1),
    (75.00, 79.99, 'A-', 11.00, 2),
    (70.00, 74.99, 'B+', 10.00, 3),
    (65.00, 69.99, 'B', 9.00, 4),
    (60.00, 64.99, 'B-', 8.00, 5),
    (55.00, 59.99, 'C+', 7.00, 6),
    (50.00, 54.99, 'C', 6.00, 7),
    (45.00, 49.99, 'C-', 5.00, 8),
    (40.00, 44.99, 'D+', 4.00, 9),
    (35.00, 39.99, 'D', 3.00, 10),
    (30.00, 34.99, 'D-', 2.00, 11),
    (0.00, 29.99, 'E', 1.00, 12)
) AS b(min_score, max_score, letter_grade, points, sort_order)
ON CONFLICT DO NOTHING;

INSERT INTO school_results_settings (school_id, grade_scale_id, ranking_method, ranking_n, excluded_subject_codes)
SELECT s.id, gs.id, 'BEST_N', 7, ARRAY['PE', 'ICT']
FROM schools s
LEFT JOIN grade_scales gs
  ON gs.school_id = s.id
  AND gs.name = 'KCSE 12-point (Default)'
WHERE NOT EXISTS (
  SELECT 1 FROM school_results_settings r
  WHERE r.school_id = s.id
)
ON CONFLICT (school_id) DO NOTHING;
