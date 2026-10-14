-- 006: historial de fusiones de contactos
-- Cada fusión guarda una foto (snapshot) de todos los contactos tal como estaban antes de
-- fusionar: sirve de auditoría y permite deshacerla.
-- primary_version_after es la versión del contacto principal justo después de fusionar;
-- deshacer solo se permite si no ha cambiado desde entonces (bloqueo optimista).
CREATE TABLE contact_merges (
  id                    SERIAL PRIMARY KEY,
  owner_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_contact_id    INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  merged_contact_ids    INTEGER[] NOT NULL,
  snapshot              JSONB NOT NULL,
  primary_version_after INTEGER NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at             TIMESTAMPTZ
);

-- Historial de un usuario, de la fusión más reciente a la más antigua.
CREATE INDEX contact_merges_owner_created_idx ON contact_merges (owner_id, created_at DESC);
