<script setup lang="ts">
import { computed } from 'vue'
import { normalizeName } from '@/utils/match'

const props = withDefaults(defineProps<{ name: string; size?: 'sm' | 'md' }>(), { size: 'md' })

const COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
]

// Iniciales del nombre y un color estable para cada nombre. El color sale del nombre normalizado:
// "José Pérez" y "JOSE PEREZ" se ven del mismo color, lo que ayuda a notar los duplicados.
const initials = computed(() => {
  const words = props.name.trim().split(/\s+/).filter(Boolean)
  const last = words.length > 1 ? words[words.length - 1] : undefined
  return ((words[0]?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase()
})
const color = computed(() => {
  const hash = [...normalizeName(props.name)].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return COLORS[hash % COLORS.length]
})
</script>

<template>
  <span
    class="grid shrink-0 place-items-center rounded-full font-semibold"
    :class="[color, size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm']"
    aria-hidden="true"
  >
    {{ initials || '?' }}
  </span>
</template>
