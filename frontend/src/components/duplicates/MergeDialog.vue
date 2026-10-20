<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { toApiError } from '@/api/errors'
import BaseAlert from '@/components/base/BaseAlert.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import ContactAvatar from '@/components/contacts/ContactAvatar.vue'
import {
  emptyForm,
  formFromContact,
  formToInput,
  NOTES_MAX_LENGTH,
  validateContactForm,
  type ContactField,
} from '@/components/contacts/contactForm'
import { MergeConflictError, useDuplicatesStore } from '@/stores/duplicates'
import { useToastStore } from '@/stores/toasts'
import type { DuplicateGroup, MergeResult } from '@/types/api'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ group: DuplicateGroup | null }>()
const emit = defineEmits<{ merged: [result: MergeResult] }>()

type ChoiceField = Exclude<ContactField, 'notes'>
// `wide`: ocupa toda la fila; email y teléfono van lado a lado en pantallas anchas.
const CHOICE_FIELDS: Array<{
  field: ChoiceField
  label: string
  type: 'text' | 'email' | 'tel'
  wide: boolean
}> = [
  { field: 'fullName', label: 'Nombre completo', type: 'text', wide: true },
  { field: 'email', label: 'Email', type: 'email', wide: false },
  { field: 'phone', label: 'Teléfono', type: 'tel', wide: false },
  { field: 'company', label: 'Empresa', type: 'text', wide: true },
]

const store = useDuplicatesStore()
const toasts = useToastStore()

const primaryId = ref(0)
const form = reactive(emptyForm())
const errors = ref<Partial<Record<ContactField, string>>>({})
const serverError = ref<string | null>(null)
const pending = ref(false)

// Al abrir: el principal sugerido y la combinación que propone el servidor (sin perder datos).
watch([open, () => props.group], ([isOpen, group]) => {
  if (!isOpen || !group) return
  primaryId.value = group.suggestedPrimaryId
  Object.assign(form, formFromContact(group.mergePreview))
  errors.value = {}
  serverError.value = null
})

/** Valores distintos que tiene cada campo en el grupo, para elegir con un clic. */
function alternatives(field: ChoiceField): string[] {
  const values = (props.group?.contacts ?? []).map((c) => c[field]).filter((v): v is string => !!v)
  return [...new Set(values)]
}

const others = computed(() => props.group?.contacts.filter((c) => c.id !== primaryId.value) ?? [])

function choosePrimary(id: number): void {
  primaryId.value = id
  const contact = props.group?.contacts.find((c) => c.id === id)
  if (contact) form.fullName = contact.fullName
}

async function submit(): Promise<void> {
  if (!props.group) return
  errors.value = validateContactForm(form)
  if (Object.keys(errors.value).length > 0) return

  pending.value = true
  serverError.value = null
  try {
    const result = await store.merge(props.group, primaryId.value, formToInput(form))
    toasts.show(
      `Se fusionaron ${props.group.contacts.length} contactos en ${result.contact.fullName}`,
    )
    open.value = false
    emit('merged', result)
  } catch (err) {
    if (err instanceof MergeConflictError) {
      toasts.show(err.message, 'error', 7000)
      open.value = false
    } else {
      serverError.value = toApiError(err).message
    }
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <BaseModal v-model:open="open" title="Fusionar contactos" size="lg" :persistent="pending">
    <form v-if="group" id="merge-form" class="space-y-6" novalidate @submit.prevent="submit">
      <BaseAlert v-if="serverError" variant="error">{{ serverError }}</BaseAlert>

      <fieldset>
        <legend class="text-sm font-semibold text-slate-900">1. ¿Qué contacto conservar?</legend>
        <p class="mt-1 text-sm text-slate-600">Los demás se eliminarán del directorio.</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <label
            v-for="contact in group.contacts"
            :key="contact.id"
            class="flex cursor-pointer items-center gap-3 rounded-lg p-3 ring-1 transition-colors"
            :class="
              primaryId === contact.id
                ? 'bg-brand-50 ring-2 ring-brand-600'
                : 'ring-slate-200 hover:bg-slate-50'
            "
          >
            <input
              type="radio"
              name="primary"
              class="sr-only"
              :value="contact.id"
              :checked="primaryId === contact.id"
              @change="choosePrimary(contact.id)"
            />
            <ContactAvatar :name="contact.fullName" size="sm" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-slate-900">
                {{ contact.fullName }}
              </span>
              <span
                v-if="contact.id === group.suggestedPrimaryId"
                class="text-xs font-medium text-brand-700"
                >Sugerido: el más completo</span
              >
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset class="space-y-4">
        <legend class="text-sm font-semibold text-slate-900">2. Revisa el resultado</legend>
        <p class="-mt-2 text-sm text-slate-600">
          Ya combinamos los datos sin perder nada. Toca un valor para usarlo en su lugar.
        </p>

        <div class="grid gap-4 sm:grid-cols-2">
          <div
            v-for="item in CHOICE_FIELDS"
            :key="item.field"
            class="space-y-2"
            :class="{ 'sm:col-span-2': item.wide }"
          >
            <BaseInput
              v-model="form[item.field]"
              :label="item.label"
              :type="item.type"
              :required="item.field === 'fullName'"
              autocomplete="off"
              :error="errors[item.field]"
            />
            <div v-if="alternatives(item.field).length > 1" class="flex flex-wrap gap-1.5">
              <button
                v-for="value in alternatives(item.field)"
                :key="value"
                type="button"
                class="rounded-full px-2.5 py-1 text-xs ring-1 transition-colors"
                :class="
                  form[item.field] === value
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                "
                :aria-pressed="form[item.field] === value"
                @click="form[item.field] = value"
              >
                {{ value }}
              </button>
            </div>
          </div>
        </div>

        <BaseTextarea
          v-model="form.notes"
          label="Notas"
          :rows="4"
          :maxlength="NOTES_MAX_LENGTH"
          :error="errors.notes"
        />
      </fieldset>

      <BaseAlert variant="info">
        Se conservará <strong>{{ form.fullName || 'el contacto principal' }}</strong> y se
        eliminarán {{ others.length }} {{ others.length === 1 ? 'contacto' : 'contactos' }}. Podrás
        deshacerlo desde el historial de fusiones.
      </BaseAlert>
    </form>

    <template #footer>
      <BaseButton variant="secondary" :disabled="pending" @click="open = false"
        >Cancelar</BaseButton
      >
      <BaseButton type="submit" form="merge-form" :loading="pending">Fusionar</BaseButton>
    </template>
  </BaseModal>
</template>
