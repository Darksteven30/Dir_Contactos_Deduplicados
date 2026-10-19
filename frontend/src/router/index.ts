import type { Pinia } from 'pinia'
import {
  createRouter,
  createWebHistory,
  type Router,
  type RouterHistory,
  type RouteRecordRaw,
} from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Solo para usuarios con sesión: sin sesión se redirige al login. */
    requiresAuth?: boolean
    /** Solo para visitantes (login, registro): con sesión se redirige a los contactos. */
    guestOnly?: boolean
    title?: string
  }
}

const APP_NAME = 'Directorio de Contactos'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: { name: 'contacts' } },
  {
    path: '/contactos',
    name: 'contacts',
    component: () => import('@/views/ContactsView.vue'),
    meta: { requiresAuth: true, title: 'Contactos' },
  },
  {
    path: '/cuenta',
    name: 'account',
    component: () => import('@/views/AccountView.vue'),
    meta: { requiresAuth: true, title: 'Mi cuenta' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { guestOnly: true, title: 'Iniciar sesión' },
  },
  {
    path: '/registro',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { guestOnly: true, title: 'Crear cuenta' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Página no encontrada' },
  },
]

export function createAppRouter(
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
): Router {
  return createRouter({ history, routes })
}

/**
 * Guard asíncrono de acceso. Antes de la primera navegación espera a que se intente recuperar
 * la sesión (refresh con la cookie HttpOnly), así una recarga en una ruta privada no manda al
 * login a un usuario que sí tiene sesión.
 */
export function installAuthGuard(router: Router, pinia: Pinia): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore(pinia)
    await auth.restoreSession()

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (to.meta.guestOnly && auth.isAuthenticated) {
      return { name: 'contacts' }
    }
    return true
  })

  router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME
  })
}

/**
 * Destino seguro tras iniciar sesión: solo rutas internas. Evita que un enlace como
 * `/login?redirect=https://sitio-malicioso.com` (open redirect) saque al usuario de la app.
 */
export function safeRedirect(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback
  const isInternalPath =
    value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
  return isInternalPath ? value : fallback
}
