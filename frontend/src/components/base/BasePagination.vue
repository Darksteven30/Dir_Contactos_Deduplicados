<script setup lang="ts">
import { computed } from 'vue'
import BaseIcon from './BaseIcon.vue'

const props = defineProps<{ page: number; totalPages: number; total: number; pageSize: number }>()
const emit = defineEmits<{ 'update:page': [page: number] }>()

const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const to = computed(() => Math.min(props.page * props.pageSize, props.total))

const buttonClass =
  'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <nav class="flex flex-wrap items-center justify-between gap-3" aria-label="Paginación">
    <p class="text-sm text-slate-600">
      Mostrando <span class="font-medium text-slate-900">{{ from }}–{{ to }}</span> de
      <span class="font-medium text-slate-900">{{ total }}</span>
    </p>
    <div class="flex items-center gap-2">
      <button
        type="button"
        :class="buttonClass"
        :disabled="page <= 1"
        @click="emit('update:page', page - 1)"
      >
        <BaseIcon name="chevronLeft" :size="16" /> Anterior
      </button>
      <span class="text-sm text-slate-600" aria-current="page">{{ page }} / {{ totalPages }}</span>
      <button
        type="button"
        :class="buttonClass"
        :disabled="page >= totalPages"
        @click="emit('update:page', page + 1)"
      >
        Siguiente <BaseIcon name="chevronRight" :size="16" />
      </button>
    </div>
  </nav>
</template>
