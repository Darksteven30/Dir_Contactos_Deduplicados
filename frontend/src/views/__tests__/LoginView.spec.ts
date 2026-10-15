import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/errors'
import LoginView from '../LoginView.vue'

type AuthApi = (typeof import('@/api/auth'))['authApi']

vi.mock('@/api/auth', () => ({ authApi: { login: vi.fn<AuthApi['login']>() } }))

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

async function mountAt(path: string) {
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<p>inicio</p>' } },
      { path: '/login', name: 'login', component: LoginView },
      { path: '/registro', name: 'register', component: { template: '<p>registro</p>' } },
      { path: '/contactos', name: 'contacts', component: { template: '<p>contactos</p>' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(LoginView, { global: { plugins: [router] } })
  return { wrapper, router }
}

async function fillAndSubmit(wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper']) {
  await wrapper.find('input[type="email"]').setValue('  ana@test.com ')
  await wrapper.find('input[type="password"]').setValue('secreto123')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('inicia sesión y vuelve a la página que el usuario quería ver', async () => {
    vi.mocked(authApi.login).mockResolvedValue(SESSION)
    const { wrapper, router } = await mountAt('/login?redirect=/contactos')

    await fillAndSubmit(wrapper)

    expect(authApi.login).toHaveBeenCalledWith({ email: 'ana@test.com', password: 'secreto123' })
    expect(router.currentRoute.value.path).toBe('/contactos')
  })

  it('muestra el error del servidor y se queda en el login', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError('Email o contraseña incorrectos', 401))
    const { wrapper, router } = await mountAt('/login')

    await fillAndSubmit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toContain('Email o contraseña incorrectos')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('avisa cuando la sesión expiró', async () => {
    const { wrapper } = await mountAt('/login?expired=1')

    expect(wrapper.text()).toContain('Tu sesión expiró')
  })

  it('desactiva el botón mientras se inicia sesión', async () => {
    vi.mocked(authApi.login).mockReturnValue(new Promise(() => undefined))
    const { wrapper } = await mountAt('/login')

    await wrapper.find('input[type="email"]').setValue('ana@test.com')
    await wrapper.find('input[type="password"]').setValue('secreto123')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
})
