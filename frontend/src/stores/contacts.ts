import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { contactsApi } from '@/api/contacts'
import { ApiError, toApiError } from '@/api/errors'
import type {
  Contact,
  ContactConflictDetails,
  ContactInput,
  Page,
  ScoredContact,
} from '@/types/api'

export const PAGE_SIZES = [10, 20, 50] as const
const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_STORAGE_KEY = 'contactos:pageSize'
/** Una página consultada hace menos de esto se muestra desde la caché sin volver a pedirla. */
export const CACHE_TTL_MS = 30_000

export interface ContactQuery {
  /** Texto de búsqueda; vacío = listado alfabético. */
  q: string
  page: number
}

export type LoadStatus = 'idle' | 'loading' | 'success' | 'error'

interface CachedPage {
  ids: number[]
  total: number
  /** Parecido con la búsqueda (solo cuando hay `q`). */
  scores: Record<number, number>
  fetchedAt: number
}

/** Al editar, otra sesión modificó el contacto antes: se entrega la versión vigente para decidir. */
export class ContactConflictError extends Error {
  constructor(readonly current: Contact) {
    super('El contacto fue modificado por otra sesión')
    this.name = 'ContactConflictError'
  }
}

function isConflictDetails(value: unknown): value is ContactConflictDetails {
  return typeof value === 'object' && value !== null && 'current' in value
}

// Persistencia selectiva: solo la preferencia de tamaño de página, que no es un dato sensible.
// Los contactos no se guardan en el navegador: siempre vienen del servidor.
function loadPageSize(): number {
  try {
    const saved = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
    return (PAGE_SIZES as readonly number[]).includes(saved) ? saved : DEFAULT_PAGE_SIZE
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

function savePageSize(size: number): void {
  try {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size))
  } catch {
    // Sin almacenamiento disponible (modo privado): la preferencia dura solo esta sesión.
  }
}

/**
 * Directorio de contactos, normalizado:
 * - `byId` guarda cada contacto una sola vez, aunque aparezca en varias páginas o búsquedas;
 *   así, al editar uno, se actualiza en todas partes.
 * - `ids` es el orden de la página que se está mostrando.
 * - Caché por consulta (texto + página + tamaño) con vencimiento; cualquier cambio la invalida.
 */
export const useContactsStore = defineStore('contacts', () => {
  const byId = ref<Record<number, Contact>>({})
  const ids = ref<number[]>([])
  const scores = ref<Record<number, number>>({})
  const total = ref(0)
  const query = ref<ContactQuery>({ q: '', page: 1 })
  const pageSize = ref(loadPageSize())
  const status = ref<LoadStatus>('idle')
  const error = ref<ApiError | null>(null)

  const cache = new Map<string, CachedPage>()
  // Si el usuario escribe rápido, una respuesta vieja puede llegar después de una nueva:
  // solo se aplica la de la última petición.
  let latestRequest = 0

  const items = computed(() => ids.value.flatMap((id) => byId.value[id] ?? []))
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  const isSearching = computed(() => query.value.q !== '')
  const isLoading = computed(() => status.value === 'loading')

  const cacheKey = (q: string, page: number, size: number) => JSON.stringify([q, page, size])

  function upsert(contacts: Contact[]): void {
    for (const contact of contacts) byId.value[contact.id] = contact
  }

  function apply(entry: CachedPage): void {
    ids.value = entry.ids
    total.value = entry.total
    scores.value = entry.scores
  }

  function toEntry(result: Page<Contact> | Page<ScoredContact>): CachedPage {
    const entryScores: Record<number, number> = {}
    const contacts = result.items.map((item) => {
      if ('score' in item) {
        const { score, ...contact } = item
        entryScores[contact.id] = score
        return contact
      }
      return item
    })
    upsert(contacts)
    return {
      ids: contacts.map((c) => c.id),
      total: result.total,
      scores: entryScores,
      fetchedAt: Date.now(),
    }
  }

  /** Carga una página del listado o de la búsqueda. Usa la caché si es reciente, salvo `force`. */
  async function fetchPage(
    next: Partial<ContactQuery> = {},
    { force = false } = {},
  ): Promise<void> {
    query.value = { q: (next.q ?? query.value.q).trim(), page: next.page ?? query.value.page }
    const { q, page } = query.value
    const key = cacheKey(q, page, pageSize.value)
    const cached = cache.get(key)

    if (cached && !force && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      apply(cached)
      status.value = 'success'
      error.value = null
      return
    }
    // Mientras llega la versión nueva se muestra la anterior, si la hay.
    if (cached) apply(cached)

    const request = ++latestRequest
    status.value = 'loading'
    error.value = null
    try {
      const pageRequest = { page, pageSize: pageSize.value }
      const result = q
        ? await contactsApi.search(q, pageRequest)
        : await contactsApi.list(pageRequest)
      if (request !== latestRequest) return
      const entry = toEntry(result)
      cache.set(key, entry)
      apply(entry)
      status.value = 'success'
    } catch (err) {
      if (request !== latestRequest) return
      error.value = toApiError(err)
      status.value = 'error'
    }
  }

  function setPageSize(size: number): Promise<void> {
    pageSize.value = size
    savePageSize(size)
    return fetchPage({ page: 1 })
  }

  /** Los datos del servidor cambiaron: las páginas guardadas ya no son confiables. */
  function invalidate(): void {
    cache.clear()
  }

  async function create(input: ContactInput): Promise<Contact> {
    const contact = await contactsApi.create(input)
    upsert([contact])
    invalidate()
    return contact
  }

  /**
   * Guarda los cambios con la versión que el usuario tenía. Si otra sesión lo modificó antes,
   * lanza `ContactConflictError` con la versión vigente (que además se refleja en la lista).
   */
  async function update(id: number, input: ContactInput, version: number): Promise<Contact> {
    try {
      const contact = await contactsApi.update(id, input, version)
      upsert([contact])
      invalidate()
      return contact
    } catch (err) {
      const apiError = toApiError(err)
      if (apiError.status === 409 && isConflictDetails(apiError.details)) {
        upsert([apiError.details.current])
        invalidate()
        throw new ContactConflictError(apiError.details.current)
      }
      throw apiError
    }
  }

  /** Borrado optimista: desaparece de la lista al instante y vuelve si el servidor lo rechaza. */
  async function remove(id: number): Promise<void> {
    const previous = { ids: ids.value, total: total.value }
    ids.value = ids.value.filter((existing) => existing !== id)
    total.value = Math.max(0, total.value - 1)
    try {
      await contactsApi.remove(id)
      delete byId.value[id]
      invalidate()
    } catch (err) {
      ids.value = previous.ids
      total.value = previous.total
      throw toApiError(err)
    }
  }

  return {
    byId,
    ids,
    scores,
    total,
    query,
    pageSize,
    status,
    error,
    items,
    totalPages,
    isSearching,
    isLoading,
    fetchPage,
    setPageSize,
    invalidate,
    create,
    update,
    remove,
  }
})
