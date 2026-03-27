-- Migration: Replace boolean is_admin with user_role enum
-- This migration converts the isAdmin boolean column to a role-based enum system.
-- Mapping: isAdmin=true → 'admin', isAdmin=false → 'editor'
-- New users created after migration default to 'viewer' role.
--
-- This migration was executed manually via psql. It is kept here for documentation
-- and reproducibility purposes.

BEGIN;

CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');

ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'viewer';

UPDATE users SET role = 'admin' WHERE is_admin = true;
UPDATE users SET role = 'editor' WHERE is_admin = false;

ALTER TABLE users DROP COLUMN is_admin;

COMMIT;
