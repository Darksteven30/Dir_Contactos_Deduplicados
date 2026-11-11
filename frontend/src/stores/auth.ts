import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi } from '@/api/auth'
import { ApiError, toApiError } from '@/api/errors'
import type { AuthSession, LoginCredentials, RegisterData, User } from '@/types/api'
import { useContactsStore } from './contacts'
import { useDuplicatesStore } from './duplicates'

/** Esperas antes de reintentar la renovación de la sesión cuando falla la conexión o el servidor. */
export const REFRESH_RETRY_DELAYS_MS = [500, 1500] as const

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Sin respuesta (0) o servidor caído (5xx): el refresh token puede seguir siendo válido.
const isTransient = (error: ApiError) => error.status === 0 || error.status >= 500

/**
 * Sesión del usuario.
 *
 * El access token vive SOLO en memoria (en este store): nunca en localStorage ni sessionStorage,
 * donde un script inyectado (XSS) podría robarlo. Al recargar la página se pierde y se recupera
 * con `restoreSession()`, que usa la cookie HttpOnly del refresh token (inaccesible para JavaScript).
 * Por eso este store no se persiste.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(null)
  /** Hay un login, registro o cierre de sesión en curso. */
  const pending = ref(false)
  /** Error de la última acción de login o registro. */
  const error = ref<ApiError | null>(null)
  /** Ya se intentó recuperar la sesión al abrir la aplicación. */
  const initialized = ref(false)

  const isAuthenticated = computed(() => accessToken.value !== null && user.value !== null)

  let restoring: Promise<void> | null = null

  // Los datos cargados pertenecen al usuario de la sesión: al cerrarla o cambiar de usuario se
  // descartan, para que quien entre después en el mismo navegador no vea los contactos del anterior.
  function resetUserData(): void {
    useContactsStore().reset()
    useDuplicatesStore().reset()
  }

  function setSession(session: AuthSession): void {
    if (user.value && user.value.id !== session.user.id) resetUserData()
    accessToken.value = session.accessToken
    user.value = session.user
  }

  function clearSession(): void {
    accessToken.value = null
    user.value = null
    resetUserData()
  }

  // Envuelve login/registro/logout: marca la carga y guarda el error para mostrarlo en la vista.
  async function track(action: () => Promise<void>): Promise<boolean> {
    pending.value = true
    error.value = null
    try {
      await action()
      return true
    } catch (err) {
      error.value = toApiError(err)
      return false
    } finally {
      pending.value = false
    }
  }

  function login(credentials: LoginCredentials): Promise<boolean> {
    return track(async () => setSession(await authApi.login(credentials)))
  }

  function register(data: RegisterData): Promise<boolean> {
    return track(async () => setSession(await authApi.register(data)))
  }

  async function logout(): Promise<void> {
    pending.value = true
    try {
      await authApi.logout()
    } catch {
      // Aunque el servidor no responda, la sesión local se cierra igual.
    } finally {
      clearSession()
      pending.value = false
    }
  }

  /** Cierra todas las sesiones. Si el servidor falla se lanza el error y la sesión local se conserva. */
  async function logoutAll(): Promise<void> {
    pending.value = true
    try {
      await authApi.logoutAll()
      clearSession()
    } finally {
      pending.value = false
    }
  }

  /**
   * Pide un access token nuevo con la cookie del refresh token. La usa el cliente HTTP cuando
   * el token vence (401). Devuelve el token, o null si el servidor rechazó la sesión.
   * Ante un fallo de conexión o del servidor reintenta con backoff y, si persiste, lanza el
   * ApiError sin cerrar la sesión: un corte momentáneo no debe sacar al usuario.
   */
  async function refreshSession(): Promise<string | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        const session = await authApi.refresh()
        setSession(session)
        return session.accessToken
      } catch (err) {
        const apiError = toApiError(err)
        if (!isTransient(apiError)) {
          clearSession()
          return null
        }
        const delay = REFRESH_RETRY_DELAYS_MS[attempt]
        if (delay === undefined) throw apiError
        await wait(delay)
      }
    }
  }

  /**
   * Recupera la sesión al abrir o recargar la app. Se ejecuta una sola vez aunque se llame varias;
   * si falló por la conexión, la siguiente navegación lo vuelve a intentar.
   */
  function restoreSession(): Promise<void> {
    restoring ??= refreshSession()
      .then(() => undefined)
      .catch(() => {
        restoring = null
      })
      .finally(() => {
        initialized.value = true
      })
    return restoring
  }

  function clearError(): void {
    error.value = null
  }

  return {
    user,
    accessToken,
    pending,
    error,
    initialized,
    isAuthenticated,
    login,
    register,
    logout,
    logoutAll,
    refreshSession,
    restoreSession,
    clearSession,
    clearError,
  }
})
