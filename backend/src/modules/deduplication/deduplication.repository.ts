import type { Pool } from 'pg';
import { withTransaction } from '../../database/transaction';
import { pageOffset, type Page, type PageRequest } from '../../shared/http/pagination';
import type { Contact } from '../contacts/contact.entity';
import {
  CONTACT_COLUMNS,
  recordParams,
  toContact,
  type ContactRecord,
  type ContactRow,
  type NormalizedContactFields,
} from '../contacts/contact.repository';
import type { ContactMerge } from './deduplication.entity';
import type { VersionedContactRef } from './deduplication.schemas';

// Contacto con sus columnas normalizadas, necesarias para calcular la similitud.
export type ComparableContact = Contact & NormalizedContactFields;

// Lo que se guarda de cada contacto en el historial: basta para restaurarlo tal cual.
export type StoredContactSnapshot = ContactRecord & { id: number };

/** Calcula los datos finales del principal a partir de los contactos ya bloqueados. */
export type MergeResolver = (primary: Contact, duplicates: Contact[]) => ContactRecord;

export type MergeOutcome =
  | { status: 'merged'; merge: ContactMerge; contact: Contact }
  /** Algún contacto no existe, ya fue eliminado/fusionado o es de otro usuario. */
  | { status: 'not_found' }
  /** Algún contacto cambió desde que el cliente lo leyó: se devuelven las versiones vigentes. */
  | { status: 'version_conflict'; current: Contact[] };

export type UndoMergeOutcome =
  | { status: 'undone'; contacts: Contact[] }
  | { status: 'not_found' }
  | { status: 'already_undone' }
  /** El principal se editó, eliminó o fusionó después: deshacer pisaría esos cambios. */
  | { status: 'primary_changed'; current: Contact | null };

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
  /**
   * Fusiona los duplicados en el principal de forma atómica: actualiza el principal con lo que
   * devuelva `resolve`, hace borrado lógico de los duplicados y registra la fusión en el historial.
   */
  merge(
    ownerId: number,
    primary: VersionedContactRef,
    duplicates: VersionedContactRef[],
    resolve: MergeResolver,
  ): Promise<MergeOutcome>;
  listMerges(ownerId: number, page: PageRequest): Promise<Page<ContactMerge>>;
  /** Restaura los contactos tal como estaban antes de la fusión. */
  undoMerge(ownerId: number, mergeId: number): Promise<UndoMergeOutcome>;
}

interface ComparableRow extends ContactRow {
  normalized_name: string;
  normalized_email: string | null;
  normalized_phone: string | null;
}

interface MergeRow {
  id: number;
  primary_contact_id: number;
  merged_contact_ids: number[];
  snapshot: StoredContactSnapshot[];
  primary_version_after: number;
  created_at: Date;
  undone_at: Date | null;
}

const COMPARABLE_COLUMNS = `${CONTACT_COLUMNS}, normalized_name, normalized_email, normalized_phone`;

const MERGE_COLUMNS =
  'id, primary_contact_id, merged_contact_ids, snapshot, primary_version_after, created_at, undone_at';

function toSnapshot(row: ComparableRow): StoredContactSnapshot {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    notes: row.notes,
    normalizedName: row.normalized_name,
    normalizedEmail: row.normalized_email,
    normalizedPhone: row.normalized_phone,
  };
}

function toMerge(row: MergeRow): ContactMerge {
  return {
    id: row.id,
    primaryContactId: row.primary_contact_id,
    mergedContactIds: row.merged_contact_ids,
    before: row.snapshot.map(({ id, fullName, email, phone, company, notes }) => ({
      id,
      fullName,
      email,
      phone,
      company,
      notes,
    })),
    createdAt: row.created_at,
    undoneAt: row.undone_at,
  };
}

const UPDATE_CONTACT_DATA = `UPDATE contacts
    SET full_name = $1, email = $2, phone = $3, company = $4, notes = $5,
        normalized_name = $6, normalized_email = $7, normalized_phone = $8,
        version = version + 1, updated_at = NOW()
  WHERE id = $9
  RETURNING ${CONTACT_COLUMNS}`;

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

  async merge(
    ownerId: number,
    primary: VersionedContactRef,
    duplicates: VersionedContactRef[],
    resolve: MergeResolver,
  ): Promise<MergeOutcome> {
    const expected = [primary, ...duplicates];

    return withTransaction(this.pool, async (client) => {
      // Bloqueo pesimista: las filas quedan bloqueadas hasta el COMMIT, así dos fusiones
      // simultáneas sobre los mismos contactos se ejecutan una tras otra y la segunda ve el
      // resultado de la primera. ORDER BY id hace que todas bloqueen en el mismo orden (sin deadlocks).
      const { rows } = await client.query<ComparableRow>(
        `SELECT ${COMPARABLE_COLUMNS} FROM contacts
          WHERE owner_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL
          ORDER BY id
          FOR UPDATE`,
        [ownerId, expected.map((ref) => ref.id)],
      );
      const locked = new Map(rows.map((row) => [row.id, row]));
      const primaryRow = locked.get(primary.id);
      const duplicateRows = duplicates.flatMap((ref) => locked.get(ref.id) ?? []);

      if (!primaryRow || duplicateRows.length !== duplicates.length) return { status: 'not_found' };
      // Bloqueo optimista: el cliente decidió fusionar viendo ciertas versiones; si alguna cambió,
      // la decisión ya no es válida.
      if (expected.some((ref) => locked.get(ref.id)?.version !== ref.version)) {
        return { status: 'version_conflict', current: rows.map(toContact) };
      }

      const record = resolve(toContact(primaryRow), duplicateRows.map(toContact));
      const { rows: updated } = await client.query<ContactRow>(UPDATE_CONTACT_DATA, [
        ...recordParams(record),
        primary.id,
      ]);
      const contactRow = updated[0];
      if (!contactRow) throw new Error('No se pudo actualizar el contacto principal');

      const duplicateIds = duplicates.map((ref) => ref.id);
      await client.query(
        `UPDATE contacts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
          WHERE id = ANY($1::int[])`,
        [duplicateIds],
      );

      const { rows: merges } = await client.query<MergeRow>(
        `INSERT INTO contact_merges
           (owner_id, primary_contact_id, merged_contact_ids, snapshot, primary_version_after)
         VALUES ($1, $2, $3::int[], $4::jsonb, $5)
         RETURNING ${MERGE_COLUMNS}`,
        [ownerId, primary.id, duplicateIds, JSON.stringify([primaryRow, ...duplicateRows].map(toSnapshot)), contactRow.version],
      );
      const mergeRow = merges[0];
      if (!mergeRow) throw new Error('No se pudo registrar la fusión');

      return { status: 'merged', merge: toMerge(mergeRow), contact: toContact(contactRow) };
    });
  }

  async listMerges(ownerId: number, page: PageRequest): Promise<Page<ContactMerge>> {
    const [count, data] = await Promise.all([
      this.pool.query<{ total: string }>('SELECT COUNT(*) AS total FROM contact_merges WHERE owner_id = $1', [
        ownerId,
      ]),
      this.pool.query<MergeRow>(
        `SELECT ${MERGE_COLUMNS} FROM contact_merges
          WHERE owner_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2 OFFSET $3`,
        [ownerId, page.pageSize, pageOffset(page)],
      ),
    ]);
    return { ...page, total: Number(count.rows[0]?.total ?? 0), items: data.rows.map(toMerge) };
  }

  async undoMerge(ownerId: number, mergeId: number): Promise<UndoMergeOutcome> {
    return withTransaction(this.pool, async (client) => {
      // Se bloquea el registro: dos "deshacer" simultáneos no pueden restaurar dos veces.
      const { rows: merges } = await client.query<MergeRow>(
        `SELECT ${MERGE_COLUMNS} FROM contact_merges WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
        [mergeId, ownerId],
      );
      const merge = merges[0];
      if (!merge) return { status: 'not_found' };
      if (merge.undone_at) return { status: 'already_undone' };

      const { rows: primaries } = await client.query<ContactRow>(
        `SELECT ${CONTACT_COLUMNS} FROM contacts
          WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
          FOR UPDATE`,
        [merge.primary_contact_id, ownerId],
      );
      const primary = primaries[0];
      if (!primary || primary.version !== merge.primary_version_after) {
        return { status: 'primary_changed', current: primary ? toContact(primary) : null };
      }

      const before = merge.snapshot.find((snapshot) => snapshot.id === merge.primary_contact_id);
      if (!before) throw new Error(`La fusión ${merge.id} no tiene la foto del contacto principal`);

      await client.query(UPDATE_CONTACT_DATA, [...recordParams(before), merge.primary_contact_id]);
      await client.query(
        `UPDATE contacts SET deleted_at = NULL, version = version + 1, updated_at = NOW()
          WHERE owner_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NOT NULL`,
        [ownerId, merge.merged_contact_ids],
      );
      await client.query('UPDATE contact_merges SET undone_at = NOW() WHERE id = $1', [merge.id]);

      const { rows } = await client.query<ContactRow>(
        `SELECT ${CONTACT_COLUMNS} FROM contacts WHERE id = ANY($1::int[]) ORDER BY id`,
        [[merge.primary_contact_id, ...merge.merged_contact_ids]],
      );
      return { status: 'undone', contacts: rows.map(toContact) };
    });
  }
}
