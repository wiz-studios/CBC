-- CBC Academic Administration System - School logo support

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS logo_url TEXT;
