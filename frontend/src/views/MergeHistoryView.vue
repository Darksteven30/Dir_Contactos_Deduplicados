<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { toApiError } from '@/api/errors'
import BaseAlert from '@/components/base/BaseAlert.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import BasePagination from '@/components/base/BasePagination.vue'
import ContactAvatar from '@/components/contacts/ContactAvatar.vue'
import DuplicatesTabs from '@/components/duplicates/DuplicatesTabs.vue'
import { useDuplicatesStore } from '@/stores/duplicates'
import { useToastStore } from '@/stores/toasts'
import type { ContactMerge } from '@/types/api'

const store = useDuplicatesStore()
const toasts = useToastStore()
const undoing = ref<number | null>(null)

onMounted(() => void store.fetchHistory(1))

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

const primaryName = (merge: ContactMerge) =>
  merge.before.find((c) => c.id === merge.primaryContactId)?.fullName ?? 'el contacto principal'

async function undo(merge: ContactMerge): Promise<void> {
  undoing.value = merge.id
  try {
    await store.undo(merge.id)
    toasts.show(`Fusión deshecha: los ${merge.before.length} contactos volvieron a tu directorio`)
  } catch (err) {
    toasts.show(toApiError(err).message, 'error', 7000)
  } finally {
    undoing.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight text-slate-900">Duplicados</h1>
      <p class="mt-1 text-sm text-slate-600">
        Cada fusión guarda cómo estaban los contactos, así que se puede deshacer.
      </p>
    </div>

    <DuplicatesTabs />

    <BaseAlert v-if="store.historyStatus === 'error' && store.historyError" variant="error">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span>{{ store.historyError.message }}</span>
        <BaseButton variant="secondary" @click="store.fetchHistory(store.history?.page ?? 1)">
          <BaseIcon name="refresh" :size="16" /> Reintentar
        </BaseButton>
      </div>
    </BaseAlert>

    <div
      v-if="store.historyStatus === 'loading' && !store.history"
      class="space-y-3"
      aria-busy="true"
      aria-label="Cargando historial"
    >
      <div
        v-for="n in 3"
        :key="n"
        class="h-24 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200"
      />
    </div>

    <div
      v-else-if="store.history && store.history.total === 0"
      class="rounded-2xl bg-white px-6 py-14 text-center ring-1 ring-slate-200"
    >
      <div class="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600">
        <BaseIcon name="history" />
      </div>
      <h2 class="mt-4 font-semibold text-slate-900">Aún no has fusionado contactos</h2>
      <p class="mt-1 text-sm text-slate-600">
        Cuando fusiones un grupo de duplicados, aparecerá aquí.
      </p>
    </div>

    <ul v-else-if="store.history" class="space-y-3">
      <li
        v-for="merge in store.history.items"
        :key="merge.id"
        class="rounded-2xl bg-white p-5 ring-1 ring-slate-200"
        :class="{ 'opacity-70': merge.undoneAt }"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="font-medium text-slate-900">
              {{ merge.before.length }} contactos fusionados en {{ primaryName(merge) }}
            </p>
            <p class="mt-0.5 text-sm text-slate-500">
              {{ formatDate(merge.createdAt) }}
              <template v-if="merge.undoneAt">
                · deshecha el {{ formatDate(merge.undoneAt) }}</template
              >
            </p>
          </div>
          <span
            v-if="merge.undoneAt"
            class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
            >Deshecha</span
          >
          <BaseButton
            v-else
            variant="secondary"
            :loading="undoing === merge.id"
            :disabled="undoing !== null"
            @click="undo(merge)"
          >
            <BaseIcon name="history" :size="16" /> Deshacer
          </BaseButton>
        </div>

        <ul class="mt-4 flex flex-wrap gap-2">
          <li
            v-for="contact in merge.before"
            :key="contact.id"
            class="flex items-center gap-2 rounded-full bg-slate-50 py-1 pr-3 pl-1 text-sm ring-1 ring-slate-200"
          >
            <ContactAvatar :name="contact.fullName" size="sm" />
            <span class="text-slate-700">{{ contact.fullName }}</span>
            <BaseIcon
              v-if="contact.id === merge.primaryContactId"
              name="star"
              :size="12"
              class="text-brand-600"
            />
          </li>
        </ul>
      </li>
    </ul>

    <BasePagination
      v-if="store.history && store.history.total > store.history.pageSize"
      :page="store.history.page"
      :total-pages="Math.ceil(store.history.total / store.history.pageSize)"
      :total="store.history.total"
      :page-size="store.history.pageSize"
      @update:page="store.fetchHistory"
    />
  </div>
</template>
