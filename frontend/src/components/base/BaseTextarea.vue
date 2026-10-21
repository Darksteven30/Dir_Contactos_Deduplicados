<script setup lang="ts">
import { useId } from 'vue'

const model = defineModel<string>({ required: true })

withDefaults(defineProps<{ label: string; error?: string; rows?: number; maxlength?: number }>(), {
  error: undefined,
  rows: 3,
  maxlength: undefined,
})

const id = useId()
</script>

<template>
  <div class="space-y-1.5">
    <label :for="id" class="block text-sm font-medium text-slate-700">{{ label }}</label>
    <textarea
      :id="id"
      v-model="model"
      :rows="rows"
      :maxlength="maxlength"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error ? `${id}-error` : undefined"
      class="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset focus:ring-2 focus:ring-inset focus:outline-none"
      :class="error ? 'ring-red-400 focus:ring-red-500' : 'ring-slate-300 focus:ring-brand-600'"
    />
    <p v-if="error" :id="`${id}-error`" class="text-sm text-red-600">{{ error }}</p>
  </div>
</template>
