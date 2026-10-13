-- 004: contactos con soporte para búsqueda difusa
-- pg_trgm aporta la similitud por trigramas (similarity, word_similarity, operadores % y <%).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE contacts (
  id               SERIAL PRIMARY KEY,
  owner_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name        VARCHAR(150) NOT NULL,
  email            VARCHAR(150),
  phone            VARCHAR(30),
  company          VARCHAR(150),
  notes            TEXT,
  -- Copias normalizadas que calcula el backend (minúsculas, sin tildes ni puntuación,
  -- teléfono solo con dígitos) para comparar contactos sin que influya el formato.
  normalized_name  VARCHAR(150) NOT NULL,
  normalized_email VARCHAR(150),
  normalized_phone VARCHAR(30),
  -- Bloqueo optimista: cada UPDATE exige la versión que leyó el cliente y la incrementa.
  version          INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Borrado lógico: el contacto se conserva (p. ej. para el historial de fusiones).
  deleted_at       TIMESTAMPTZ
);

-- Listado paginado y ordenado de los contactos activos de un usuario.
CREATE INDEX contacts_owner_name_idx
  ON contacts (owner_id, normalized_name, id) WHERE deleted_at IS NULL;

-- Búsqueda difusa por nombre (trigramas).
CREATE INDEX contacts_normalized_name_trgm_idx
  ON contacts USING GIN (normalized_name gin_trgm_ops) WHERE deleted_at IS NULL;

-- Coincidencias exactas de email y teléfono (base de la deduplicación).
CREATE INDEX contacts_owner_email_idx
  ON contacts (owner_id, normalized_email) WHERE deleted_at IS NULL AND normalized_email IS NOT NULL;
CREATE INDEX contacts_owner_phone_idx
  ON contacts (owner_id, normalized_phone) WHERE deleted_at IS NULL AND normalized_phone IS NOT NULL;
