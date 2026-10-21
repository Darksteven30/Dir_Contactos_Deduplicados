-- 003: refresh tokens rotativos
-- Solo se guarda el hash SHA-256 del token, nunca el token en claro.
-- family_id agrupa todas las rotaciones de una misma sesión (un login).
-- revoked_reason distingue un token rotado (si reaparece = robo) de uno cerrado por logout.
CREATE TABLE refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   UUID NOT NULL,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  revoked_reason VARCHAR(20)
    CONSTRAINT refresh_tokens_revoked_reason_check
    CHECK (revoked_reason IN ('rotated', 'logout', 'logout_all', 'reuse_detected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_id_idx ON refresh_tokens (family_id);
