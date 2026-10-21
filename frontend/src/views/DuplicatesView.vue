<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { toApiError } from '@/api/errors'
import BaseAlert from '@/components/base/BaseAlert.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import DuplicateGroupCard from '@/components/duplicates/DuplicateGroupCard.vue'
import DuplicatesTabs from '@/components/duplicates/DuplicatesTabs.vue'
import MergeDialog from '@/components/duplicates/MergeDialog.vue'
import { SENSITIVITY_LEVELS, useDuplicatesStore } from '@/stores/duplicates'
import { useToastStore } from '@/stores/toasts'
import type { DuplicateGroup } from '@/types/api'

const store = useDuplicatesStore()
const toasts = useToastStore()

const merging = ref<DuplicateGroup | null>(null)
const mergeOpen = ref(false)
/** Grupo con una acción en curso (descartar / excluir), para desactivar sus botones. */
const busyKey = ref<string | null>(null)

const keyOf = (group: DuplicateGroup) => group.contacts.map((c) => c.id).join('-')

// Los grupos dependen de todos los contactos: se recalculan cada vez que se entra a la pantalla.
onMounted(() => void store.fetchGroups())

const showSkeleton = computed(() => store.isLoading && store.groups.length === 0)
const isClean = computed(() => store.status === 'success' && store.groups.length === 0)

function openMerge(group: DuplicateGroup): void {
  merging.value = group
  mergeOpen.value = true
}

async function runOnGroup(group: DuplicateGroup, action: () => Promise<void>, success: string) {
  busyKey.value = keyOf(group)
  try {
    await action()
    toasts.show(success)
  } catch (err) {
    toasts.show(toApiError(err).message, 'error')
  } finally {
    busyKey.value = null
  }
}

function dismiss(group: DuplicateGroup): void {
  void runOnGroup(group, () => store.dismissGroup(group), 'Listo: no se volverán a sugerir juntos')
}

function exclude(group: DuplicateGroup, contactId: number): void {
  const name = group.contacts.find((c) => c.id === contactId)?.fullName ?? 'El contacto'
  void runOnGroup(group, () => store.excludeContact(group, contactId), `${name} salió del grupo`)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Duplicados</h1>
        <p class="mt-1 text-sm text-slate-600">
          <template v-if="store.groups.length > 0">
            {{ store.groups.length }} {{ store.groups.length === 1 ? 'grupo' : 'grupos' }} por
            revisar · podrías quitar {{ store.redundantCount }}
            {{ store.redundantCount === 1 ? 'contacto repetido' : 'contactos repetidos' }}
          </template>
          <template v-else>Contactos que probablemente son la misma persona.</template>
        </p>
      </div>

      <div
        class="flex items-center gap-2 text-sm text-slate-600"
        role="radiogroup"
        aria-label="Sensibilidad"
      >
        <span>Sensibilidad</span>
        <div class="flex rounded-lg bg-slate-100 p-0.5">
          <button
            v-for="level in SENSITIVITY_LEVELS"
            :key="level.value"
            type="button"
            role="radio"
            :aria-checked="store.minScore === level.value"
            :title="level.hint"
            class="rounded-md px-3 py-1 text-sm font-medium transition-colors"
            :class="
              store.minScore === level.value
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            "
            @click="store.setMinScore(level.value)"
          >
            {{ level.label }}
          </button>
        </div>
      </div>
    </div>

    <DuplicatesTabs />

    <BaseAlert v-if="store.status === 'error' && store.error" variant="error">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span>{{ store.error.message }}</span>
        <BaseButton variant="secondary" @click="store.fetchGroups()">
          <BaseIcon name="refresh" :size="16" /> Reintentar
        </BaseButton>
      </div>
    </BaseAlert>

    <div v-if="showSkeleton" class="space-y-4" aria-busy="true" aria-label="Buscando duplicados">
      <div
        v-for="n in 3"
        :key="n"
        class="h-48 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200"
      />
    </div>

    <div
      v-else-if="isClean"
      class="rounded-2xl bg-white px-6 py-14 text-center ring-1 ring-slate-200"
    >
      <div
        class="mx-auto grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"
      >
        <BaseIcon name="check" />
      </div>
      <h2 class="mt-4 font-semibold text-slate-900">Tu directorio está limpio</h2>
      <p class="mt-1 text-sm text-slate-600">
        No encontramos contactos repetidos con la sensibilidad actual.
      </p>
      <RouterLink
        :to="{ name: 'contacts' }"
        class="mt-5 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
      >
        Volver a contactos
      </RouterLink>
    </div>

    <div
      v-else
      class="space-y-5"
      :class="{ 'opacity-60': store.isLoading }"
      :aria-busy="store.isLoading"
    >
      <DuplicateGroupCard
        v-for="group in store.groups"
        :key="keyOf(group)"
        :group="group"
        :busy="busyKey === keyOf(group)"
        @merge="openMerge"
        @dismiss="dismiss"
        @exclude="exclude"
      />
    </div>

    <MergeDialog v-model:open="mergeOpen" :group="merging" />
  </div>
</template>
