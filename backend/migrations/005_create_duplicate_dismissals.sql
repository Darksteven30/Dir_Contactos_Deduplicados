-- 005: pares de contactos que el usuario marcó como "no son duplicados"
-- Se guardan con contact_a_id < contact_b_id para que cada par tenga una sola fila.
CREATE TABLE contact_duplicate_dismissals (
  contact_a_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_b_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_a_id, contact_b_id),
  CONSTRAINT contact_duplicate_dismissals_order_check CHECK (contact_a_id < contact_b_id)
);
