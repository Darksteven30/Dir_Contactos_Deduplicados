<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import BaseIcon from './BaseIcon.vue'

const open = defineModel<boolean>('open', { required: true })

const props = withDefaults(
  defineProps<{
    title: string
    size?: 'sm' | 'md' | 'lg'
    /** Evita cerrar con Escape o clic afuera (p. ej. mientras se guarda). */
    persistent?: boolean
  }>(),
  { size: 'md', persistent: false },
)

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }

const titleId = useId()
const panel = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

function close(): void {
  if (!props.persistent) open.value = false
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

// Al abrir: foco dentro del diálogo y sin scroll de fondo. Al cerrar: el foco vuelve a donde estaba.
watch(
  open,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      panel.value?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
    } else {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKeydown)
      previouslyFocused?.focus()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-end justify-center p-0 sm:items-center sm:p-4"
    >
      <div class="absolute inset-0 bg-slate-900/50" aria-hidden="true" @click="close" />
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        :class="SIZES[size]"
      >
        <header class="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <h2 :id="titleId" class="text-lg font-semibold text-slate-900">{{ title }}</h2>
          <button
            type="button"
            class="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Cerrar"
            :disabled="persistent"
            @click="close"
          >
            <BaseIcon name="x" />
          </button>
        </header>
        <div class="overflow-y-auto px-6 py-5">
          <slot />
        </div>
        <footer
          v-if="$slots.footer"
          class="flex justify-end gap-3 border-t border-slate-200 px-6 py-4"
        >
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
