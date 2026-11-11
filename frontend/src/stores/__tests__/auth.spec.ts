import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/errors'
import type { AuthSession, Contact, DuplicateGroup } from '@/types/api'
import { REFRESH_RETRY_DELAYS_MS, useAuthStore } from '../auth'
import { useContactsStore } from '../contacts'
import { useDuplicatesStore } from '../duplicates'

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

const session = (accessToken = 'token-1', userId = 1): AuthSession => ({
  accessToken,
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: userId,
    name: 'Ana',
    email: 'ana@test.com',
    role: 'user',
    createdAt: '2026-01-01T00:00:00Z',
  },
})

const contact: Contact = {
  id: 7,
  ownerId: 1,
  fullName: 'José Pérez',
  email: null,
  phone: null,
  company: null,
  notes: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

// Simula datos del usuario ya cargados en los stores de contactos y duplicados.
function loadUserData() {
  const contacts = useContactsStore()
  const duplicates = useDuplicatesStore()
  contacts.byId = { [contact.id]: contact }
  contacts.ids = [contact.id]
  contacts.total = 1
  const group: DuplicateGroup = {
    score: 1,
    suggestedPrimaryId: contact.id,
    mergePreview: { fullName: contact.fullName, email: null, phone: null, company: null, notes: null },
    contacts: [contact],
    pairs: [],
  }
  duplicates.groups = [group]
  return { contacts, duplicates }
}

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('logout descarta los contactos y duplicados cargados del usuario', async () => {
    vi.mocked(authApi.login).mockResolvedValue(session())
    vi.mocked(authApi.logout).mockResolvedValue()
    const auth = useAuthStore()
    await auth.login({ email: 'ana@test.com', password: 'secreto123' })
    const { contacts, duplicates } = loadUserData()

    await auth.logout()

    expect(contacts.byId).toEqual({})
    expect(contacts.ids).toEqual([])
    expect(contacts.total).toBe(0)
    expect(duplicates.groups).toEqual([])
  })

  it('al renovar la sesión con otro usuario descarta los datos del anterior', async () => {
    vi.mocked(authApi.login).mockResolvedValue(session('token-1', 1))
    vi.mocked(authApi.refresh).mockResolvedValue(session('token-2', 2))
    const auth = useAuthStore()
    await auth.login({ email: 'ana@test.com', password: 'secreto123' })
    const { contacts } = loadUserData()

    await auth.refreshSession()

    expect(auth.user?.id).toBe(2)
    expect(contacts.ids).toEqual([])
  })

  it('al renovar la sesión del mismo usuario conserva sus datos', async () => {
    vi.mocked(authApi.login).mockResolvedValue(session('token-1'))
    vi.mocked(authApi.refresh).mockResolvedValue(session('token-2'))
    const auth = useAuthStore()
    await auth.login({ email: 'ana@test.com', password: 'secreto123' })
    const { contacts } = loadUserData()

    await auth.refreshSession()

    expect(contacts.ids).toEqual([contact.id])
  })

  it('si el servidor rechaza el refresh cierra la sesión y devuelve null', async () => {
    vi.mocked(authApi.login).mockResolvedValue(session())
    vi.mocked(authApi.refresh).mockRejectedValue(new ApiError('Sesión inválida o expirada', 401))
    const auth = useAuthStore()
    await auth.login({ email: 'ana@test.com', password: 'secreto123' })

    await expect(auth.refreshSession()).resolves.toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(authApi.refresh).toHaveBeenCalledTimes(1)
  })

  it('ante un corte de conexión reintenta el refresh y, si persiste, conserva la sesión', async () => {
    vi.useFakeTimers()
    vi.mocked(authApi.login).mockResolvedValue(session())
    vi.mocked(authApi.refresh).mockRejectedValue(new ApiError('Sin conexión', 0))
    const auth = useAuthStore()
    await auth.login({ email: 'ana@test.com', password: 'secreto123' })

    // El catch se engancha antes de avanzar los timers para que el rechazo no quede sin manejar.
    const failure = auth.refreshSession().catch((err: unknown) => err)
    await vi.runAllTimersAsync()

    expect(await failure).toMatchObject({ status: 0 })
    expect(authApi.refresh).toHaveBeenCalledTimes(REFRESH_RETRY_DELAYS_MS.length + 1)
    expect(auth.isAuthenticated).toBe(true)
  })

  it('un 503 momentáneo en el refresh se supera con el reintento', async () => {
    vi.useFakeTimers()
    vi.mocked(authApi.refresh)
      .mockRejectedValueOnce(new ApiError('Servicio no disponible', 503))
      .mockResolvedValueOnce(session('recuperado'))
    const auth = useAuthStore()

    const refreshing = auth.refreshSession()
    await vi.runAllTimersAsync()

    await expect(refreshing).resolves.toBe('recuperado')
    expect(auth.isAuthenticated).toBe(true)
  })

  it('si restoreSession falla por la conexión, la siguiente llamada lo vuelve a intentar', async () => {
    vi.useFakeTimers()
    vi.mocked(authApi.refresh)
      .mockRejectedValueOnce(new ApiError('Sin conexión', 0))
      .mockRejectedValueOnce(new ApiError('Sin conexión', 0))
      .mockRejectedValueOnce(new ApiError('Sin conexión', 0))
      .mockResolvedValueOnce(session('recuperado'))
    const auth = useAuthStore()

    const first = auth.restoreSession()
    await vi.runAllTimersAsync()
    await first
    expect(auth.initialized).toBe(true)
    expect(auth.isAuthenticated).toBe(false)

    await auth.restoreSession()
    expect(auth.accessToken).toBe('recuperado')
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
