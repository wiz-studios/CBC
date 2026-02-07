-- CBC Academic Administration System - User honorific support

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS honorific VARCHAR(10);
