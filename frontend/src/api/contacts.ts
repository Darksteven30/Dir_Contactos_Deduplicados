import type {
  ApiSuccess,
  Contact,
  ContactInput,
  Page,
  PageRequest,
  ScoredContact,
  SimilarContact,
} from '@/types/api'
import { http } from './client'

/** Funciones tipadas para `/api/contacts`. Devuelven directamente el `data` de la respuesta. */
export const contactsApi = {
  async list(page: PageRequest): Promise<Page<Contact>> {
    const { data } = await http.get<ApiSuccess<Page<Contact>>>('/contacts', { params: page })
    return data.data
  },

  /** Búsqueda difusa (trigramas) por nombre, email o teléfono, ordenada por parecido. */
  async search(q: string, page: PageRequest): Promise<Page<ScoredContact>> {
    const { data } = await http.get<ApiSuccess<Page<ScoredContact>>>('/contacts/search', {
      params: { q, ...page },
    })
    return data.data
  },

  async create(input: ContactInput): Promise<Contact> {
    const { data } = await http.post<ApiSuccess<Contact>>('/contacts', input)
    return data.data
  },

  /** Reemplaza el contacto. Responde 409 si `version` no es la vigente (otra sesión lo editó). */
  async update(id: number, input: ContactInput, version: number): Promise<Contact> {
    const { data } = await http.put<ApiSuccess<Contact>>(`/contacts/${id}`, { ...input, version })
    return data.data
  },

  async remove(id: number): Promise<void> {
    await http.delete(`/contacts/${id}`)
  },

  /** Contactos existentes parecidos a los datos dados. No guarda nada. */
  async findSimilar(input: ContactInput): Promise<SimilarContact[]> {
    const { data } = await http.post<ApiSuccess<SimilarContact[]>>(
      '/contacts/duplicates/check',
      input,
    )
    return data.data
  },
}
