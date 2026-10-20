<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import ContactAvatar from '@/components/contacts/ContactAvatar.vue'
import type { DuplicateGroup } from '@/types/api'
import { describeMatch, percent } from '@/utils/match'

const props = defineProps<{ group: DuplicateGroup; busy?: boolean }>()
const emit = defineEmits<{
  merge: [group: DuplicateGroup]
  dismiss: [group: DuplicateGroup]
  exclude: [group: DuplicateGroup, contactId: number]
}>()

const nameOf = (id: number) => props.group.contacts.find((c) => c.id === id)?.fullName ?? `#${id}`

// Con dos contactos, "no es la misma persona" equivale a descartar el grupo entero.
const canExcludeSingle = computed(() => props.group.contacts.length > 2)

const confidence = computed(() => {
  if (props.group.score >= 0.95) return { label: 'Muy probable', classes: 'bg-red-50 text-red-700' }
  if (props.group.score >= 0.85) return { label: 'Probable', classes: 'bg-amber-50 text-amber-700' }
  return { label: 'Posible', classes: 'bg-slate-100 text-slate-700' }
})
</script>

<template>
  <article class="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
    <header
      class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"
    >
      <div class="flex items-center gap-3">
        <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="confidence.classes">
          {{ confidence.label }} · {{ percent(group.score) }}
        </span>
        <span class="text-sm text-slate-600">{{ group.contacts.length }} contactos</span>
      </div>
      <div class="flex gap-2">
        <BaseButton variant="secondary" :disabled="busy" @click="emit('dismiss', group)">
          No son duplicados
        </BaseButton>
        <BaseButton :disabled="busy" @click="emit('merge', group)">
          <BaseIcon name="merge" :size="18" /> Fusionar
        </BaseButton>
      </div>
    </header>

    <!-- Los contactos lado a lado para compararlos -->
    <!-- auto-fit: las columnas se reparten según cuántos contactos haya (2 → mitades, 3 → tercios),
         así no quedan celdas vacías. -->
    <ul class="grid gap-px bg-slate-100 sm:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
      <li
        v-for="contact in group.contacts"
        :key="contact.id"
        class="flex flex-col gap-3 bg-white p-5"
      >
        <div class="flex items-start gap-3">
          <ContactAvatar :name="contact.fullName" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-slate-900">{{ contact.fullName }}</p>
            <!-- La línea existe en todas las columnas para que los campos queden alineados. -->
            <p class="mt-0.5 flex h-4 items-center gap-1 text-xs font-semibold text-brand-700">
              <template v-if="contact.id === group.suggestedPrimaryId">
                <BaseIcon name="star" :size="12" /> Principal sugerido
              </template>
            </p>
          </div>
        </div>
        <dl class="space-y-1.5 text-sm">
          <div
            class="flex items-center gap-2"
            :class="contact.email ? 'text-slate-700' : 'text-slate-400'"
          >
            <BaseIcon name="mail" :size="14" />
            <dt class="sr-only">Email</dt>
            <dd class="truncate">{{ contact.email ?? 'Sin email' }}</dd>
          </div>
          <div
            class="flex items-center gap-2"
            :class="contact.phone ? 'text-slate-700' : 'text-slate-400'"
          >
            <BaseIcon name="phone" :size="14" />
            <dt class="sr-only">Teléfono</dt>
            <dd>{{ contact.phone ?? 'Sin teléfono' }}</dd>
          </div>
          <div
            class="flex items-center gap-2"
            :class="contact.company ? 'text-slate-700' : 'text-slate-400'"
          >
            <BaseIcon name="building" :size="14" />
            <dt class="sr-only">Empresa</dt>
            <dd class="truncate">{{ contact.company ?? 'Sin empresa' }}</dd>
          </div>
        </dl>
        <p v-if="contact.notes" class="line-clamp-2 text-xs text-slate-500">{{ contact.notes }}</p>
        <button
          v-if="canExcludeSingle"
          type="button"
          class="mt-auto inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
          :disabled="busy"
          @click="emit('exclude', group, contact.id)"
        >
          <BaseIcon name="userX" :size="14" /> No es la misma persona
        </button>
      </li>
    </ul>

    <!-- Por qué se agruparon -->
    <footer class="border-t border-slate-100 bg-slate-50 px-5 py-3">
      <p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Por qué se parecen</p>
      <ul class="mt-2 space-y-1 text-sm text-slate-600">
        <li v-for="pair in group.pairs" :key="pair.contactIds.join('-')">
          <span class="font-medium text-slate-800">{{ nameOf(pair.contactIds[0]) }}</span>
          y
          <span class="font-medium text-slate-800">{{ nameOf(pair.contactIds[1]) }}</span
          >:
          {{ describeMatch(pair).join(' · ') || 'datos parecidos' }}
          <span class="text-slate-400">({{ percent(pair.score) }})</span>
        </li>
      </ul>
    </footer>
  </article>
</template>
