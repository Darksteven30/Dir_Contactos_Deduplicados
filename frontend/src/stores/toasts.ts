import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

const DEFAULT_DURATION_MS = 4000

/** Avisos breves ("Contacto creado") que se muestran en una esquina y desaparecen solos. */
export const useToastStore = defineStore('toasts', () => {
  const toasts = ref<Toast[]>([])
  let nextId = 1

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function show(
    message: string,
    variant: ToastVariant = 'success',
    durationMs = DEFAULT_DURATION_MS,
  ): void {
    const id = nextId++
    toasts.value.push({ id, message, variant })
    setTimeout(() => dismiss(id), durationMs)
  }

  return { toasts, show, dismiss }
})
