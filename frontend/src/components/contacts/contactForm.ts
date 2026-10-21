import type { Contact, ContactInput } from '@/types/api'

/** Estado del formulario: todos los campos como texto (los inputs no manejan null). */
export interface ContactFormState {
  fullName: string
  email: string
  phone: string
  company: string
  notes: string
}

export type ContactField = keyof ContactFormState

export const FIELD_LABELS: Record<ContactField, string> = {
  fullName: 'Nombre completo',
  email: 'Email',
  phone: 'Teléfono',
  company: 'Empresa',
  notes: 'Notas',
}

export const NOTES_MAX_LENGTH = 2000

// Mismas reglas que el backend (contacts/contact.schemas.ts).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[\d\s().-]+$/
const MIN_PHONE_DIGITS = 7

export function emptyForm(): ContactFormState {
  return { fullName: '', email: '', phone: '', company: '', notes: '' }
}

export function formFromContact(contact: ContactInput): ContactFormState {
  return {
    fullName: contact.fullName,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    company: contact.company ?? '',
    notes: contact.notes ?? '',
  }
}

/** Convierte el formulario en lo que espera la API: texto recortado y vacíos como null. */
export function formToInput(form: ContactFormState): ContactInput {
  const optional = (value: string) => value.trim() || null
  return {
    fullName: form.fullName.trim(),
    email: optional(form.email),
    phone: optional(form.phone),
    company: optional(form.company),
    notes: optional(form.notes),
  }
}

/** Errores por campo; vacío si el formulario es válido. */
export function validateContactForm(form: ContactFormState): Partial<Record<ContactField, string>> {
  const errors: Partial<Record<ContactField, string>> = {}
  const email = form.email.trim()
  const phone = form.phone.trim()

  if (!/[\p{L}\p{N}]/u.test(form.fullName)) errors.fullName = 'El nombre es requerido'
  if (email && !EMAIL_PATTERN.test(email)) errors.email = 'Email inválido'
  if (phone && (!PHONE_PATTERN.test(phone) || phone.replace(/\D/g, '').length < MIN_PHONE_DIGITS)) {
    errors.phone = `Teléfono inválido: usa dígitos, espacios, +, -, () y al menos ${MIN_PHONE_DIGITS} dígitos`
  }
  if (form.notes.length > NOTES_MAX_LENGTH) {
    errors.notes = `Máximo ${NOTES_MAX_LENGTH} caracteres`
  }
  return errors
}

export function contactToInput(contact: Contact): ContactInput {
  const { fullName, email, phone, company, notes } = contact
  return { fullName, email, phone, company, notes }
}
