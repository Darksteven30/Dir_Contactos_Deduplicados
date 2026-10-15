import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../errors'
import { createHttpClient, type AuthHooks } from '../http'

type Reply = { status: number; data?: unknown } | 'network-error'

// Servidor falso: responde según `handler` y registra cada petición que recibe.
function fakeServer(handler: (config: InternalAxiosRequestConfig) => Reply) {
  const calls: InternalAxiosRequestConfig[] = []
  // Axios reutiliza el mismo config al reintentar: el header se copia en el momento de cada llamada.
  const sentTokens: unknown[] = []
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config)
    sentTokens.push(config.headers.get('Authorization'))
    const reply = handler(config)
    if (reply === 'network-error') throw new AxiosError('Network Error', 'ERR_NETWORK', config)
    const response = {
      status: reply.status,
      statusText: '',
      data: reply.data ?? {},
      headers: {},
      config,
    }
    if (reply.status >= 400) {
      throw new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, undefined, response)
    }
    return response
  }
  return { adapter, calls, sentTokens }
}

function authHooks(initialToken: string | null = 'viejo', refreshedToken: string | null = 'nuevo') {
  let token = initialToken
  const hooks: AuthHooks = {
    getAccessToken: () => token,
    refreshSession: vi.fn<AuthHooks['refreshSession']>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      token = refreshedToken
      return refreshedToken
    }),
    onSessionExpired: vi.fn<AuthHooks['onSessionExpired']>(),
  }
  return hooks
}

const authorization = (config: InternalAxiosRequestConfig | undefined) =>
  config?.headers.get('Authorization')

describe('createHttpClient', () => {
  it('agrega el access token y un correlation id a cada petición', async () => {
    const server = fakeServer(() => ({ status: 200 }))
    const http = createHttpClient(authHooks(), { adapter: server.adapter })

    await http.get('/contacts')

    expect(authorization(server.calls[0])).toBe('Bearer viejo')
    expect(server.calls[0]?.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('ante un 401 renueva la sesión y repite la petición con el token nuevo', async () => {
    const server = fakeServer((config) =>
      authorization(config) === 'Bearer nuevo'
        ? { status: 200, data: { ok: true } }
        : { status: 401 },
    )
    const hooks = authHooks()
    const http = createHttpClient(hooks, { adapter: server.adapter })

    const res = await http.get('/contacts')

    expect(res.data).toEqual({ ok: true })
    expect(hooks.refreshSession).toHaveBeenCalledTimes(1)
    expect(server.sentTokens).toEqual(['Bearer viejo', 'Bearer nuevo'])
  })

  it('renueva la sesión una sola vez aunque varias peticiones reciban 401 a la vez', async () => {
    const server = fakeServer((config) =>
      authorization(config) === 'Bearer nuevo' ? { status: 200 } : { status: 401 },
    )
    const hooks = authHooks()
    const http = createHttpClient(hooks, { adapter: server.adapter })

    await Promise.all([http.get('/a'), http.get('/b'), http.get('/c')])

    expect(hooks.refreshSession).toHaveBeenCalledTimes(1)
    expect(server.calls).toHaveLength(6)
  })

  it('si la sesión no se puede renovar avisa que expiró y rechaza con ApiError 401', async () => {
    const server = fakeServer(() => ({
      status: 401,
      data: { success: false, message: 'Token vencido' },
    }))
    const hooks = authHooks('viejo', null)
    const http = createHttpClient(hooks, { adapter: server.adapter })

    const error = await http.get('/contacts').catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, message: 'Token vencido' })
    expect(hooks.onSessionExpired).toHaveBeenCalledTimes(1)
    expect(server.calls).toHaveLength(1)
  })

  it('no intenta renovar en las rutas marcadas con skipAuthRefresh (p. ej. login)', async () => {
    const server = fakeServer(() => ({
      status: 401,
      data: { success: false, message: 'Email o contraseña incorrectos' },
    }))
    const hooks = authHooks()
    const http = createHttpClient(hooks, { adapter: server.adapter })

    await expect(http.post('/auth/login', {}, { skipAuthRefresh: true })).rejects.toMatchObject({
      status: 401,
      message: 'Email o contraseña incorrectos',
    })
    expect(hooks.refreshSession).not.toHaveBeenCalled()
    expect(hooks.onSessionExpired).not.toHaveBeenCalled()
  })

  it('reintenta las lecturas ante fallos transitorios con backoff exponencial', async () => {
    let attempts = 0
    const server = fakeServer(() => (++attempts < 3 ? { status: 503 } : { status: 200 }))
    const delays: number[] = []
    const http = createHttpClient(authHooks(), {
      adapter: server.adapter,
      retryDelayMs: 100,
      sleep: async (ms) => void delays.push(ms),
    })

    await http.get('/contacts')

    expect(server.calls).toHaveLength(3)
    expect(delays).toEqual([100, 200])
  })

  it('nunca repite sola una petición que modifica datos', async () => {
    const server = fakeServer(() => ({ status: 503 }))
    const http = createHttpClient(authHooks(), {
      adapter: server.adapter,
      sleep: async () => undefined,
    })

    await expect(http.post('/contacts', {})).rejects.toMatchObject({ status: 503 })
    expect(server.calls).toHaveLength(1)
  })

  it('deja de reintentar al agotar los intentos', async () => {
    const server = fakeServer(() => 'network-error')
    const http = createHttpClient(authHooks(), {
      adapter: server.adapter,
      maxRetries: 2,
      sleep: async () => undefined,
    })

    const error = await http.get('/contacts').catch((err: unknown) => err)

    expect(server.calls).toHaveLength(3)
    expect(error).toMatchObject({
      status: 0,
      message: expect.stringContaining('No se pudo conectar'),
    })
  })

  it('expone los errores de validación por campo de un 400', async () => {
    const server = fakeServer(() => ({
      status: 400,
      data: { success: false, message: 'Datos inválidos', details: { email: ['Email inválido'] } },
    }))
    const http = createHttpClient(authHooks(), { adapter: server.adapter })

    const error = await http.post('/auth/register', {}).catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).fieldErrors).toEqual({ email: ['Email inválido'] })
  })
})
