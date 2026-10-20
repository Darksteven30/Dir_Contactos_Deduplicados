import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { duplicatesApi } from '@/api/duplicates'
import { ApiError } from '@/api/errors'
import type { Contact, DuplicateGroup } from '@/types/api'
import MergeDialog from '../MergeDialog.vue'

type DuplicatesApi = (typeof import('@/api/duplicates'))['duplicatesApi']

vi.mock('@/api/duplicates', () => ({
  duplicatesApi: {
    merge: vi.fn<DuplicatesApi['merge']>(),
    groups: vi.fn<DuplicatesApi['groups']>(),
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

const GROUP: DuplicateGroup = {
  score: 0.95,
  suggestedPrimaryId: 1,
  mergePreview: {
    fullName: 'Alejandro Gómez',
    email: 'alejo@outlook.com',
    phone: '318 765 4321',
    company: null,
    notes: 'Otros datos de contactos fusionados: email: alejo@gmail.com',
  },
  contacts: [
    contact(1, 'Alejandro Gómez', { email: 'alejo@outlook.com', phone: '318 765 4321' }),
    contact(2, 'Alejo Gómez', { email: 'alejo@gmail.com', version: 4 }),
  ],
  pairs: [
    { contactIds: [1, 2], score: 0.86, nameSimilarity: 0.7, emailMatch: false, phoneMatch: null },
  ],
}

async function mountDialog() {
  const wrapper = mount(MergeDialog, {
    props: {
      open: false,
      group: GROUP,
      'onUpdate:open': (open: boolean) => wrapper.setProps({ open }),
    },
    global: { stubs: { teleport: true } },
  })
  await wrapper.setProps({ open: true })
  return wrapper
}

const inputValue = (wrapper: Awaited<ReturnType<typeof mountDialog>>, label: string) => {
  const id = wrapper
    .findAll('label')
    .find((l) => l.text().startsWith(label))!
    .attributes('for')!
  return (wrapper.find(`#${CSS.escape(id)}`).element as HTMLInputElement).value
}

describe('MergeDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('arranca con el principal sugerido y la combinación propuesta por el servidor', async () => {
    const wrapper = await mountDialog()

    expect(inputValue(wrapper, 'Nombre completo')).toBe('Alejandro Gómez')
    expect(inputValue(wrapper, 'Email')).toBe('alejo@outlook.com')
    expect(wrapper.text()).toContain('Sugerido: el más completo')
    expect(wrapper.text()).toContain('se eliminarán 1 contacto')
  })

  it('permite elegir otro valor de un campo con un clic', async () => {
    const wrapper = await mountDialog()

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'alejo@gmail.com')!
      .trigger('click')

    expect(inputValue(wrapper, 'Email')).toBe('alejo@gmail.com')
  })

  it('fusiona con el principal y los datos elegidos', async () => {
    vi.mocked(duplicatesApi.merge).mockResolvedValue({
      merge: {
        id: 1,
        primaryContactId: 2,
        mergedContactIds: [1],
        before: [],
        createdAt: '',
        undoneAt: null,
      },
      contact: contact(2, 'Alejo Gómez'),
    })
    const wrapper = await mountDialog()

    await wrapper.findAll('input[type="radio"]')[1]!.trigger('change')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(duplicatesApi.merge).toHaveBeenCalledWith({
      primary: { id: 2, version: 4 },
      duplicates: [{ id: 1, version: 1 }],
      contact: expect.objectContaining({ fullName: 'Alejo Gómez', email: 'alejo@outlook.com' }),
    })
    expect(wrapper.props('open')).toBe(false)
  })

  it('si un contacto cambió mientras tanto, cierra y avisa (el grupo se recarga)', async () => {
    vi.mocked(duplicatesApi.merge).mockRejectedValue(
      new ApiError('Modificado', 409, { current: [] }),
    )
    vi.mocked(duplicatesApi.groups).mockResolvedValue([])
    const wrapper = await mountDialog()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.props('open')).toBe(false)
    expect(duplicatesApi.groups).toHaveBeenCalled()
  })

  it('no fusiona si el nombre queda vacío', async () => {
    const wrapper = await mountDialog()
    const id = wrapper
      .findAll('label')
      .find((l) => l.text().startsWith('Nombre completo'))!
      .attributes('for')!

    await wrapper.find(`#${CSS.escape(id)}`).setValue('   ')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('El nombre es requerido')
    expect(duplicatesApi.merge).not.toHaveBeenCalled()
  })
})
