<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseAlert from '@/components/base/BaseAlert.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import { safeRedirect } from '@/router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')

const sessionExpired = computed(() => route.query.expired === '1')
const fieldError = (field: string): string | undefined => auth.error?.fieldErrors[field]?.[0]

onMounted(() => auth.clearError())

async function submit(): Promise<void> {
  const ok = await auth.login({ email: email.value.trim(), password: password.value })
  if (ok) await router.replace(safeRedirect(route.query.redirect))
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold tracking-tight text-slate-900">Inicia sesión</h1>
      <p class="mt-2 text-sm text-slate-600">Accede a tu directorio de contactos.</p>
    </div>

    <BaseCard>
      <form class="space-y-5" novalidate @submit.prevent="submit">
        <BaseAlert
          v-if="sessionExpired && !auth.error"
          data-testid="login-expired"
          variant="warning"
        >
          Tu sesión expiró. Vuelve a iniciar sesión para continuar.
        </BaseAlert>
        <BaseAlert v-if="auth.error" data-testid="login-error" variant="error">
          {{ auth.error.message }}
          <span
            v-if="auth.error.correlationId && auth.error.status >= 500"
            class="mt-1 block text-xs"
          >
            Código de referencia: {{ auth.error.correlationId }}
          </span>
        </BaseAlert>

        <BaseInput
          v-model="email"
          data-testid="login-email"
          label="Email"
          type="email"
          autocomplete="email"
          required
          :error="fieldError('email')"
        />
        <BaseInput
          v-model="password"
          data-testid="login-password"
          label="Contraseña"
          type="password"
          autocomplete="current-password"
          required
          :error="fieldError('password')"
        />

        <BaseButton type="submit" block data-testid="login-submit" :loading="auth.pending"
          >Iniciar sesión</BaseButton
        >
      </form>
    </BaseCard>

    <p class="mt-6 text-center text-sm text-slate-600">
      ¿No tienes cuenta?
      <RouterLink
        :to="{ name: 'register' }"
        class="font-semibold text-brand-600 hover:text-brand-700"
      >
        Crea una
      </RouterLink>
    </p>
  </div>
</template>
