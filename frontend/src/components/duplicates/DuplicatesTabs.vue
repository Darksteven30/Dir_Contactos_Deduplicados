<script setup lang="ts">
import BaseIcon, { type IconName } from '@/components/base/BaseIcon.vue'

const TABS: Array<{ name: string; label: string; icon: IconName }> = [
  { name: 'duplicates', label: 'Por revisar', icon: 'merge' },
  { name: 'merge-history', label: 'Historial de fusiones', icon: 'history' },
]
</script>

<template>
  <nav class="flex gap-1 border-b border-slate-200" aria-label="Secciones de duplicados">
    <RouterLink
      v-for="tab in TABS"
      :key="tab.name"
      :to="{ name: tab.name }"
      class="-mb-px flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
      exact-active-class="border-brand-600! text-brand-700!"
    >
      <BaseIcon :name="tab.icon" :size="16" /> {{ tab.label }}
    </RouterLink>
  </nav>
</template>
