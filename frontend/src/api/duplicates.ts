import type {
  ApiSuccess,
  Contact,
  ContactMerge,
  DuplicateGroup,
  MergeRequest,
  MergeResult,
  Page,
  PageRequest,
} from '@/types/api'
import { http } from './client'

/** Funciones tipadas para `/api/contacts/duplicates`. */
export const duplicatesApi = {
  /** Grupos de contactos que superan `minScore` (0.5 a 1), del más al menos probable. */
  async groups(minScore: number): Promise<DuplicateGroup[]> {
    const { data } = await http.get<ApiSuccess<DuplicateGroup[]>>('/contacts/duplicates', {
      params: { minScore },
    })
    return data.data
  },

  /** Marca un par como "no son la misma persona": deja de sugerirse. */
  async dismissPair(contactIds: [number, number]): Promise<void> {
    await http.post('/contacts/duplicates/dismissals', { contactIds })
  },

  /** Fusión atómica en el servidor. Responde 409 si algún contacto cambió desde que se leyó. */
  async merge(request: MergeRequest): Promise<MergeResult> {
    const { data } = await http.post<ApiSuccess<MergeResult>>(
      '/contacts/duplicates/merges',
      request,
    )
    return data.data
  },

  async history(page: PageRequest): Promise<Page<ContactMerge>> {
    const { data } = await http.get<ApiSuccess<Page<ContactMerge>>>('/contacts/duplicates/merges', {
      params: page,
    })
    return data.data
  },

  /** Restaura los contactos como estaban antes de la fusión. */
  async undo(mergeId: number): Promise<Contact[]> {
    const { data } = await http.post<ApiSuccess<Contact[]>>(
      `/contacts/duplicates/merges/${mergeId}/undo`,
    )
    return data.data
  },
}
