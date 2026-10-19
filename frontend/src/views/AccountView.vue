<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseAlert from '@/components/base/BaseAlert.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import { toApiError } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const logoutAllError = ref<string | null>(null)

const memberSince = computed(() =>
  auth.user ? new Date(auth.user.createdAt).toLocaleDateString('es-CO', { dateStyle: 'long' }) : '',
)

async function logoutAll(): Promise<void> {
  if (!window.confirm('Se cerrará la sesión en todos tus dispositivos. ¿Continuar?')) return
  logoutAllError.value = null
  try {
    await auth.logoutAll()
    await router.push({ name: 'login' })
  } catch (err) {
    logoutAllError.value = toApiError(err).message
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight text-slate-900">Mi cuenta</h1>
      <p class="mt-1 text-sm text-slate-600">Tus datos y la seguridad de tus sesiones.</p>
    </div>

    <BaseCard>
      <h2 class="text-base font-semibold text-slate-900">Tu cuenta</h2>
      <dl class="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt class="text-slate-500">Email</dt>
          <dd class="mt-1 font-medium text-slate-900">{{ auth.user?.email }}</dd>
        </div>
        <div>
          <dt class="text-slate-500">Rol</dt>
          <dd class="mt-1 font-medium text-slate-900">
            {{ auth.user?.role === 'admin' ? 'Administrador' : 'Usuario' }}
          </dd>
        </div>
        <div>
          <dt class="text-slate-500">Miembro desde</dt>
          <dd class="mt-1 font-medium text-slate-900">{{ memberSince }}</dd>
        </div>
      </dl>
    </BaseCard>

    <BaseCard>
      <h2 class="text-base font-semibold text-slate-900">Seguridad</h2>
      <p class="mt-1 text-sm text-slate-600">
        Si usaste tu cuenta en un equipo ajeno o perdiste un dispositivo, cierra todas tus sesiones.
      </p>
      <BaseAlert v-if="logoutAllError" variant="error" class="mt-4">{{ logoutAllError }}</BaseAlert>
      <BaseButton variant="secondary" class="mt-4" :loading="auth.pending" @click="logoutAll">
        Cerrar sesión en todos los dispositivos
      </BaseButton>
    </BaseCard>
  </div>
</template>
