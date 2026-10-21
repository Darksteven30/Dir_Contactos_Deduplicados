<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { contactsApi } from '@/api/contacts'
import { ApiError, toApiError } from '@/api/errors'
import BaseAlert from '@/components/base/BaseAlert.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import { useDebouncedFn } from '@/composables/useDebouncedFn'
import { ContactConflictError, useContactsStore } from '@/stores/contacts'
import { useToastStore } from '@/stores/toasts'
import type { Contact, SimilarContact } from '@/types/api'
import ContactConflict from './ContactConflict.vue'
import {
  emptyForm,
  formFromContact,
  formToInput,
  NOTES_MAX_LENGTH,
  validateContactForm,
  type ContactField,
} from './contactForm'
import SimilarContactsAlert from './SimilarContactsAlert.vue'

const open = defineModel<boolean>('open', { required: true })
/** Contacto a editar; null para crear uno nuevo. */
const props = defineProps<{ contact: Contact | null }>()
const emit = defineEmits<{ 'edit-existing': [contact: Contact] }>()

// Esperar a que el usuario deje de escribir antes de buscar parecidos.
const SIMILAR_CHECK_DELAY_MS = 500

const store = useContactsStore()
const toasts = useToastStore()

const form = reactive(emptyForm())
const localErrors = ref<Partial<Record<ContactField, string>>>({})
const serverError = ref<ApiError | null>(null)
const pending = ref(false)
/** Versión sobre la que se está editando (cambia si se resuelve un conflicto). */
const baseVersion = ref(0)
const conflict = ref<Contact | null>(null)
const similar = ref<SimilarContact[]>([])

const isEditing = computed(() => props.contact !== null)
const title = computed(() =>
  conflict.value ? 'Resolver conflicto' : isEditing.value ? 'Editar contacto' : 'Nuevo contacto',
)
const fieldError = (field: ContactField): string | undefined =>
  localErrors.value[field] ?? serverError.value?.fieldErrors[field]?.[0]

// Al abrir (o al pasar a editar otro contacto con la ventana abierta) el formulario arranca limpio
// o con los datos del contacto a editar.
watch([open, () => props.contact], ([isOpen]) => {
  if (!isOpen) return
  Object.assign(form, props.contact ? formFromContact(props.contact) : emptyForm())
  baseVersion.value = props.contact?.version ?? 0
  localErrors.value = {}
  serverError.value = null
  conflict.value = null
  similar.value = []
})

// ---- Aviso en vivo de posibles duplicados (solo al crear) ----
let latestCheck = 0
const checkSimilar = useDebouncedFn(async () => {
  const input = formToInput(form)
  const worthChecking = input.fullName.length >= 3 || input.email !== null || input.phone !== null
  if (!worthChecking || Object.keys(validateContactForm(form)).length > 0) {
    similar.value = []
    return
  }
  const check = ++latestCheck
  try {
    const found = await contactsApi.findSimilar(input)
    if (check === latestCheck) similar.value = found
  } catch {
    // El aviso es una ayuda: si falla, no se interrumpe la creación.
  }
}, SIMILAR_CHECK_DELAY_MS)

watch(
  () => [form.fullName, form.email, form.phone],
  () => {
    if (open.value && !isEditing.value) checkSimilar.run()
  },
)

// ---- Guardar ----
async function save(version: number): Promise<void> {
  pending.value = true
  serverError.value = null
  const input = formToInput(form)
  try {
    if (props.contact) {
      await store.update(props.contact.id, input, version)
      toasts.show('Cambios guardados')
    } else {
      await store.create(input)
      toasts.show('Contacto creado')
    }
    open.value = false
  } catch (err) {
    if (err instanceof ContactConflictError) {
      conflict.value = err.current
    } else {
      serverError.value = toApiError(err)
    }
  } finally {
    pending.value = false
  }
}

function submit(): void {
  localErrors.value = validateContactForm(form)
  if (Object.keys(localErrors.value).length === 0) void save(baseVersion.value)
}

// Resolución del conflicto 409.
function useCurrentVersion(): void {
  if (!conflict.value) return
  Object.assign(form, formFromContact(conflict.value))
  baseVersion.value = conflict.value.version
  conflict.value = null
  toasts.show('Se cargó la versión actual. Puedes seguir editando.', 'info')
}

function overwriteWithMine(): void {
  if (!conflict.value) return
  baseVersion.value = conflict.value.version
  void save(conflict.value.version)
}
</script>

<template>
  <BaseModal v-model:open="open" :title="title" size="lg" :persistent="pending">
    <ContactConflict
      v-if="conflict"
      :mine="formToInput(form)"
      :current="conflict"
      :pending="pending"
      @use-current="useCurrentVersion"
      @overwrite="overwriteWithMine"
    />

    <form v-else id="contact-form" class="space-y-4" novalidate @submit.prevent="submit">
      <BaseAlert
        v-if="serverError && Object.keys(serverError.fieldErrors).length === 0"
        variant="error"
      >
        {{ serverError.message }}
      </BaseAlert>

      <BaseInput
        v-model="form.fullName"
        label="Nombre completo"
        autocomplete="off"
        required
        :error="fieldError('fullName')"
      />
      <div class="grid gap-4 sm:grid-cols-2">
        <BaseInput
          v-model="form.email"
          label="Email"
          type="email"
          autocomplete="off"
          :error="fieldError('email')"
        />
        <BaseInput
          v-model="form.phone"
          label="Teléfono"
          type="tel"
          autocomplete="off"
          :error="fieldError('phone')"
        />
      </div>
      <BaseInput
        v-model="form.company"
        label="Empresa"
        autocomplete="off"
        :error="fieldError('company')"
      />
      <BaseTextarea
        v-model="form.notes"
        label="Notas"
        :maxlength="NOTES_MAX_LENGTH"
        :error="fieldError('notes')"
      />

      <SimilarContactsAlert
        v-if="!isEditing && similar.length > 0"
        :similar="similar"
        @edit-existing="emit('edit-existing', $event)"
      />
    </form>

    <template v-if="!conflict" #footer>
      <BaseButton variant="secondary" :disabled="pending" @click="open = false"
        >Cancelar</BaseButton
      >
      <BaseButton type="submit" form="contact-form" :loading="pending">
        {{ isEditing ? 'Guardar cambios' : 'Crear contacto' }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
