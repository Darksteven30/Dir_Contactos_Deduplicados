import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { duplicatesApi } from '@/api/duplicates'
import type { Contact, ContactMerge, DuplicateGroup } from '@/types/api'
import { describeMatch } from '@/utils/match'
import DuplicatesView from '../DuplicatesView.vue'
import MergeHistoryView from '../MergeHistoryView.vue'

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

const DIANA: DuplicateGroup = {
  score: 0.952,
  suggestedPrimaryId: 2,
  mergePreview: {
    fullName: 'Diana Carolina Torres',
    email: null,
    phone: '+57 311 555 7890',
    company: 'Carvajal',
    notes: null,
  },
  contacts: [
    contact(1, 'Diana Torres', { phone: '(311) 555-7890' }),
    contact(2, 'Diana Carolina Torres', { phone: '+57 311 555 7890', company: 'Carvajal' }),
  ],
  pairs: [
    { contactIds: [1, 2], score: 0.952, nameSimilarity: 0.933, emailMatch: null, phoneMatch: true },
  ],
}

async function mountView(component: typeof DuplicatesView, path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/contactos', name: 'contacts', component: { template: '<p />' } },
      { path: '/duplicados', name: 'duplicates', component: DuplicatesView },
      { path: '/duplicados/historial', name: 'merge-history', component: MergeHistoryView },
    ],
  })
  await router.push(path)
  const wrapper = mount(component, { global: { plugins: [router], stubs: { teleport: true } } })
  await flushPromises()
  return wrapper
}

describe('describeMatch', () => {
  it('dice "mismo nombre" solo cuando coinciden exactamente', () => {
    const base = { score: 1, emailMatch: null, phoneMatch: null }
    expect(describeMatch({ ...base, nameSimilarity: 1 })).toEqual(['mismo nombre'])
    expect(describeMatch({ ...base, nameSimilarity: 0.93, phoneMatch: true })).toEqual([
      'nombre 93% parecido',
      'mismo teléfono',
    ])
  })
})

describe('DuplicatesView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('muestra cada grupo lado a lado con el principal sugerido y el porqué', async () => {
    vi.mocked(duplicatesApi.groups).mockResolvedValue([DIANA])
    const wrapper = await mountView(DuplicatesView, '/duplicados')

    expect(wrapper.text()).toContain('1 grupo por revisar · podrías quitar 1 contacto repetido')
    expect(wrapper.text()).toContain('Muy probable · 95%')
    expect(wrapper.text()).toContain('Principal sugerido')
    expect(wrapper.text()).toContain('nombre 93% parecido · mismo teléfono')
  })

  it('"no son duplicados" descarta el par y quita el grupo', async () => {
    vi.mocked(duplicatesApi.groups).mockResolvedValue([DIANA])
    vi.mocked(duplicatesApi.dismissPair).mockResolvedValue()
    const wrapper = await mountView(DuplicatesView, '/duplicados')

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'No son duplicados')!
      .trigger('click')
    await flushPromises()

    expect(duplicatesApi.dismissPair).toHaveBeenCalledWith([1, 2])
    expect(wrapper.text()).toContain('Tu directorio está limpio')
  })

  it('cambiar la sensibilidad vuelve a buscar', async () => {
    vi.mocked(duplicatesApi.groups).mockResolvedValue([])
    const wrapper = await mountView(DuplicatesView, '/duplicados')

    await wrapper
      .find('[role="radio"][title="Incluye nombres con más diferencias"]')
      .trigger('click')
    await flushPromises()

    expect(duplicatesApi.groups).toHaveBeenLastCalledWith(0.7)
  })
})

describe('MergeHistoryView', () => {
  const MERGE: ContactMerge = {
    id: 9,
    primaryContactId: 2,
    mergedContactIds: [1],
    before: [
      { id: 1, fullName: 'Diana Torres', email: null, phone: null, company: null, notes: null },
      {
        id: 2,
        fullName: 'Diana Carolina Torres',
        email: null,
        phone: null,
        company: null,
        notes: null,
      },
    ],
    createdAt: '2026-10-20T15:00:00Z',
    undoneAt: null,
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('lista las fusiones y permite deshacerlas', async () => {
    vi.mocked(duplicatesApi.history)
      .mockResolvedValueOnce({ page: 1, pageSize: 10, total: 1, items: [MERGE] })
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 10,
        total: 1,
        items: [{ ...MERGE, undoneAt: '2026-10-20T16:00:00Z' }],
      })
    vi.mocked(duplicatesApi.undo).mockResolvedValue([])
    const wrapper = await mountView(MergeHistoryView, '/duplicados/historial')

    expect(wrapper.text()).toContain('2 contactos fusionados en Diana Carolina Torres')

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Deshacer'))!
      .trigger('click')
    await flushPromises()

    expect(duplicatesApi.undo).toHaveBeenCalledWith(9)
    expect(wrapper.text()).toContain('Deshecha')
  })
})
