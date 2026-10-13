import type { Pool } from 'pg';
import type { Contact } from '../contacts/contact.entity';
import {
  CONTACT_COLUMNS,
  toContact,
  type ContactRow,
  type NormalizedContactFields,
} from '../contacts/contact.repository';

// Contacto con sus columnas normalizadas, necesarias para calcular la similitud.
export type ComparableContact = Contact & NormalizedContactFields;

export interface CandidatePairs {
  contacts: ComparableContact[];
  /** Pares [idMenor, idMayor] que vale la pena puntuar. */
  pairs: Array<[number, number]>;
}

// Contrato de persistencia de la deduplicación. Siempre limitado a los contactos del dueño.
export interface DeduplicationRepository {
  /**
   * Fase de "blocking": en lugar de comparar todos los contactos contra todos (O(n²)),
   * devuelve solo los pares con alguna señal de parecido. Excluye los pares descartados.
   */
  findCandidatePairs(ownerId: number): Promise<CandidatePairs>;
  /** Contactos con alguna señal de parecido a los datos dados (p. ej. antes de crear uno). */
  findCandidatesFor(ownerId: number, fields: NormalizedContactFields): Promise<ComparableContact[]>;
  /** Cuántos de los ids indicados son contactos activos del dueño. */
  countOwned(ownerId: number, ids: number[]): Promise<number>;
  /** Marca el par como "no son duplicados" (idempotente). */
  dismissPair(contactAId: number, contactBId: number): Promise<void>;
}

interface ComparableRow extends ContactRow {
  normalized_name: string;
  normalized_email: string | null;
  normalized_phone: string | null;
}

const COMPARABLE_COLUMNS = `${CONTACT_COLUMNS}, normalized_name, normalized_email, normalized_phone`;

// Máximo de contactos parecidos que se devuelven al revisar un contacto nuevo.
const MAX_CANDIDATES = 50;

function toComparable(row: ComparableRow): ComparableContact {
  return {
    ...toContact(row),
    normalizedName: row.normalized_name,
    normalizedEmail: row.normalized_email,
    normalizedPhone: row.normalized_phone,
  };
}

export class PgDeduplicationRepository implements DeduplicationRepository {
  constructor(private readonly pool: Pool) {}

  async findCandidatePairs(ownerId: number): Promise<CandidatePairs> {
    // Señales de parecido (cualquiera basta):
    // - nombre: `%` es verdadero si la similitud de trigramas supera pg_trgm.similarity_threshold
    //   (0.3). Es un filtro permisivo y usa el índice GIN; la precisión la aporta Levenshtein.
    // - mismo email normalizado, o mismo teléfono (últimos 10 dígitos, ignora el indicativo).
    const { rows: pairRows } = await this.pool.query<{ a_id: number; b_id: number }>(
      `SELECT a.id AS a_id, b.id AS b_id
         FROM contacts a
         JOIN contacts b
           ON b.owner_id = a.owner_id
          AND b.id > a.id
          AND b.deleted_at IS NULL
          AND (a.normalized_name % b.normalized_name
               OR a.normalized_email = b.normalized_email
               OR right(a.normalized_phone, 10) = right(b.normalized_phone, 10))
        WHERE a.owner_id = $1
          AND a.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM contact_duplicate_dismissals d
             WHERE d.contact_a_id = a.id AND d.contact_b_id = b.id
          )`,
      [ownerId],
    );

    const pairs = pairRows.map((row): [number, number] => [row.a_id, row.b_id]);
    const ids = [...new Set(pairs.flat())];
    if (ids.length === 0) return { contacts: [], pairs: [] };

    const { rows } = await this.pool.query<ComparableRow>(
      `SELECT ${COMPARABLE_COLUMNS} FROM contacts WHERE owner_id = $1 AND id = ANY($2::int[])`,
      [ownerId, ids],
    );
    return { contacts: rows.map(toComparable), pairs };
  }

  async findCandidatesFor(ownerId: number, fields: NormalizedContactFields): Promise<ComparableContact[]> {
    const { rows } = await this.pool.query<ComparableRow>(
      `SELECT ${COMPARABLE_COLUMNS}
         FROM contacts
        WHERE owner_id = $1
          AND deleted_at IS NULL
          AND (normalized_name % $2
               OR normalized_email = $3
               OR right(normalized_phone, 10) = right($4, 10))
        ORDER BY similarity(normalized_name, $2) DESC, id
        LIMIT ${MAX_CANDIDATES}`,
      [ownerId, fields.normalizedName, fields.normalizedEmail, fields.normalizedPhone],
    );
    return rows.map(toComparable);
  }

  async countOwned(ownerId: number, ids: number[]): Promise<number> {
    const { rows } = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM contacts
        WHERE owner_id = $1 AND deleted_at IS NULL AND id = ANY($2::int[])`,
      [ownerId, ids],
    );
    return Number(rows[0]?.total ?? 0);
  }

  async dismissPair(contactAId: number, contactBId: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO contact_duplicate_dismissals (contact_a_id, contact_b_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [contactAId, contactBId],
    );
  }
}
