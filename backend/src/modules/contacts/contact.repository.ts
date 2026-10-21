import type { Pool } from 'pg';
import { pageOffset, type Page, type PageRequest } from '../../shared/http/pagination';
import type { Contact, ContactData, ScoredContact } from './contact.entity';

export interface NormalizedContactFields {
  normalizedName: string;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
}

// Lo que se persiste: los datos del usuario más sus copias normalizadas.
export type ContactRecord = ContactData & NormalizedContactFields;

export interface ContactSearchCriteria {
  /** Texto normalizado que se compara por trigramas contra el nombre. */
  text: string;
  /** Fragmento a buscar dentro del email. */
  email: string;
  /** Dígitos a buscar dentro del teléfono; null si la búsqueda no trae suficientes dígitos. */
  phoneDigits: string | null;
}

export type ContactUpdateResult =
  | { status: 'updated'; contact: Contact }
  /** Otra petición modificó el contacto después de que el cliente lo leyó. */
  | { status: 'version_conflict'; current: Contact }
  | { status: 'not_found' };

// Contrato de persistencia. Todas las operaciones (salvo findOwnerId) se limitan a los
// contactos del dueño indicado: aunque falle una capa superior, no se filtran datos ajenos.
export interface ContactRepository {
  /** Dueño de un contacto activo, o null si no existe. */
  findOwnerId(id: number): Promise<number | null>;
  list(ownerId: number, page: PageRequest): Promise<Page<Contact>>;
  search(ownerId: number, criteria: ContactSearchCriteria, page: PageRequest): Promise<Page<ScoredContact>>;
  findById(ownerId: number, id: number): Promise<Contact | null>;
  create(ownerId: number, record: ContactRecord): Promise<Contact>;
  update(ownerId: number, id: number, expectedVersion: number, record: ContactRecord): Promise<ContactUpdateResult>;
  softDelete(ownerId: number, id: number): Promise<boolean>;
}

export interface ContactRow {
  id: number;
  owner_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export const CONTACT_COLUMNS = 'id, owner_id, full_name, email, phone, company, notes, version, created_at, updated_at';

// Filtro de búsqueda: nombre parecido (trigramas, usa el índice GIN) o fragmento de email/teléfono.
// `$2 <% normalized_name` es verdadero si word_similarity supera pg_trgm.word_similarity_threshold (0.6).
const SEARCH_FILTER = `owner_id = $1 AND deleted_at IS NULL
  AND ($2 <% normalized_name OR normalized_email LIKE $3 OR normalized_phone LIKE $4)`;

export function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    ownerId: row.owner_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    notes: row.notes,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Escapa los comodines de LIKE para que el texto del usuario se busque literal.
function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

// Valores para $1..$8 en este orden: full_name, email, phone, company, notes y las tres normalizadas.
export function recordParams(record: ContactRecord): unknown[] {
  return [
    record.fullName,
    record.email,
    record.phone,
    record.company,
    record.notes,
    record.normalizedName,
    record.normalizedEmail,
    record.normalizedPhone,
  ];
}

export class PgContactRepository implements ContactRepository {
  constructor(private readonly pool: Pool) {}

  async findOwnerId(id: number): Promise<number | null> {
    const { rows } = await this.pool.query<{ owner_id: number }>(
      'SELECT owner_id FROM contacts WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    return rows[0]?.owner_id ?? null;
  }

  async list(ownerId: number, page: PageRequest): Promise<Page<Contact>> {
    const [count, data] = await Promise.all([
      this.pool.query<{ total: string }>(
        'SELECT COUNT(*) AS total FROM contacts WHERE owner_id = $1 AND deleted_at IS NULL',
        [ownerId],
      ),
      this.pool.query<ContactRow>(
        `SELECT ${CONTACT_COLUMNS} FROM contacts
          WHERE owner_id = $1 AND deleted_at IS NULL
          ORDER BY normalized_name, id
          LIMIT $2 OFFSET $3`,
        [ownerId, page.pageSize, pageOffset(page)],
      ),
    ]);
    return { ...page, total: Number(count.rows[0]?.total ?? 0), items: data.rows.map(toContact) };
  }

  async search(ownerId: number, criteria: ContactSearchCriteria, page: PageRequest): Promise<Page<ScoredContact>> {
    const params = [
      ownerId,
      criteria.text,
      containsPattern(criteria.email),
      criteria.phoneDigits ? containsPattern(criteria.phoneDigits) : null,
    ];

    const [count, data] = await Promise.all([
      this.pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM contacts WHERE ${SEARCH_FILTER}`, params),
      // Coincidir por email o teléfono cuenta como coincidencia total (score 1).
      this.pool.query<ContactRow & { score: number }>(
        `SELECT ${CONTACT_COLUMNS},
                GREATEST(
                  word_similarity($2, normalized_name),
                  CASE WHEN normalized_email LIKE $3 OR normalized_phone LIKE $4 THEN 1 ELSE 0 END
                ) AS score
           FROM contacts
          WHERE ${SEARCH_FILTER}
          ORDER BY score DESC, normalized_name, id
          LIMIT $5 OFFSET $6`,
        [...params, page.pageSize, pageOffset(page)],
      ),
    ]);

    return {
      ...page,
      total: Number(count.rows[0]?.total ?? 0),
      items: data.rows.map((row) => ({ ...toContact(row), score: Math.round(row.score * 1000) / 1000 })),
    };
  }

  async findById(ownerId: number, id: number): Promise<Contact | null> {
    const { rows } = await this.pool.query<ContactRow>(
      `SELECT ${CONTACT_COLUMNS} FROM contacts WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [id, ownerId],
    );
    return rows[0] ? toContact(rows[0]) : null;
  }

  async create(ownerId: number, record: ContactRecord): Promise<Contact> {
    const { rows } = await this.pool.query<ContactRow>(
      `INSERT INTO contacts
         (full_name, email, phone, company, notes, normalized_name, normalized_email, normalized_phone, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${CONTACT_COLUMNS}`,
      [...recordParams(record), ownerId],
    );
    const row = rows[0];
    if (!row) throw new Error('INSERT de contacto no devolvió filas');
    return toContact(row);
  }

  async update(
    ownerId: number,
    id: number,
    expectedVersion: number,
    record: ContactRecord,
  ): Promise<ContactUpdateResult> {
    // Bloqueo optimista: la condición `version = $11` hace que solo una de dos ediciones
    // concurrentes gane; la otra no actualiza ninguna fila y se informa como conflicto.
    const { rows } = await this.pool.query<ContactRow>(
      `UPDATE contacts
          SET full_name = $1, email = $2, phone = $3, company = $4, notes = $5,
              normalized_name = $6, normalized_email = $7, normalized_phone = $8,
              version = version + 1, updated_at = NOW()
        WHERE id = $9 AND owner_id = $10 AND version = $11 AND deleted_at IS NULL
        RETURNING ${CONTACT_COLUMNS}`,
      [...recordParams(record), id, ownerId, expectedVersion],
    );
    if (rows[0]) return { status: 'updated', contact: toContact(rows[0]) };

    const current = await this.findById(ownerId, id);
    return current ? { status: 'version_conflict', current } : { status: 'not_found' };
  }

  async softDelete(ownerId: number, id: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE contacts SET deleted_at = NOW(), version = version + 1
        WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [id, ownerId],
    );
    return (rowCount ?? 0) > 0;
  }
}
