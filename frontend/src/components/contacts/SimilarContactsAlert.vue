<script setup lang="ts">
import BaseIcon from '@/components/base/BaseIcon.vue'
import type { Contact, ContactMatch, SimilarContact } from '@/types/api'
import ContactAvatar from './ContactAvatar.vue'

defineProps<{ similar: SimilarContact[] }>()
const emit = defineEmits<{ 'edit-existing': [contact: Contact] }>()

const MAX_SHOWN = 3

function reasons(match: ContactMatch): string {
  const parts: string[] = []
  if (match.emailMatch) parts.push('mismo email')
  if (match.phoneMatch) parts.push('mismo teléfono')
  if (match.nameSimilarity >= 0.8) parts.push('nombre parecido')
  return parts.join(' · ')
}
</script>

<template>
  <div class="rounded-lg bg-amber-50 p-4 ring-1 ring-inset ring-amber-200" role="status">
    <p class="flex items-center gap-2 text-sm font-semibold text-amber-800">
      <BaseIcon name="alert" :size="18" />
      {{
        similar.length === 1 ? 'Ya existe un contacto parecido' : 'Ya existen contactos parecidos'
      }}
    </p>
    <ul class="mt-3 space-y-2">
      <li
        v-for="{ contact, match } in similar.slice(0, MAX_SHOWN)"
        :key="contact.id"
        class="flex items-center gap-3 rounded-lg bg-white p-2 ring-1 ring-amber-100"
      >
        <ContactAvatar :name="contact.fullName" size="sm" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-slate-900">{{ contact.fullName }}</p>
          <p class="truncate text-xs text-slate-500">
            {{ Math.round(match.score * 100) }}% parecido · {{ reasons(match) }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
          @click="emit('edit-existing', contact)"
        >
          Editar ese
        </button>
      </li>
    </ul>
    <p class="mt-3 text-xs text-amber-800">
      Si es la misma persona, edita el contacto existente. Si no, puedes guardarlo igual.
    </p>
  </div>
</template>
