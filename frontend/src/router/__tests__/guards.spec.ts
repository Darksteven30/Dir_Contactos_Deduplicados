import { createPinia, type Pinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, type Router } from 'vue-router'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/errors'
import { createAppRouter, installAuthGuard, safeRedirect } from '..'

type AuthApi = (typeof import('@/api/auth'))['authApi']

vi.mock('@/api/auth', () => ({ authApi: { refresh: vi.fn<AuthApi['refresh']>() } }))

const SESSION = {
  accessToken: 'token',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  user: {
    id: 1,
    name: 'Ana',
    email: 'ana@test.com',
    role: 'user' as const,
    createdAt: '2026-01-01',
  },
}

describe('guards de navegación', () => {
  let router: Router
  let pinia: Pinia

  beforeEach(() => {
    vi.resetAllMocks()
    pinia = createPinia()
    router = createAppRouter(createMemoryHistory())
    installAuthGuard(router, pinia)
  })

  it('sin sesión, una ruta privada redirige al login recordando el destino', async () => {
    vi.mocked(authApi.refresh).mockRejectedValue(new ApiError('Sesión inválida', 401))

    await router.push('/contactos?q=ana')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/contactos?q=ana')
  })

  it('con una sesión recuperable (recarga de página) entra a la ruta privada', async () => {
    vi.mocked(authApi.refresh).mockResolvedValue(SESSION)

    await router.push('/cuenta')

    expect(router.currentRoute.value.name).toBe('account')
  })

  it('la raíz lleva al directorio de contactos', async () => {
    vi.mocked(authApi.refresh).mockResolvedValue(SESSION)

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('contacts')
  })

  it('con sesión, el login y el registro redirigen a los contactos', async () => {
    vi.mocked(authApi.refresh).mockResolvedValue(SESSION)

    await router.push('/login')
    expect(router.currentRoute.value.name).toBe('contacts')

    await router.push('/registro')
    expect(router.currentRoute.value.name).toBe('contacts')
  })

  it('recupera la sesión una sola vez aunque haya varias navegaciones', async () => {
    vi.mocked(authApi.refresh).mockRejectedValue(new ApiError('Sesión inválida', 401))

    await router.push('/login')
    await router.push('/registro')
    await router.push('/')

    expect(authApi.refresh).toHaveBeenCalledTimes(1)
  })

  it('pone el título de la página según la ruta', async () => {
    vi.mocked(authApi.refresh).mockRejectedValue(new ApiError('Sesión inválida', 401))

    await router.push('/registro')

    expect(document.title).toBe('Crear cuenta · Directorio de Contactos')
  })
})

describe('safeRedirect', () => {
  it('acepta rutas internas', () => {
    expect(safeRedirect('/contactos?page=2')).toBe('/contactos?page=2')
  })

  it('rechaza destinos externos o inválidos (open redirect)', () => {
    for (const value of [
      'https://malicioso.com',
      '//malicioso.com',
      '/\\malicioso.com',
      undefined,
      ['/'],
    ]) {
      expect(safeRedirect(value)).toBe('/')
    }
  })
})
