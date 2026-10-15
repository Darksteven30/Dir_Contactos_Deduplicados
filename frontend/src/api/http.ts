import axios, {
  type AxiosAdapter,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import { toApiError } from './errors'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** No intentar renovar la sesión ante un 401 (lo usan las propias rutas de autenticación). */
    skipAuthRefresh?: boolean
  }
  interface InternalAxiosRequestConfig {
    /** Ya se reintentó tras renovar la sesión: un segundo 401 no vuelve a renovar. */
    authRetried?: boolean
    /** Reintentos ya hechos por errores de red o servidor no disponible. */
    retryCount?: number
  }
}

/** Puente con el store de autenticación (se conecta en main.ts para evitar dependencias circulares). */
export interface AuthHooks {
  getAccessToken: () => string | null
  /** Renueva la sesión con la cookie del refresh token; devuelve el nuevo access token o null. */
  refreshSession: () => Promise<string | null>
  /** La sesión no se pudo renovar: hay que volver a iniciar sesión. */
  onSessionExpired: () => void
}

export interface HttpClientOptions {
  baseURL?: string
  /** Reintentos automáticos de peticiones idempotentes ante fallos transitorios. */
  maxRetries?: number
  /** Espera antes del primer reintento; se duplica en cada uno (backoff exponencial). */
  retryDelayMs?: number
  /** Inyectables para las pruebas. */
  adapter?: AxiosAdapter
  sleep?: (ms: number) => Promise<void>
}

const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options'])
// Fallos transitorios: el servidor o el proxy no están disponibles en este momento.
const TRANSIENT_STATUSES = new Set([502, 503, 504])

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isTransientFailure(
  config: InternalAxiosRequestConfig,
  status: number | undefined,
): boolean {
  const idempotent = IDEMPOTENT_METHODS.has((config.method ?? 'get').toLowerCase())
  return idempotent && (status === undefined || TRANSIENT_STATUSES.has(status))
}

/**
 * Cliente HTTP tipado con interceptores:
 * - Petición: agrega `Authorization: Bearer <access token>` y un `x-correlation-id` para enlazar
 *   la petición con los logs del backend.
 * - Respuesta 401: renueva la sesión una sola vez (aunque fallen varias peticiones a la vez) y
 *   repite la petición original con el token nuevo. Si no se puede renovar, avisa que la sesión expiró.
 * - Fallos transitorios (sin conexión, 502/503/504) en peticiones idempotentes: reintenta con
 *   backoff exponencial. Las peticiones que modifican datos (POST, PUT, DELETE) nunca se repiten solas.
 * - Todo error se normaliza a `ApiError`.
 */
export function createHttpClient(auth: AuthHooks, options: HttpClientOptions = {}): AxiosInstance {
  const {
    baseURL = '/api',
    maxRetries = 2,
    retryDelayMs = 500,
    adapter,
    sleep = defaultSleep,
  } = options

  const http = axios.create({
    baseURL,
    // Necesario para que el navegador envíe la cookie HttpOnly del refresh token.
    withCredentials: true,
    timeout: 15_000,
    ...(adapter ? { adapter } : {}),
  })

  // Una sola renovación en curso: las peticiones que reciben 401 a la vez esperan la misma promesa.
  let refreshing: Promise<string | null> | null = null
  const refreshOnce = (): Promise<string | null> => {
    refreshing ??= auth.refreshSession().finally(() => {
      refreshing = null
    })
    return refreshing
  }

  http.interceptors.request.use((config) => {
    const token = auth.getAccessToken()
    if (token && !config.headers.has('Authorization')) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }
    if (!config.headers.has('x-correlation-id')) {
      config.headers.set('x-correlation-id', crypto.randomUUID())
    }
    return config
  })

  http.interceptors.response.use(undefined, async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) throw toApiError(error)

    const config = error.config
    const status = error.response?.status

    if (status === 401 && !config.skipAuthRefresh && !config.authRetried) {
      config.authRetried = true
      const token = await refreshOnce()
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`)
        return http.request(config)
      }
      auth.onSessionExpired()
      throw toApiError(error)
    }

    const attempt = config.retryCount ?? 0
    if (isTransientFailure(config, status) && attempt < maxRetries) {
      config.retryCount = attempt + 1
      await sleep(retryDelayMs * 2 ** attempt)
      return http.request(config)
    }

    throw toApiError(error)
  })

  return http
}
