import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { contactsApi } from '@/api/contacts'
import { ApiError } from '@/api/errors'
import type { Contact } from '@/types/api'
import ContactsView from '../ContactsView.vue'

type ContactsApi = (typeof import('@/api/contacts'))['contactsApi']

vi.mock('@/api/contacts', () => ({
  contactsApi: {
    list: vi.fn<ContactsApi['list']>(),
    search: vi.fn<ContactsApi['search']>(),
    remove: vi.fn<ContactsApi['remove']>(),
    findSimilar: vi.fn<ContactsApi['findSimilar']>(),
  },
}))

const contact = (id: number, fullName: string, extra: Partial<Contact> = {}): Contact => ({
  id,
  ownerId: 1,
  fullName,
  email: null,
  phone: null,
  company: null,
  notes: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
})

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/contactos', name: 'contacts', component: ContactsView }],
  })
  await router.push(path)
  const wrapper = mount(ContactsView, {
    global: { plugins: [router], stubs: { teleport: true } },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('ContactsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('muestra los contactos con sus datos y la paginación', async () => {
    vi.mocked(contactsApi.list).mockResolvedValue({
      page: 1,
      pageSize: 10,
      total: 25,
      items: [
        contact(1, 'Ana Gómez', { email: 'ana@gmail.com', company: 'Emcali' }),
        contact(2, 'Beto Ruiz'),
      ],
    })
    const { wrapper } = await mountAt('/contactos')

    expect(wrapper.text()).toContain('25 contactos en tu directorio')
    expect(wrapper.text()).toContain('Ana Gómez')
    expect(wrapper.text()).toContain('ana@gmail.com')
    expect(wrapper.text()).toContain('Mostrando 1–10 de 25')
    expect(wrapper.find('button[aria-label="Editar a Ana Gómez"]').exists()).toBe(true)
  })

  it('al escribir en el buscador actualiza la URL y busca con tolerancia a errores', async () => {
    vi.useFakeTimers()
    vi.mocked(contactsApi.list).mockResolvedValue({ page: 1, pageSize: 10, total: 0, items: [] })
    vi.mocked(contactsApi.search).mockResolvedValue({
      page: 1,
      pageSize: 10,
      total: 1,
      items: [{ ...contact(5, 'José Pérez'), score: 0.82 }],
    })
    const { wrapper, router } = await mountAt('/contactos')

    await wrapper.find('input[type="search"]').setValue('jose peres')
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()

    expect(router.currentRoute.value.query.q).toBe('jose peres')
    expect(contactsApi.search).toHaveBeenCalledWith('jose peres', { page: 1, pageSize: 10 })
    expect(wrapper.text()).toContain('José Pérez')
    expect(wrapper.text()).toContain('82%')
  })

  it('invita a crear el primer contacto cuando el directorio está vacío', async () => {
    vi.mocked(contactsApi.list).mockResolvedValue({ page: 1, pageSize: 10, total: 0, items: [] })
    const { wrapper } = await mountAt('/contactos')

    expect(wrapper.text()).toContain('Aún no tienes contactos')
  })

  it('si falla la carga muestra el error con opción de reintentar', async () => {
    vi.mocked(contactsApi.list)
      .mockRejectedValueOnce(new ApiError('No se pudo conectar con el servidor.', 0))
      .mockResolvedValueOnce({ page: 1, pageSize: 10, total: 1, items: [contact(1, 'Ana Gómez')] })
    const { wrapper } = await mountAt('/contactos')

    expect(wrapper.get('[role="alert"]').text()).toContain('No se pudo conectar')

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Reintentar'))!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Ana Gómez')
  })
})
