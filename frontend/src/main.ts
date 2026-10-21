import './assets/main.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { connectAuth } from './api/client'
import App from './App.vue'
import { createAppRouter, installAuthGuard } from './router'
import { useAuthStore } from './stores/auth'

const app = createApp(App)
const pinia = createPinia()
const router = createAppRouter()

app.use(pinia)
app.use(router)

// El cliente HTTP toma el token del store, le pide renovar la sesión ante un 401 y, si no se
// puede, la sesión expiró: se limpia y se vuelve al login conservando la página actual.
const auth = useAuthStore(pinia)
connectAuth({
  getAccessToken: () => auth.accessToken,
  refreshSession: () => auth.refreshSession(),
  onSessionExpired: () => {
    auth.clearSession()
    const current = router.currentRoute.value
    if (current.meta.requiresAuth) {
      void router.push({ name: 'login', query: { redirect: current.fullPath, expired: '1' } })
    }
  },
})
installAuthGuard(router, pinia)

// Se monta cuando el router resolvió la primera ruta (incluida la recuperación de la sesión),
// así nunca se ve por un instante una página privada sin sesión o el login con sesión.
void router.isReady().then(() => app.mount('#app'))
