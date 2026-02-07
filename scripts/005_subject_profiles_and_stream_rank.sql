-- CBC Academic Administration System - Subject Result Profiles + Stream Ranking

-- ============================================================================
-- SUBJECT-LEVEL RESULTS OVERRIDES
-- ============================================================================

CREATE TABLE IF NOT EXISTS subject_results_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  cat_weight DECIMAL(5,2),
  exam_weight DECIMAL(5,2),
  excluded_from_ranking BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, subject_id),
  CHECK (cat_weight IS NULL OR (cat_weight >= 0 AND cat_weight <= 100)),
  CHECK (exam_weight IS NULL OR (exam_weight >= 0 AND exam_weight <= 100)),
  CHECK (
    (cat_weight IS NULL AND exam_weight IS NULL)
    OR (cat_weight IS NOT NULL AND exam_weight IS NOT NULL AND cat_weight + exam_weight = 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_subject_profiles_school ON subject_results_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_subject_profiles_subject ON subject_results_profiles(subject_id);

-- ============================================================================
-- STREAM-LEVEL SNAPSHOT OUTPUT
-- ============================================================================

ALTER TABLE report_card_versions
  ADD COLUMN IF NOT EXISTS position_in_stream INTEGER,
  ADD COLUMN IF NOT EXISTS stream_size INTEGER;
