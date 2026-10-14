import type { ContactData } from '../contacts/contact.entity';
import { normalizeEmail, normalizePhone, normalizeText } from '../contacts/contact.normalizer';

type MergeableField = 'email' | 'phone' | 'company';

const FIELD_LABELS: Record<MergeableField, string> = { email: 'email', phone: 'teléfono', company: 'empresa' };

// Clave para decidir si dos valores son el mismo dato escrito distinto.
const FIELD_KEYS: Record<MergeableField, (value: string) => string | null> = {
  email: normalizeEmail,
  phone: (value) => normalizePhone(value)?.slice(-10) ?? null,
  company: normalizeText,
};

/**
 * Combina un contacto principal con sus duplicados sin perder información:
 * - El nombre es el del principal.
 * - Email, teléfono y empresa: se conserva el del principal; si no tiene, el primero que
 *   aparezca en los duplicados. Los valores distintos que no se eligieron se anotan en las notas.
 * - Las notas de todos se juntan (sin repetir).
 */
export function combineContacts(primary: ContactData, duplicates: ContactData[]): ContactData {
  const all = [primary, ...duplicates];
  const leftovers: string[] = [];

  const pick = (field: MergeableField): string | null => {
    const seen = new Set<string>();
    let chosen: string | null = null;
    for (const value of all.map((contact) => contact[field])) {
      const key = value === null ? null : FIELD_KEYS[field](value);
      if (value === null || key === null || seen.has(key)) continue;
      seen.add(key);
      if (chosen === null) chosen = value;
      else leftovers.push(`${FIELD_LABELS[field]}: ${value}`);
    }
    return chosen;
  };

  const email = pick('email');
  const phone = pick('phone');
  const company = pick('company');

  const notes = [...new Set(all.map((contact) => contact.notes?.trim()).filter((note): note is string => !!note))];
  if (leftovers.length > 0) notes.push(`Otros datos de contactos fusionados: ${leftovers.join('; ')}`);

  return { fullName: primary.fullName, email, phone, company, notes: notes.length > 0 ? notes.join('\n\n') : null };
}
