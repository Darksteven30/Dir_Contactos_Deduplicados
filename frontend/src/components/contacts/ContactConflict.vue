<script setup lang="ts">
import { computed } from 'vue'
import BaseAlert from '@/components/base/BaseAlert.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import type { Contact, ContactInput } from '@/types/api'
import { FIELD_LABELS, type ContactField } from './contactForm'

const props = defineProps<{
  /** Lo que el usuario intentó guardar. */
  mine: ContactInput
  /** La versión que otra sesión guardó antes. */
  current: Contact
  pending?: boolean
}>()

const emit = defineEmits<{ 'use-current': []; overwrite: [] }>()

const FIELDS: ContactField[] = ['fullName', 'email', 'phone', 'company', 'notes']

// Solo se muestran los campos que de verdad difieren: es lo que el usuario debe decidir.
const differences = computed(() =>
  FIELDS.filter((field) => (props.mine[field] ?? '') !== (props.current[field] ?? '')).map(
    (field) => ({
      field,
      label: FIELD_LABELS[field],
      mine: props.mine[field] ?? '—',
      current: props.current[field] ?? '—',
    }),
  ),
)

const updatedAt = computed(() =>
  new Date(props.current.updatedAt).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }),
)
</script>

<template>
  <div class="space-y-4">
    <BaseAlert variant="warning" title="Este contacto cambió mientras lo editabas">
      Otra sesión lo guardó el {{ updatedAt }}. Revisa las diferencias y elige qué versión
      conservar.
    </BaseAlert>

    <div class="overflow-x-auto rounded-lg ring-1 ring-slate-200">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          <tr>
            <th scope="col" class="px-3 py-2">Campo</th>
            <th scope="col" class="px-3 py-2">Tu versión</th>
            <th scope="col" class="px-3 py-2">Versión actual</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="row in differences" :key="row.field">
            <th scope="row" class="px-3 py-2 font-medium text-slate-700">{{ row.label }}</th>
            <td class="px-3 py-2 break-words text-brand-700">{{ row.mine }}</td>
            <td class="px-3 py-2 break-words text-slate-900">{{ row.current }}</td>
          </tr>
          <tr v-if="differences.length === 0">
            <td colspan="3" class="px-3 py-3 text-slate-600">
              Los datos coinciden; solo cambió la versión. Puedes guardar sin perder nada.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <BaseButton variant="secondary" :disabled="pending" @click="emit('use-current')">
        Usar la versión actual
      </BaseButton>
      <BaseButton :loading="pending" @click="emit('overwrite')">Guardar mis cambios</BaseButton>
    </div>
  </div>
</template>
