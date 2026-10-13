import { ConflictError, NotFoundError } from '../../shared/errors/AppError';
import type { Page, PageRequest } from '../../shared/http/pagination';
import type { Contact, ContactData, ScoredContact } from './contact.entity';
import { normalizeEmail, normalizePhone, normalizeText } from './contact.normalizer';
import type { ContactRecord, ContactRepository } from './contact.repository';
import type { SearchContactsQuery, UpdateContactDto } from './contact.schemas';

// Mínimo de dígitos para que una búsqueda también se compare contra los teléfonos.
const MIN_PHONE_SEARCH_DIGITS = 3;

const CONTACT_NOT_FOUND = 'Contacto no encontrado';

function toRecord(data: ContactData): ContactRecord {
  return {
    ...data,
    normalizedName: normalizeText(data.fullName),
    normalizedEmail: normalizeEmail(data.email),
    normalizedPhone: normalizePhone(data.phone),
  };
}

// Reglas de negocio de contactos. Cada operación recibe el id del dueño (usuario autenticado).
export class ContactService {
  constructor(private readonly contacts: ContactRepository) {}

  /** Dueño de un contacto o null si no existe. Lo usa el middleware de pertenencia. */
  findOwnerId(id: number): Promise<number | null> {
    return this.contacts.findOwnerId(id);
  }

  list(ownerId: number, page: PageRequest): Promise<Page<Contact>> {
    return this.contacts.list(ownerId, page);
  }

  search(ownerId: number, { q, ...page }: SearchContactsQuery): Promise<Page<ScoredContact>> {
    const digits = q.replace(/\D/g, '');
    return this.contacts.search(
      ownerId,
      {
        text: normalizeText(q),
        email: q.trim().toLowerCase(),
        phoneDigits: digits.length >= MIN_PHONE_SEARCH_DIGITS ? digits : null,
      },
      page,
    );
  }

  async getById(ownerId: number, id: number): Promise<Contact> {
    const contact = await this.contacts.findById(ownerId, id);
    if (!contact) throw new NotFoundError(CONTACT_NOT_FOUND);
    return contact;
  }

  create(ownerId: number, data: ContactData): Promise<Contact> {
    return this.contacts.create(ownerId, toRecord(data));
  }

  async update(ownerId: number, id: number, { version, ...data }: UpdateContactDto): Promise<Contact> {
    const result = await this.contacts.update(ownerId, id, version, toRecord(data));

    switch (result.status) {
      case 'updated':
        return result.contact;
      case 'version_conflict':
        // Se devuelve la versión vigente para que el cliente resuelva el conflicto.
        throw new ConflictError('El contacto fue modificado por otra sesión. Revisa los cambios e intenta de nuevo', {
          current: result.current,
        });
      case 'not_found':
        throw new NotFoundError(CONTACT_NOT_FOUND);
    }
  }

  async remove(ownerId: number, id: number): Promise<void> {
    if (!(await this.contacts.softDelete(ownerId, id))) {
      throw new NotFoundError(CONTACT_NOT_FOUND);
    }
  }
}
