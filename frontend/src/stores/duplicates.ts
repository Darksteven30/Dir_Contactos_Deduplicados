import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { duplicatesApi } from '@/api/duplicates'
import { ApiError, toApiError } from '@/api/errors'
import type { ContactInput, ContactMerge, DuplicateGroup, MergeResult, Page } from '@/types/api'
import { useContactsStore, type LoadStatus } from './contacts'

/** Qué tan parecidos deben ser dos contactos para sugerirlos como duplicados. */
export const SENSITIVITY_LEVELS = [
  { value: 0.9, label: 'Estricta', hint: 'Solo coincidencias casi exactas' },
  { value: 0.8, label: 'Normal', hint: 'Recomendada' },
  { value: 0.7, label: 'Amplia', hint: 'Incluye nombres con más diferencias' },
] as const

const DEFAULT_MIN_SCORE = 0.8
const MIN_SCORE_STORAGE_KEY = 'contactos:minScore'
const HISTORY_PAGE_SIZE = 10

/** Algún contacto del grupo cambió (o ya no existe) desde que se cargó: hay que revisar de nuevo. */
export class MergeConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MergeConflictError'
  }
}

// Persistencia selectiva: solo la preferencia de sensibilidad.
function loadMinScore(): number {
  try {
    const saved = Number(localStorage.getItem(MIN_SCORE_STORAGE_KEY))
    return SENSITIVITY_LEVELS.some((level) => level.value === saved) ? saved : DEFAULT_MIN_SCORE
  } catch {
    return DEFAULT_MIN_SCORE
  }
}

function saveMinScore(value: number): void {
  try {
    localStorage.setItem(MIN_SCORE_STORAGE_KEY, String(value))
  } catch {
    // Sin almacenamiento: la preferencia dura solo esta sesión.
  }
}

/** Grupos de duplicados, fusiones e historial. */
export const useDuplicatesStore = defineStore('duplicates', () => {
  const groups = ref<DuplicateGroup[]>([])
  const status = ref<LoadStatus>('idle')
  const error = ref<ApiError | null>(null)
  const minScore = ref(loadMinScore())

  const history = ref<Page<ContactMerge> | null>(null)
  const historyStatus = ref<LoadStatus>('idle')
  const historyError = ref<ApiError | null>(null)

  let latestRequest = 0

  const isLoading = computed(() => status.value === 'loading')
  /** Contactos que sobrarían si se fusionaran todos los grupos. */
  const redundantCount = computed(() =>
    groups.value.reduce((sum, group) => sum + group.contacts.length - 1, 0),
  )

  async function fetchGroups(): Promise<void> {
    const request = ++latestRequest
    status.value = 'loading'
    error.value = null
    try {
      const result = await duplicatesApi.groups(minScore.value)
      if (request !== latestRequest) return
      groups.value = result
      status.value = 'success'
    } catch (err) {
      if (request !== latestRequest) return
      error.value = toApiError(err)
      status.value = 'error'
    }
  }

  function setMinScore(value: number): Promise<void> {
    minScore.value = value
    saveMinScore(value)
    return fetchGroups()
  }

  const keyOf = (group: DuplicateGroup) => group.contacts.map((c) => c.id).join('-')

  /** "No son duplicados": descarta todos los pares del grupo. Desaparece al instante. */
  async function dismissGroup(group: DuplicateGroup): Promise<void> {
    const previous = groups.value
    groups.value = groups.value.filter((g) => keyOf(g) !== keyOf(group))
    try {
      await Promise.all(group.pairs.map((pair) => duplicatesApi.dismissPair(pair.contactIds)))
    } catch (err) {
      groups.value = previous
      throw toApiError(err)
    }
  }

  /** "No es la misma persona": saca un contacto del grupo descartando sus pares. */
  async function excludeContact(group: DuplicateGroup, contactId: number): Promise<void> {
    const pairs = group.pairs.filter((pair) => pair.contactIds.includes(contactId))
    await Promise.all(pairs.map((pair) => duplicatesApi.dismissPair(pair.contactIds)))
    // El resto del grupo puede seguir unido o separarse: lo recalcula el servidor.
    await fetchGroups()
  }

  /**
   * Fusiona el grupo en `primaryId` con los datos finales `contact`. Se envían las versiones
   * con las que se cargó el grupo: si alguna cambió, el servidor rechaza la fusión (409).
   */
  async function merge(
    group: DuplicateGroup,
    primaryId: number,
    contact: ContactInput,
  ): Promise<MergeResult> {
    const primary = group.contacts.find((c) => c.id === primaryId)
    if (!primary) throw new Error('El principal debe ser parte del grupo')
    const ref = (c: { id: number; version: number }) => ({ id: c.id, version: c.version })

    try {
      const result = await duplicatesApi.merge({
        primary: ref(primary),
        duplicates: group.contacts.filter((c) => c.id !== primaryId).map(ref),
        contact,
      })
      groups.value = groups.value.filter((g) => keyOf(g) !== keyOf(group))
      useContactsStore().invalidate()
      history.value = null
      return result
    } catch (err) {
      const apiError = toApiError(err)
      if (apiError.status === 409 || apiError.status === 404) {
        void fetchGroups()
        throw new MergeConflictError(
          'Algún contacto del grupo cambió o fue eliminado mientras lo revisabas. Actualizamos los grupos: revísalo de nuevo.',
        )
      }
      throw apiError
    }
  }

  async function fetchHistory(page = 1): Promise<void> {
    historyStatus.value = 'loading'
    historyError.value = null
    try {
      history.value = await duplicatesApi.history({ page, pageSize: HISTORY_PAGE_SIZE })
      historyStatus.value = 'success'
    } catch (err) {
      historyError.value = toApiError(err)
      historyStatus.value = 'error'
    }
  }

  /** Deshace una fusión: los contactos vuelven a estar separados. */
  async function undo(mergeId: number): Promise<void> {
    await duplicatesApi.undo(mergeId).catch((err: unknown) => {
      throw toApiError(err)
    })
    useContactsStore().invalidate()
    await fetchHistory(history.value?.page ?? 1)
  }

  return {
    groups,
    status,
    error,
    minScore,
    isLoading,
    redundantCount,
    history,
    historyStatus,
    historyError,
    fetchGroups,
    setMinScore,
    dismissGroup,
    excludeContact,
    merge,
    fetchHistory,
    undo,
  }
})
