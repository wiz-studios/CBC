-- CBC Academic Administration System - RBAC Setup
-- System-wide roles and permissions

-- ============================================================================
-- ROLES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system_role BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_school ON roles(school_id);
-- IMPORTANT: Postgres UNIQUE allows multiple NULLs; this keeps system roles re-runnable
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_system_unique ON roles(name) WHERE is_system_role = TRUE;

-- ============================================================================
-- PERMISSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);

-- ============================================================================
-- ROLE-PERMISSION MAPPING
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role_id, permission_id)
);

-- ============================================================================
-- USER-ROLE MAPPING
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, role_id, school_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_school ON user_roles(school_id);

-- ============================================================================
-- SEED: SYSTEM ROLES
-- ============================================================================

INSERT INTO roles (school_id, name, description, is_system_role) VALUES
  (NULL, 'SUPER_ADMIN', 'Platform super administrator/moderator - full access across all schools', TRUE),
  (NULL, 'SCHOOL_ADMIN', 'School administrator - manages school settings and users', TRUE),
  (NULL, 'HEAD_TEACHER', 'Head teacher - manages classes, timetables, teachers', TRUE),
  (NULL, 'TEACHER', 'Teacher - marks attendance, enters marks, views class roster', TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SEED: PERMISSIONS
-- ============================================================================

-- Schools
INSERT INTO permissions (name, description, resource, action) VALUES
  ('schools:create', 'Create a school', 'schools', 'create'),
  ('schools:read', 'View school details', 'schools', 'read'),
  ('schools:update', 'Update school details', 'schools', 'update'),
  ('schools:delete', 'Delete a school', 'schools', 'delete'),
  
  -- Academic Terms
  ('terms:create', 'Create academic term', 'academic_terms', 'create'),
  ('terms:read', 'View academic terms', 'academic_terms', 'read'),
  ('terms:update', 'Update academic term', 'academic_terms', 'update'),
  ('terms:delete', 'Delete academic term', 'academic_terms', 'delete'),
  
  -- Classes
  ('classes:create', 'Create class', 'classes', 'create'),
  ('classes:read', 'View classes', 'classes', 'read'),
  ('classes:update', 'Update class', 'classes', 'update'),
  ('classes:delete', 'Delete class', 'classes', 'delete'),
  
  -- Subjects
  ('subjects:create', 'Create subject', 'subjects', 'create'),
  ('subjects:read', 'View subjects', 'subjects', 'read'),
  ('subjects:update', 'Update subject', 'subjects', 'update'),
  ('subjects:delete', 'Delete subject', 'subjects', 'delete'),
  
  -- Users/Teachers
  ('users:create', 'Create user', 'users', 'create'),
  ('users:read', 'View users', 'users', 'read'),
  ('users:update', 'Update user', 'users', 'update'),
  ('users:delete', 'Delete user', 'users', 'delete'),
  
  -- Timetables
  ('timetable:create', 'Create timetable entry', 'timetables', 'create'),
  ('timetable:read', 'View timetables', 'timetables', 'read'),
  ('timetable:update', 'Update timetable', 'timetables', 'update'),
  ('timetable:delete', 'Delete timetable entry', 'timetables', 'delete'),
  
  -- Attendance
  ('attendance:create', 'Mark attendance', 'attendance', 'create'),
  ('attendance:read', 'View attendance', 'attendance', 'read'),
  ('attendance:update', 'Modify attendance', 'attendance', 'update'),
  ('attendance:lock', 'Lock attendance for day', 'attendance', 'lock'),
  
  -- Assessments & Marks
  ('assessments:create', 'Create assessment', 'assessments', 'create'),
  ('assessments:read', 'View assessments', 'assessments', 'read'),
  ('assessments:update', 'Update assessment', 'assessments', 'update'),
  ('assessments:delete', 'Delete assessment', 'assessments', 'delete'),
  
  ('marks:create', 'Enter marks', 'marks', 'create'),
  ('marks:read', 'View marks', 'marks', 'read'),
  ('marks:update', 'Update marks', 'marks', 'update'),
  
  -- Report Cards
  ('reports:read', 'View report cards', 'reports', 'read'),
  ('reports:generate', 'Generate report cards', 'reports', 'generate'),
  ('reports:release', 'Release/publish report cards', 'reports', 'release'),
  
  -- Settings
  ('settings:read', 'View settings', 'settings', 'read'),
  ('settings:update', 'Update settings', 'settings', 'update')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SEED: ROLE PERMISSIONS
-- ============================================================================

-- SUPER_ADMIN: Full access (moderator across all schools)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'SUPER_ADMIN' AND r.is_system_role = TRUE
ON CONFLICT DO NOTHING;

-- SCHOOL_ADMIN: Schools, Users, Terms, Classes, Subjects, Settings, Reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'SCHOOL_ADMIN' AND r.is_system_role = TRUE
AND p.resource IN ('schools', 'users', 'academic_terms', 'classes', 'subjects', 'settings', 'reports')
ON CONFLICT DO NOTHING;

-- HEAD_TEACHER: Timetable, Attendance, Marks, Reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'HEAD_TEACHER' AND r.is_system_role = TRUE
AND p.resource IN ('timetables', 'attendance', 'marks', 'assessments', 'reports', 'users')
ON CONFLICT DO NOTHING;

-- TEACHER: Attendance (own class), Marks (own subject), Reports (read-only)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'TEACHER' AND r.is_system_role = TRUE
AND (
  (p.resource = 'attendance' AND p.action IN ('create', 'read', 'lock'))
  OR (p.resource = 'marks' AND p.action IN ('create', 'read', 'update'))
  OR (p.resource = 'assessments' AND p.action IN ('create', 'read', 'update'))
  OR (p.resource = 'reports' AND p.action = 'read')
  OR (p.resource = 'timetables' AND p.action = 'read')
)
ON CONFLICT DO NOTHING;
