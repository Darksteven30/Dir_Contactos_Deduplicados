<template>
  <div class="mx-auto max-w-md py-16 text-center">
    <p class="text-sm font-semibold text-brand-600">404</p>
    <h1 class="mt-2 text-2xl font-bold tracking-tight text-slate-900">Página no encontrada</h1>
    <p class="mt-2 text-sm text-slate-600">La página que buscas no existe o fue movida.</p>
    <RouterLink
      :to="{ name: 'home' }"
      class="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
    >
      Volver al inicio
    </RouterLink>
  </div>
</template>
