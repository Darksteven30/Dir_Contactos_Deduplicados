<script setup lang="ts">
import { useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIcon, { type IconName } from '@/components/base/BaseIcon.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const NAV: Array<{ name: string; label: string; icon: IconName }> = [
  { name: 'contacts', label: 'Contactos', icon: 'users' },
  { name: 'account', label: 'Mi cuenta', icon: 'user' },
]

async function logout(): Promise<void> {
  await auth.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
      <div class="flex items-center gap-6">
        <RouterLink
          :to="{ name: 'contacts' }"
          class="flex items-center gap-2 font-semibold text-slate-900"
        >
          <span
            class="grid size-8 place-items-center rounded-lg bg-brand-600 text-sm text-white"
            aria-hidden="true"
            >DC</span
          >
          <span class="hidden sm:inline">Directorio de Contactos</span>
        </RouterLink>

        <nav v-if="auth.isAuthenticated" class="flex items-center gap-1" aria-label="Principal">
          <RouterLink
            v-for="item in NAV"
            :key="item.name"
            :to="{ name: item.name }"
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            active-class="bg-brand-50 text-brand-700 hover:bg-brand-50 hover:text-brand-700"
          >
            <BaseIcon :name="item.icon" :size="18" />
            <span class="hidden sm:inline">{{ item.label }}</span>
          </RouterLink>
        </nav>
      </div>

      <div v-if="auth.isAuthenticated" class="flex items-center gap-3">
        <span class="hidden text-sm text-slate-600 md:inline">{{ auth.user?.name }}</span>
        <BaseButton variant="ghost" :loading="auth.pending" @click="logout">Salir</BaseButton>
      </div>
    </div>
  </header>
</template>
