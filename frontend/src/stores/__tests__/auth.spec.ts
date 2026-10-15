import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/errors'
import type { AuthSession } from '@/types/api'
import { useAuthStore } from '../auth'

type AuthApi = (typeof import('@/api/auth'))['authApi']

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn<AuthApi['login']>(),
    register: vi.fn<AuthApi['register']>(),
    refresh: vi.fn<AuthApi['refresh']>(),
    logout: vi.fn<AuthApi['logout']>(),
    logoutAll: vi.fn<AuthApi['logoutAll']>(),
    me: vi.fn<AuthApi['me']>(),
  },
}))

const session = (accessToken = 'token-1'): AuthSession => ({
  accessToken,
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: 1,
    name: 'Ana',
    email: 'ana@test.com',
    role: 'user',
    createdAt: '2026-01-01T00:00:00Z',
  },
})

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('al iniciar sesión guarda el usuario y el token solo en memoria', async () => {
    vi.mocked(authApi.login).mockResolvedValue(session())
    const auth = useAuthStore()

    const ok = await auth.login({ email: 'ana@test.com', password: 'secreto123' })

    expect(ok).toBe(true)
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.accessToken).toBe('token-1')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('marca la carga mientras el login está en curso', async () => {
    let resolve!: (value: AuthSession) => void
    vi.mocked(authApi.login).mockReturnValue(new Promise((r) => (resolve = r)))
    const auth = useAuthStore()

    const login = auth.login({ email: 'ana@test.com', password: 'secreto123' })
    expect(auth.pending).toBe(true)

    resolve(session())
    await login
    expect(auth.pending).toBe(false)
  })

  it('si el login falla guarda el error y no inicia sesión', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError('Email o contraseña incorrectos', 401))
    const auth = useAuthStore()

    const ok = await auth.login({ email: 'ana@test.com', password: 'mala' })

    expect(ok).toBe(false)
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.error).toMatchObject({ status: 401, message: 'Email o contraseña incorrectos' })
  })

  it('restoreSession recupera la sesión con el refresh token una sola vez', async () => {
    vi.mocked(authApi.refresh).mockResolvedValue(session('recuperado'))
    const auth = useAuthStore()

    await Promise.all([auth.restoreSession(), auth.restoreSession()])
    await auth.restoreSession()

    expect(authApi.refresh).toHaveBeenCalledTimes(1)
    expect(auth.initialized).toBe(true)
    expect(auth.accessToken).toBe('recuperado')
  })

  it('restoreSession sin sesión previa deja al usuario como visitante', async () => {
    vi.mocked(authApi.refresh).mockRejectedValue(new ApiError('Sesión inválida o expirada', 401))
    const auth = useAuthStore()

    await auth.restoreSession()

    expect(auth.initialized).toBe(true)
    expect(auth.isAuthenticated).toBe(false)
  })

  it('logout cierra la sesión local aunque el servidor no responda', async () => {
    vi.mocked(authApi.login).mockResolvedValue(session())
    vi.mocked(authApi.logout).mockRejectedValue(new ApiError('Sin conexión', 0))
    const auth = useAuthStore()
    await auth.login({ email: 'ana@test.com', password: 'secreto123' })

    await auth.logout()

    expect(auth.isAuthenticated).toBe(false)
  })

  it('logoutAll conserva la sesión local si el servidor falla', async () => {
    vi.mocked(authApi.login).mockResolvedValue(session())
    vi.mocked(authApi.logoutAll).mockRejectedValue(new ApiError('Sin conexión', 0))
    const auth = useAuthStore()
    await auth.login({ email: 'ana@test.com', password: 'secreto123' })

    await expect(auth.logoutAll()).rejects.toBeInstanceOf(ApiError)
    expect(auth.isAuthenticated).toBe(true)
  })
})
