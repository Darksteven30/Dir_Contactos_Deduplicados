<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseAlert from '@/components/base/BaseAlert.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import { useAuthStore } from '@/stores/auth'

// Mismas reglas que el backend (users/user.schemas.ts): validar aquí evita un viaje al servidor,
// pero el backend sigue siendo quien decide.
const MIN_PASSWORD_LENGTH = 8

type Field = 'name' | 'email' | 'password' | 'confirmPassword'

const auth = useAuthStore()
const router = useRouter()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const localErrors = reactive<Partial<Record<Field, string>>>({})

const fieldError = (field: Field): string | undefined =>
  localErrors[field] ?? auth.error?.fieldErrors[field]?.[0]

onMounted(() => auth.clearError())

function validate(): boolean {
  for (const key of Object.keys(localErrors) as Field[]) delete localErrors[key]

  if (!name.value.trim()) localErrors.name = 'El nombre es requerido'
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) localErrors.email = 'Email inválido'
  if (password.value.length < MIN_PASSWORD_LENGTH) {
    localErrors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
  }
  if (confirmPassword.value !== password.value)
    localErrors.confirmPassword = 'Las contraseñas no coinciden'

  return Object.keys(localErrors).length === 0
}

async function submit(): Promise<void> {
  if (!validate()) return
  const ok = await auth.register({
    name: name.value.trim(),
    email: email.value.trim(),
    password: password.value,
  })
  if (ok) await router.replace({ name: 'home' })
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold tracking-tight text-slate-900">Crea tu cuenta</h1>
      <p class="mt-2 text-sm text-slate-600">Organiza tus contactos y encuentra los duplicados.</p>
    </div>

    <BaseCard>
      <form class="space-y-5" novalidate @submit.prevent="submit">
        <BaseAlert
          v-if="auth.error && Object.keys(auth.error.fieldErrors).length === 0"
          variant="error"
        >
          {{ auth.error.message }}
        </BaseAlert>

        <BaseInput
          v-model="name"
          label="Nombre"
          autocomplete="name"
          required
          :error="fieldError('name')"
        />
        <BaseInput
          v-model="email"
          label="Email"
          type="email"
          autocomplete="email"
          required
          :error="fieldError('email')"
        />
        <BaseInput
          v-model="password"
          label="Contraseña"
          type="password"
          autocomplete="new-password"
          required
          :hint="`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`"
          :error="fieldError('password')"
        />
        <BaseInput
          v-model="confirmPassword"
          label="Confirmar contraseña"
          type="password"
          autocomplete="new-password"
          required
          :error="fieldError('confirmPassword')"
        />

        <BaseButton type="submit" block :loading="auth.pending">Crear cuenta</BaseButton>
      </form>
    </BaseCard>

    <p class="mt-6 text-center text-sm text-slate-600">
      ¿Ya tienes cuenta?
      <RouterLink :to="{ name: 'login' }" class="font-semibold text-brand-600 hover:text-brand-700">
        Inicia sesión
      </RouterLink>
    </p>
  </div>
</template>
