<script setup lang="ts">
import BaseIcon from '@/components/base/BaseIcon.vue'
import { useToastStore } from '@/stores/toasts'

const toastStore = useToastStore()

const STYLES = {
  success: { icon: 'check', classes: 'text-emerald-600' },
  error: { icon: 'alert', classes: 'text-red-600' },
  info: { icon: 'info', classes: 'text-brand-600' },
} as const
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    aria-live="polite"
  >
    <TransitionGroup
      enter-from-class="translate-y-2 opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="opacity-0"
      leave-active-class="transition duration-150"
    >
      <div
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-white p-4 text-sm text-slate-800 shadow-lg ring-1 ring-slate-200"
        :role="toast.variant === 'error' ? 'alert' : 'status'"
      >
        <BaseIcon :name="STYLES[toast.variant].icon" :class="STYLES[toast.variant].classes" />
        <p class="flex-1">{{ toast.message }}</p>
        <button
          type="button"
          class="text-slate-400 hover:text-slate-600"
          aria-label="Cerrar aviso"
          @click="toastStore.dismiss(toast.id)"
        >
          <BaseIcon name="x" :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
