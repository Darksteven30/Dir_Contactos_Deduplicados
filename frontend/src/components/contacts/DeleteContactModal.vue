<script setup lang="ts">
import { ref } from 'vue'
import { toApiError } from '@/api/errors'
import BaseAlert from '@/components/base/BaseAlert.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import { useContactsStore } from '@/stores/contacts'
import { useToastStore } from '@/stores/toasts'
import type { Contact } from '@/types/api'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ contact: Contact | null }>()
const emit = defineEmits<{ deleted: [contact: Contact] }>()

const store = useContactsStore()
const toasts = useToastStore()
const pending = ref(false)
const error = ref<string | null>(null)

async function confirm(): Promise<void> {
  if (!props.contact) return
  const contact = props.contact
  pending.value = true
  error.value = null
  try {
    await store.remove(contact.id)
    toasts.show(`Se eliminó a ${contact.fullName}`)
    open.value = false
    emit('deleted', contact)
  } catch (err) {
    error.value = toApiError(err).message
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <BaseModal v-model:open="open" title="Eliminar contacto" size="sm" :persistent="pending">
    <div class="space-y-4">
      <p class="text-sm text-slate-600">
        ¿Seguro que quieres eliminar a
        <span class="font-semibold text-slate-900">{{ contact?.fullName }}</span
        >? Dejará de aparecer en tu directorio.
      </p>
      <BaseAlert v-if="error" variant="error">{{ error }}</BaseAlert>
    </div>
    <template #footer>
      <BaseButton variant="secondary" :disabled="pending" @click="open = false"
        >Cancelar</BaseButton
      >
      <BaseButton variant="danger" :loading="pending" data-testid="delete-confirm" @click="confirm"
        >Eliminar</BaseButton
      >
    </template>
  </BaseModal>
</template>
