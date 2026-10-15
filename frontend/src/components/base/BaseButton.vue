<script setup lang="ts">
import { computed } from 'vue'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    type?: 'button' | 'submit'
    /** Muestra un indicador y desactiva el botón mientras una acción está en curso. */
    loading?: boolean
    disabled?: boolean
    /** Ocupa todo el ancho disponible. */
    block?: boolean
  }>(),
  { variant: 'primary', type: 'button', loading: false, disabled: false, block: false },
)

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600',
  secondary:
    'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-slate-400',
}

const classes = computed(() => [
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold',
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-60',
  VARIANTS[props.variant],
  props.block ? 'w-full' : '',
])
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled || loading" :aria-busy="loading">
    <svg
      v-if="loading"
      class="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
    <slot />
  </button>
</template>
