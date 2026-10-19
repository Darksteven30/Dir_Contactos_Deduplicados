<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseAlert from '@/components/base/BaseAlert.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import BasePagination from '@/components/base/BasePagination.vue'
import ContactAvatar from '@/components/contacts/ContactAvatar.vue'
import ContactFormModal from '@/components/contacts/ContactFormModal.vue'
import DeleteContactModal from '@/components/contacts/DeleteContactModal.vue'
import { useDebouncedFn } from '@/composables/useDebouncedFn'
import { PAGE_SIZES, useContactsStore } from '@/stores/contacts'
import type { Contact } from '@/types/api'

const SEARCH_DELAY_MS = 300

const store = useContactsStore()
const route = useRoute()
const router = useRouter()

// La búsqueda y la página viven en la URL (?q=&page=): se pueden compartir, recargar y
// navegar con los botones atrás/adelante del navegador.
const routeQuery = computed(() => ({
  q: typeof route.query.q === 'string' ? route.query.q : '',
  page: Math.max(1, Number(route.query.page) || 1),
}))

const search = ref(routeQuery.value.q)
const formOpen = ref(false)
const editing = ref<Contact | null>(null)
const deleteOpen = ref(false)
const deleting = ref<Contact | null>(null)

watch(routeQuery, (query) => void store.fetchPage(query), { immediate: true })

// Si la página pedida ya no existe (p. ej. se borró el último contacto de la última página).
watch(
  () => [store.status, store.totalPages] as const,
  ([status, totalPages]) => {
    if (status === 'success' && routeQuery.value.page > totalPages) goToPage(totalPages)
  },
)

const applySearch = useDebouncedFn((text: string) => {
  void router.replace({ query: text.trim() ? { q: text.trim() } : {} })
}, SEARCH_DELAY_MS)

function goToPage(page: number): void {
  void router.push({ query: { ...route.query, page: page > 1 ? String(page) : undefined } })
}

function clearSearch(): void {
  search.value = ''
  applySearch.cancel()
  void router.replace({ query: {} })
}

function openCreate(): void {
  editing.value = null
  formOpen.value = true
}

function openEdit(contact: Contact): void {
  editing.value = contact
  formOpen.value = true
}

function askDelete(contact: Contact): void {
  deleting.value = contact
  deleteOpen.value = true
}

/** Reintentar tras un error: ignora la caché. */
function refresh(): void {
  void store.fetchPage(routeQuery.value, { force: true })
}

// Tras crear, editar o borrar, el store invalida la caché: volver a pedir la página trae el orden
// y los totales del servidor. Si el usuario solo canceló, la página sale de la caché sin petición.
function reload(): void {
  void store.fetchPage(routeQuery.value)
}

watch(formOpen, (isOpen) => {
  if (!isOpen) reload()
})

function changePageSize(event: Event): void {
  void store.setPageSize(Number((event.target as HTMLSelectElement).value))
  if (routeQuery.value.page !== 1) goToPage(1)
}

const showSkeleton = computed(() => store.isLoading && store.items.length === 0)
const isEmpty = computed(() => store.status === 'success' && store.total === 0)
const percent = (score: number | undefined) => `${Math.round((score ?? 0) * 100)}%`
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Contactos</h1>
        <p class="mt-1 text-sm text-slate-600">
          {{ store.total }} {{ store.total === 1 ? 'contacto' : 'contactos' }}
          {{ store.isSearching ? `para «${store.query.q}»` : 'en tu directorio' }}
        </p>
      </div>
      <BaseButton @click="openCreate"
        ><BaseIcon name="plus" :size="18" /> Nuevo contacto</BaseButton
      >
    </div>

    <div class="relative">
      <BaseIcon
        name="search"
        :size="18"
        class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
      />
      <input
        v-model="search"
        type="search"
        aria-label="Buscar contactos"
        placeholder="Buscar por nombre, email o teléfono… (tolera errores: «jose peres»)"
        class="block w-full rounded-xl border-0 bg-white py-2.5 pr-10 pl-10 text-sm text-slate-900 shadow-sm ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600 focus:outline-none"
        @input="applySearch.run(search)"
      />
      <button
        v-if="search"
        type="button"
        class="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        aria-label="Limpiar búsqueda"
        @click="clearSearch"
      >
        <BaseIcon name="x" :size="18" />
      </button>
    </div>

    <BaseAlert v-if="store.status === 'error' && store.error" variant="error">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span>{{ store.error.message }}</span>
        <BaseButton variant="secondary" @click="refresh">
          <BaseIcon name="refresh" :size="16" /> Reintentar
        </BaseButton>
      </div>
    </BaseAlert>

    <!-- Cargando por primera vez -->
    <div v-if="showSkeleton" class="space-y-3" aria-busy="true" aria-label="Cargando contactos">
      <div
        v-for="n in 5"
        :key="n"
        class="flex animate-pulse items-center gap-4 rounded-xl bg-white p-4 ring-1 ring-slate-200"
      >
        <div class="size-10 rounded-full bg-slate-200" />
        <div class="flex-1 space-y-2">
          <div class="h-3 w-1/3 rounded bg-slate-200" />
          <div class="h-3 w-1/2 rounded bg-slate-100" />
        </div>
      </div>
    </div>

    <!-- Sin resultados -->
    <div
      v-else-if="isEmpty"
      class="rounded-2xl bg-white px-6 py-14 text-center ring-1 ring-slate-200"
    >
      <div class="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600">
        <BaseIcon :name="store.isSearching ? 'search' : 'users'" />
      </div>
      <template v-if="store.isSearching">
        <h2 class="mt-4 font-semibold text-slate-900">No encontramos contactos</h2>
        <p class="mt-1 text-sm text-slate-600">
          Nada se parece a «{{ store.query.q }}». Prueba con otra parte del nombre, el email o el
          teléfono.
        </p>
        <BaseButton variant="secondary" class="mt-5" @click="clearSearch">Ver todos</BaseButton>
      </template>
      <template v-else>
        <h2 class="mt-4 font-semibold text-slate-900">Aún no tienes contactos</h2>
        <p class="mt-1 text-sm text-slate-600">Agrega el primero para empezar tu directorio.</p>
        <BaseButton class="mt-5" @click="openCreate">
          <BaseIcon name="plus" :size="18" /> Nuevo contacto
        </BaseButton>
      </template>
    </div>

    <!-- Lista -->
    <div
      v-else-if="store.items.length > 0"
      class="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 transition-opacity"
      :class="{ 'opacity-60': store.isLoading }"
      :aria-busy="store.isLoading"
    >
      <ul class="divide-y divide-slate-100">
        <li
          v-for="contact in store.items"
          :key="contact.id"
          class="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 sm:px-6"
        >
          <ContactAvatar :name="contact.fullName" />
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 truncate font-medium text-slate-900">
              {{ contact.fullName }}
              <span
                v-if="store.isSearching"
                class="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700"
                :title="'Parecido con la búsqueda'"
              >
                {{ percent(store.scores[contact.id]) }}
              </span>
            </p>
            <div class="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-500">
              <span v-if="contact.email" class="flex min-w-0 items-center gap-1.5">
                <BaseIcon name="mail" :size="14" />
                <span class="truncate">{{ contact.email }}</span>
              </span>
              <span v-if="contact.phone" class="flex items-center gap-1.5">
                <BaseIcon name="phone" :size="14" /> {{ contact.phone }}
              </span>
              <span v-if="contact.company" class="flex items-center gap-1.5">
                <BaseIcon name="building" :size="14" /> {{ contact.company }}
              </span>
            </div>
          </div>
          <div class="flex shrink-0 gap-1">
            <button
              type="button"
              class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-brand-700"
              :aria-label="`Editar a ${contact.fullName}`"
              @click="openEdit(contact)"
            >
              <BaseIcon name="pencil" :size="18" />
            </button>
            <button
              type="button"
              class="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
              :aria-label="`Eliminar a ${contact.fullName}`"
              @click="askDelete(contact)"
            >
              <BaseIcon name="trash" :size="18" />
            </button>
          </div>
        </li>
      </ul>
    </div>

    <div v-if="store.total > 0" class="flex flex-wrap items-center justify-between gap-4">
      <BasePagination
        class="flex-1"
        :page="store.query.page"
        :total-pages="store.totalPages"
        :total="store.total"
        :page-size="store.pageSize"
        @update:page="goToPage"
      />
      <label class="flex items-center gap-2 text-sm text-slate-600">
        Por página
        <select
          :value="store.pageSize"
          class="rounded-lg border-0 bg-white py-1.5 pr-8 pl-3 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600"
          @change="changePageSize"
        >
          <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>
    </div>

    <ContactFormModal v-model:open="formOpen" :contact="editing" @edit-existing="openEdit" />
    <DeleteContactModal v-model:open="deleteOpen" :contact="deleting" @deleted="reload" />
  </div>
</template>
