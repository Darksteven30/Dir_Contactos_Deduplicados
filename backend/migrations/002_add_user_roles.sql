-- 002: rol del usuario para autorización RBAC
ALTER TABLE users
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'
  CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
