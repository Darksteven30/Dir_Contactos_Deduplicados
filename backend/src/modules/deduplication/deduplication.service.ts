import { UnionFind } from '../../shared/algorithms/unionFind';
import { NotFoundError } from '../../shared/errors/AppError';
import type { Contact, ContactData } from '../contacts/contact.entity';
import { normalizeContact } from '../contacts/contact.normalizer';
import { compareContacts } from './contactSimilarity';
import type { DuplicateGroup, DuplicatePair, SimilarContact } from './deduplication.entity';
import type { ComparableContact, DeduplicationRepository } from './deduplication.repository';

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

function suggestPrimary(contacts: Contact[]): number {
  const [primary] = [...contacts].sort(
    (a, b) => completeness(b) - completeness(a) || a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
  );
  if (!primary) throw new Error('Un grupo de duplicados no puede estar vacío');
  return primary.id;
}

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
        return {
          score: Math.max(...groupPairs.map((pair) => pair.score)),
          suggestedPrimaryId: suggestPrimary(members),
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
}
