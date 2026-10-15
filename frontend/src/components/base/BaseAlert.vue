<script setup lang="ts">
type Variant = 'error' | 'success' | 'info' | 'warning'

withDefaults(defineProps<{ variant?: Variant; title?: string }>(), {
  variant: 'info',
  title: undefined,
})

const STYLES: Record<Variant, string> = {
  error: 'bg-red-50 text-red-800 ring-red-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  info: 'bg-brand-50 text-brand-700 ring-brand-100',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
}
</script>

<template>
  <!-- Los errores se anuncian de inmediato a los lectores de pantalla; el resto, con cortesía. -->
  <div
    :role="variant === 'error' ? 'alert' : 'status'"
    class="rounded-lg px-4 py-3 text-sm ring-1 ring-inset"
    :class="STYLES[variant]"
  >
    <p v-if="title" class="font-semibold">{{ title }}</p>
    <slot />
  </div>
</template>
