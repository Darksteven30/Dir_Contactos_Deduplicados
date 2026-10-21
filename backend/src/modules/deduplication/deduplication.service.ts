import { UnionFind } from '../../shared/algorithms/unionFind';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError';
import type { Page, PageRequest } from '../../shared/http/pagination';
import type { Contact, ContactData } from '../contacts/contact.entity';
import { normalizeContact } from '../contacts/contact.normalizer';
import { combineContacts } from './contactMerge';
import { compareContacts } from './contactSimilarity';
import type {
  ContactMerge,
  DuplicateGroup,
  DuplicatePair,
  MergeResult,
  SimilarContact,
} from './deduplication.entity';
import type { ComparableContact, DeduplicationRepository } from './deduplication.repository';
import type { MergeContactsDto } from './deduplication.schemas';

function toPublic({
  normalizedName: _name,
  normalizedEmail: _email,
  normalizedPhone: _phone,
  ...contact
}: ComparableContact): Contact {
  return contact;
}

// Cuántos datos opcionales tiene el contacto: el más completo es el mejor candidato a principal.
function completeness(contact: Contact): number {
  return [contact.email, contact.phone, contact.company, contact.notes].filter((value) => value !== null).length;
}

// Orden sugerido para fusionar: el primero es el principal (el más completo, y el más antiguo si empatan).
function rankForMerge(contacts: Contact[]): { primary: Contact; duplicates: Contact[] } {
  const [primary, ...duplicates] = [...contacts].sort(
    (a, b) => completeness(b) - completeness(a) || a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
  );
  if (!primary) throw new Error('Un grupo de duplicados no puede estar vacío');
  return { primary, duplicates };
}

const CONTACTS_NOT_FOUND = 'Algún contacto no existe, ya fue eliminado o fusionado';

/**
 * Detección de duplicados en dos fases:
 * 1. Blocking (repositorio/PostgreSQL): pares candidatos con alguna señal de parecido.
 * 2. Puntaje (contactSimilarity, Levenshtein): se conservan los pares con score >= minScore
 *    y se agrupan de forma transitiva con Union-Find.
 */
export class DeduplicationService {
  constructor(private readonly repository: DeduplicationRepository) {}

  async findDuplicateGroups(ownerId: number, minScore: number): Promise<DuplicateGroup[]> {
    const { contacts, pairs } = await this.repository.findCandidatePairs(ownerId);
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));

    const groups = new UnionFind();
    const matches: DuplicatePair[] = [];
    for (const [aId, bId] of pairs) {
      const a = byId.get(aId);
      const b = byId.get(bId);
      if (!a || !b) continue;

      const match = compareContacts(a, b);
      if (match.score < minScore) continue;

      groups.union(aId, bId);
      matches.push({ contactIds: [aId, bId], ...match });
    }

    return groups
      .groups()
      .map((ids): DuplicateGroup => {
        const members = ids.flatMap((id) => {
          const contact = byId.get(id);
          return contact ? [toPublic(contact)] : [];
        });
        const groupPairs = matches
          .filter((pair) => ids.includes(pair.contactIds[0]))
          .sort((x, y) => y.score - x.score);
        const { primary, duplicates } = rankForMerge(members);
        return {
          score: Math.max(...groupPairs.map((pair) => pair.score)),
          suggestedPrimaryId: primary.id,
          mergePreview: combineContacts(primary, duplicates),
          contacts: members,
          pairs: groupPairs,
        };
      })
      .sort((x, y) => y.score - x.score || x.suggestedPrimaryId - y.suggestedPrimaryId);
  }

  /** Contactos existentes parecidos a los datos de un contacto nuevo, del más al menos parecido. */
  async findSimilar(ownerId: number, data: ContactData, minScore: number): Promise<SimilarContact[]> {
    const draft = normalizeContact(data);
    const candidates = await this.repository.findCandidatesFor(ownerId, draft);

    return candidates
      .map((candidate) => ({ contact: toPublic(candidate), match: compareContacts(draft, candidate) }))
      .filter(({ match }) => match.score >= minScore)
      .sort((x, y) => y.match.score - x.match.score);
  }

  /** Marca dos contactos como "no son duplicados" para no volver a sugerirlos. */
  async dismissPair(ownerId: number, [first, second]: [number, number]): Promise<void> {
    if ((await this.repository.countOwned(ownerId, [first, second])) !== 2) {
      throw new NotFoundError('Contacto no encontrado');
    }
    await this.repository.dismissPair(Math.min(first, second), Math.max(first, second));
  }

  /**
   * Fusiona duplicados en un contacto principal. Los datos finales son los que eligió el usuario
   * o, si no envió ninguno, la combinación automática de los contactos tal como están en la base.
   */
  async merge(ownerId: number, { primary, duplicates, contact }: MergeContactsDto): Promise<MergeResult> {
    const outcome = await this.repository.merge(ownerId, primary, duplicates, (current, others) =>
      normalizeContact(contact ?? combineContacts(current, others)),
    );

    switch (outcome.status) {
      case 'merged':
        return { merge: outcome.merge, contact: outcome.contact };
      case 'version_conflict':
        throw new ConflictError('Algún contacto fue modificado por otra sesión. Revisa los cambios e intenta de nuevo', {
          current: outcome.current,
        });
      case 'not_found':
        throw new NotFoundError(CONTACTS_NOT_FOUND);
    }
  }

  listMerges(ownerId: number, page: PageRequest): Promise<Page<ContactMerge>> {
    return this.repository.listMerges(ownerId, page);
  }

  async undoMerge(ownerId: number, mergeId: number): Promise<Contact[]> {
    const outcome = await this.repository.undoMerge(ownerId, mergeId);

    switch (outcome.status) {
      case 'undone':
        return outcome.contacts;
      case 'not_found':
        throw new NotFoundError('Fusión no encontrada');
      case 'already_undone':
        throw new ConflictError('La fusión ya fue deshecha');
      case 'primary_changed':
        throw new ConflictError(
          'El contacto principal cambió después de la fusión; deshacerla borraría esos cambios',
          { current: outcome.current },
        );
    }
  }
}
