import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contactsApi } from '@/api/contacts'
import { ApiError } from '@/api/errors'
import type { Contact } from '@/types/api'
import ContactFormModal from '../ContactFormModal.vue'

type ContactsApi = (typeof import('@/api/contacts'))['contactsApi']

vi.mock('@/api/contacts', () => ({
  contactsApi: {
    create: vi.fn<ContactsApi['create']>(),
    update: vi.fn<ContactsApi['update']>(),
    findSimilar: vi.fn<ContactsApi['findSimilar']>(),
  },
}))

const ANA: Contact = {
  id: 1,
  ownerId: 1,
  fullName: 'Ana Gómez',
  email: 'ana@gmail.com',
  phone: null,
  company: null,
  notes: null,
  version: 2,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

// El modal se abre después de montar, como en la app (así corre la inicialización del formulario).
async function mountModal(contact: Contact | null) {
  const wrapper = mount(ContactFormModal, {
    props: { open: false, contact, 'onUpdate:open': (open: boolean) => wrapper.setProps({ open }) },
    global: { stubs: { teleport: true } },
  })
  await wrapper.setProps({ open: true })
  return wrapper
}

const input = (wrapper: Awaited<ReturnType<typeof mountModal>>, label: string) =>
  wrapper
    .findAll('label')
    .find((l) => l.text().startsWith(label))!
    .element.getAttribute('for')

async function type(wrapper: Awaited<ReturnType<typeof mountModal>>, label: string, value: string) {
  await wrapper.find(`#${CSS.escape(input(wrapper, label)!)}`).setValue(value)
}

describe('ContactFormModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('valida en el cliente antes de llamar al servidor', async () => {
    const wrapper = await mountModal(null)

    await type(wrapper, 'Email', 'no-es-email')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('El nombre es requerido')
    expect(wrapper.text()).toContain('Email inválido')
    expect(contactsApi.create).not.toHaveBeenCalled()
  })

  it('crea el contacto enviando los vacíos como null y cierra', async () => {
    vi.mocked(contactsApi.create).mockResolvedValue({ ...ANA, id: 7 })
    const wrapper = await mountModal(null)

    await type(wrapper, 'Nombre completo', '  Ana Gómez ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(contactsApi.create).toHaveBeenCalledWith({
      fullName: 'Ana Gómez',
      email: null,
      phone: null,
      company: null,
      notes: null,
    })
    expect(wrapper.props('open')).toBe(false)
  })

  it('al escribir avisa si ya existe un contacto parecido', async () => {
    vi.useFakeTimers()
    vi.mocked(contactsApi.findSimilar).mockResolvedValue([
      {
        contact: ANA,
        match: { score: 0.93, nameSimilarity: 0.95, emailMatch: null, phoneMatch: null },
      },
    ])
    const wrapper = await mountModal(null)

    await type(wrapper, 'Nombre completo', 'Ana Gomez')
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()

    expect(contactsApi.findSimilar).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Ya existe un contacto parecido')
    expect(wrapper.text()).toContain('93% parecido')
  })

  it('ante un conflicto 409 muestra las diferencias y permite guardar sobre la versión vigente', async () => {
    const current = { ...ANA, email: 'ana@empresa.com', version: 3 }
    vi.mocked(contactsApi.update)
      .mockRejectedValueOnce(new ApiError('Modificado por otra sesión', 409, { current }))
      .mockResolvedValueOnce({ ...current, fullName: 'Ana G.', version: 4 })
    const wrapper = await mountModal(ANA)

    await type(wrapper, 'Nombre completo', 'Ana G.')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Este contacto cambió mientras lo editabas')
    const rows = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(rows).toEqual([
      expect.stringContaining('Ana G.'),
      expect.stringMatching(/ana@gmail\.com.*ana@empresa\.com/),
    ])

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Guardar mis cambios')!
      .trigger('click')
    await flushPromises()

    expect(contactsApi.update).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ fullName: 'Ana G.' }),
      3,
    )
    expect(wrapper.props('open')).toBe(false)
  })

  it('en un conflicto también se puede quedar con la versión vigente', async () => {
    const current = { ...ANA, email: 'ana@empresa.com', version: 3 }
    vi.mocked(contactsApi.update).mockRejectedValueOnce(
      new ApiError('Modificado por otra sesión', 409, { current }),
    )
    const wrapper = await mountModal(ANA)

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Usar la versión actual')!
      .trigger('click')

    const email = wrapper.find(`#${CSS.escape(input(wrapper, 'Email')!)}`)
      .element as HTMLInputElement
    expect(email.value).toBe('ana@empresa.com')
    expect(wrapper.props('open')).toBe(true)
  })
})
