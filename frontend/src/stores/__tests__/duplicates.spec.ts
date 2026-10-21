import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { duplicatesApi } from '@/api/duplicates'
import { ApiError } from '@/api/errors'
import type { Contact, DuplicateGroup } from '@/types/api'
import { useContactsStore } from '../contacts'
import { MergeConflictError, useDuplicatesStore } from '../duplicates'

type DuplicatesApi = (typeof import('@/api/duplicates'))['duplicatesApi']

vi.mock('@/api/duplicates', () => ({
  duplicatesApi: {
    groups: vi.fn<DuplicatesApi['groups']>(),
    dismissPair: vi.fn<DuplicatesApi['dismissPair']>(),
    merge: vi.fn<DuplicatesApi['merge']>(),
    history: vi.fn<DuplicatesApi['history']>(),
    undo: vi.fn<DuplicatesApi['undo']>(),
  },
}))

const contact = (id: number, fullName: string, version = 1): Contact => ({
  id,
  ownerId: 1,
  fullName,
  email: null,
  phone: null,
  company: null,
  notes: null,
  version,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

const match = { score: 0.9, nameSimilarity: 0.9, emailMatch: null, phoneMatch: null }

// A~B por nombre y B~C por teléfono (agrupación transitiva).
const trio = (): DuplicateGroup => ({
  score: 0.95,
  suggestedPrimaryId: 1,
  mergePreview: { fullName: 'José Pérez', email: null, phone: null, company: null, notes: null },
  contacts: [contact(1, 'José Pérez', 3), contact(2, 'jose perez'), contact(3, 'Pepe', 2)],
  pairs: [
    { contactIds: [1, 2], ...match },
    { contactIds: [2, 3], ...match },
  ],
})

const pairGroup = (): DuplicateGroup => ({
  ...trio(),
  contacts: [contact(4, 'Daniel Rojas'), contact(5, 'Daniela Rojas')],
  suggestedPrimaryId: 4,
  pairs: [{ contactIds: [4, 5], ...match }],
})

describe('useDuplicatesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    localStorage.clear()
  })

  it('carga los grupos con la sensibilidad elegida', async () => {
    vi.mocked(duplicatesApi.groups).mockResolvedValue([trio(), pairGroup()])
    const store = useDuplicatesStore()

    await store.fetchGroups()

    expect(duplicatesApi.groups).toHaveBeenCalledWith(0.8)
    expect(store.groups).toHaveLength(2)
    expect(store.redundantCount).toBe(3)
    expect(store.status).toBe('success')
  })

  it('recuerda la sensibilidad elegida (persistencia selectiva)', async () => {
    vi.mocked(duplicatesApi.groups).mockResolvedValue([])
    const store = useDuplicatesStore()

    await store.setMinScore(0.9)

    expect(duplicatesApi.groups).toHaveBeenLastCalledWith(0.9)
    setActivePinia(createPinia())
    expect(useDuplicatesStore().minScore).toBe(0.9)
  })

  it('"no son duplicados" descarta cada par y quita el grupo al instante', async () => {
    vi.mocked(duplicatesApi.groups).mockResolvedValue([trio(), pairGroup()])
    let finish!: () => void
    vi.mocked(duplicatesApi.dismissPair).mockReturnValue(new Promise((r) => (finish = () => r())))
    const store = useDuplicatesStore()
    await store.fetchGroups()

    const dismissal = store.dismissGroup(store.groups[0]!)
    expect(store.groups).toHaveLength(1)
    finish()
    await dismissal

    expect(duplicatesApi.dismissPair).toHaveBeenCalledWith([1, 2])
    expect(duplicatesApi.dismissPair).toHaveBeenCalledWith([2, 3])
  })

  it('si descartar falla, el grupo vuelve a aparecer', async () => {
    vi.mocked(duplicatesApi.groups).mockResolvedValue([pairGroup()])
    vi.mocked(duplicatesApi.dismissPair).mockRejectedValue(new ApiError('Sin conexión', 0))
    const store = useDuplicatesStore()
    await store.fetchGroups()

    await expect(store.dismissGroup(store.groups[0]!)).rejects.toBeInstanceOf(ApiError)
    expect(store.groups).toHaveLength(1)
  })

  it('"no es la misma persona" descarta solo los pares de ese contacto y recalcula', async () => {
    vi.mocked(duplicatesApi.groups).mockResolvedValueOnce([trio()]).mockResolvedValueOnce([])
    vi.mocked(duplicatesApi.dismissPair).mockResolvedValue()
    const store = useDuplicatesStore()
    await store.fetchGroups()

    await store.excludeContact(store.groups[0]!, 3)

    expect(duplicatesApi.dismissPair).toHaveBeenCalledTimes(1)
    expect(duplicatesApi.dismissPair).toHaveBeenCalledWith([2, 3])
    expect(duplicatesApi.groups).toHaveBeenCalledTimes(2)
  })

  it('fusiona enviando el principal y los duplicados con las versiones leídas', async () => {
    vi.mocked(duplicatesApi.groups).mockResolvedValue([trio()])
    vi.mocked(duplicatesApi.merge).mockResolvedValue({
      merge: {
        id: 1,
        primaryContactId: 3,
        mergedContactIds: [1, 2],
        before: [],
        createdAt: '',
        undoneAt: null,
      },
      contact: contact(3, 'José Pérez', 3),
    })
    const store = useDuplicatesStore()
    const contacts = useContactsStore()
    const invalidate = vi.spyOn(contacts, 'invalidate')
    await store.fetchGroups()
    const final = {
      fullName: 'José Pérez',
      email: 'jp@x.com',
      phone: null,
      company: null,
      notes: null,
    }

    await store.merge(store.groups[0]!, 3, final)

    expect(duplicatesApi.merge).toHaveBeenCalledWith({
      primary: { id: 3, version: 2 },
      duplicates: [
        { id: 1, version: 3 },
        { id: 2, version: 1 },
      ],
      contact: final,
    })
    expect(store.groups).toHaveLength(0)
    expect(invalidate).toHaveBeenCalled()
  })

  it('si algún contacto cambió (409) avisa y recarga los grupos', async () => {
    vi.mocked(duplicatesApi.groups).mockResolvedValue([trio()])
    vi.mocked(duplicatesApi.merge).mockRejectedValue(
      new ApiError('Modificado', 409, { current: [] }),
    )
    const store = useDuplicatesStore()
    await store.fetchGroups()

    await expect(store.merge(store.groups[0]!, 1, trio().mergePreview)).rejects.toBeInstanceOf(
      MergeConflictError,
    )
    expect(duplicatesApi.groups).toHaveBeenCalledTimes(2)
  })

  it('deshacer una fusión invalida los contactos y recarga el historial', async () => {
    vi.mocked(duplicatesApi.undo).mockResolvedValue([])
    vi.mocked(duplicatesApi.history).mockResolvedValue({
      page: 1,
      pageSize: 10,
      total: 0,
      items: [],
    })
    const store = useDuplicatesStore()
    const invalidate = vi.spyOn(useContactsStore(), 'invalidate')

    await store.undo(7)

    expect(duplicatesApi.undo).toHaveBeenCalledWith(7)
    expect(invalidate).toHaveBeenCalled()
    expect(duplicatesApi.history).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
  })
})
