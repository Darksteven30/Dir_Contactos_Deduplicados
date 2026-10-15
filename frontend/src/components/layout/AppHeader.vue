<script setup lang="ts">
import { useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function logout(): Promise<void> {
  await auth.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
      <RouterLink
        :to="{ name: 'home' }"
        class="flex items-center gap-2 font-semibold text-slate-900"
      >
        <span
          class="grid size-8 place-items-center rounded-lg bg-brand-600 text-sm text-white"
          aria-hidden="true"
          >DC</span
        >
        <span>Directorio de Contactos</span>
      </RouterLink>

      <div v-if="auth.isAuthenticated" class="flex items-center gap-3">
        <span class="hidden text-sm text-slate-600 sm:inline">{{ auth.user?.name }}</span>
        <BaseButton variant="ghost" :loading="auth.pending" @click="logout"
          >Cerrar sesión</BaseButton
        >
      </div>
    </div>
  </header>
</template>
