<script setup lang="ts">
import { computed, useId } from 'vue'

const model = defineModel<string>({ required: true })

const props = withDefaults(
  defineProps<{
    label: string
    type?: 'text' | 'email' | 'password' | 'tel' | 'search'
    /** Mensaje de error del campo; también marca el campo como inválido para lectores de pantalla. */
    error?: string
    hint?: string
    autocomplete?: string
    required?: boolean
  }>(),
  { type: 'text', error: undefined, hint: undefined, autocomplete: undefined, required: false },
)

const id = useId()
const describedBy = computed(() =>
  props.error ? `${id}-error` : props.hint ? `${id}-hint` : undefined,
)
</script>

<template>
  <div class="space-y-1.5">
    <label :for="id" class="block text-sm font-medium text-slate-700">
      {{ label }}
      <span v-if="required" class="text-red-600" aria-hidden="true">*</span>
    </label>
    <input
      :id="id"
      v-model="model"
      :type="type"
      :autocomplete="autocomplete"
      :required="required"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
      class="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:outline-none"
      :class="error ? 'ring-red-400 focus:ring-red-500' : 'ring-slate-300 focus:ring-brand-600'"
    />
    <p v-if="error" :id="`${id}-error`" class="text-sm text-red-600">{{ error }}</p>
    <p v-else-if="hint" :id="`${id}-hint`" class="text-sm text-slate-500">{{ hint }}</p>
  </div>
</template>
