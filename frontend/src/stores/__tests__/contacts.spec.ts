import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contactsApi } from '@/api/contacts'
import { ApiError } from '@/api/errors'
import type { Contact, Page } from '@/types/api'
import { CACHE_TTL_MS, ContactConflictError, useContactsStore } from '../contacts'

type ContactsApi = (typeof import('@/api/contacts'))['contactsApi']

vi.mock('@/api/contacts', () => ({
  contactsApi: {
    list: vi.fn<ContactsApi['list']>(),
    search: vi.fn<ContactsApi['search']>(),
    create: vi.fn<ContactsApi['create']>(),
    update: vi.fn<ContactsApi['update']>(),
    remove: vi.fn<ContactsApi['remove']>(),
    findSimilar: vi.fn<ContactsApi['findSimilar']>(),
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

const page = <T>(items: T[], total = items.length): Page<T> => ({
  page: 1,
  pageSize: 10,
  total,
  items,
})

describe('useContactsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normaliza la página: cada contacto una vez en byId y el orden en ids', async () => {
    vi.mocked(contactsApi.list).mockResolvedValue(page([contact(2, 'Ana'), contact(1, 'Beto')], 12))
    const store = useContactsStore()

    await store.fetchPage({ page: 1 })

    expect(store.ids).toEqual([2, 1])
    expect(Object.keys(store.byId)).toEqual(['1', '2'])
    expect(store.items.map((c) => c.fullName)).toEqual(['Ana', 'Beto'])
    expect(store.total).toBe(12)
    expect(store.totalPages).toBe(2)
    expect(store.status).toBe('success')
  })

  it('al buscar guarda el parecido aparte y no lo mezcla con el contacto', async () => {
    vi.mocked(contactsApi.search).mockResolvedValue(
      page([{ ...contact(5, 'José Pérez'), score: 0.82 }]),
    )
    const store = useContactsStore()

    await store.fetchPage({ q: '  jose peres ', page: 1 })

    expect(contactsApi.search).toHaveBeenCalledWith('jose peres', { page: 1, pageSize: 10 })
    expect(store.isSearching).toBe(true)
    expect(store.scores[5]).toBe(0.82)
    expect(store.byId[5]).not.toHaveProperty('score')
  })

  it('usa la caché si la página es reciente y la vuelve a pedir cuando vence', async () => {
    vi.useFakeTimers()
    vi.mocked(contactsApi.list).mockResolvedValue(page([contact(1, 'Ana')]))
    const store = useContactsStore()

    await store.fetchPage({ page: 1 })
    await store.fetchPage({ page: 1 })
    expect(contactsApi.list).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(CACHE_TTL_MS + 1)
    await store.fetchPage({ page: 1 })
    expect(contactsApi.list).toHaveBeenCalledTimes(2)

    await store.fetchPage({ page: 1 }, { force: true })
    expect(contactsApi.list).toHaveBeenCalledTimes(3)
  })

  it('ignora una respuesta vieja que llega después de una más nueva', async () => {
    let resolveSlow!: (value: Page<Contact & { score: number }>) => void
    vi.mocked(contactsApi.search)
      .mockReturnValueOnce(new Promise((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce(page([{ ...contact(2, 'Ana María'), score: 1 }]))
    const store = useContactsStore()

    const slow = store.fetchPage({ q: 'an', page: 1 })
    await store.fetchPage({ q: 'ana', page: 1 })
    resolveSlow(page([{ ...contact(9, 'Andrés'), score: 0.5 }]))
    await slow

    expect(store.query.q).toBe('ana')
    expect(store.ids).toEqual([2])
  })

  it('expone el error si la carga falla', async () => {
    vi.mocked(contactsApi.list).mockRejectedValue(new ApiError('Sin conexión', 0))
    const store = useContactsStore()

    await store.fetchPage({ page: 1 })

    expect(store.status).toBe('error')
    expect(store.error?.message).toBe('Sin conexión')
  })

  it('crear un contacto invalida la caché', async () => {
    vi.mocked(contactsApi.list).mockResolvedValue(page([contact(1, 'Ana')]))
    vi.mocked(contactsApi.create).mockResolvedValue(contact(2, 'Beto'))
    const store = useContactsStore()
    await store.fetchPage({ page: 1 })

    await store.create({ fullName: 'Beto', email: null, phone: null, company: null, notes: null })
    await store.fetchPage({ page: 1 })

    expect(store.byId[2]?.fullName).toBe('Beto')
    expect(contactsApi.list).toHaveBeenCalledTimes(2)
  })

  it('ante un 409 lanza ContactConflictError con la versión vigente y la refleja en la lista', async () => {
    const current = { ...contact(1, 'Ana Gómez', 3), email: 'ana@nuevo.com' }
    vi.mocked(contactsApi.list).mockResolvedValue(page([contact(1, 'Ana', 2)]))
    vi.mocked(contactsApi.update).mockRejectedValue(
      new ApiError('El contacto fue modificado por otra sesión', 409, { current }),
    )
    const store = useContactsStore()
    await store.fetchPage({ page: 1 })

    const error = await store
      .update(1, { fullName: 'Ana P.', email: null, phone: null, company: null, notes: null }, 2)
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ContactConflictError)
    expect((error as ContactConflictError).current).toEqual(current)
    expect(store.byId[1]).toEqual(current)
  })

  it('borra de forma optimista y revierte si el servidor falla', async () => {
    let rejectRemove!: (reason: unknown) => void
    vi.mocked(contactsApi.list).mockResolvedValue(page([contact(1, 'Ana'), contact(2, 'Beto')]))
    vi.mocked(contactsApi.remove).mockReturnValue(
      new Promise((_, reject) => (rejectRemove = reject)),
    )
    const store = useContactsStore()
    await store.fetchPage({ page: 1 })

    const removal = store.remove(1)
    expect(store.ids).toEqual([2])
    expect(store.total).toBe(1)

    rejectRemove(new ApiError('Sin conexión', 0))
    await expect(removal).rejects.toBeInstanceOf(ApiError)
    expect(store.ids).toEqual([1, 2])
    expect(store.total).toBe(2)
  })

  it('recuerda el tamaño de página elegido (persistencia selectiva)', async () => {
    vi.mocked(contactsApi.list).mockResolvedValue(page([]))
    const store = useContactsStore()

    await store.setPageSize(50)

    expect(localStorage.getItem('contactos:pageSize')).toBe('50')
    expect(contactsApi.list).toHaveBeenLastCalledWith({ page: 1, pageSize: 50 })

    setActivePinia(createPinia())
    expect(useContactsStore().pageSize).toBe(50)
  })

  it('no guarda contactos en el navegador', async () => {
    vi.mocked(contactsApi.list).mockResolvedValue(page([contact(1, 'Ana')]))

    await useContactsStore().fetchPage({ page: 1 })

    expect(Object.keys(localStorage)).not.toContain(expect.stringContaining('contact'))
    expect(JSON.stringify({ ...localStorage })).not.toContain('Ana')
  })
})
