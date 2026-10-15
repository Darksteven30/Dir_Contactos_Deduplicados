import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi } from '@/api/auth'
import { ApiError, toApiError } from '@/api/errors'
import type { AuthSession, LoginCredentials, RegisterData, User } from '@/types/api'

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

  function setSession(session: AuthSession): void {
    accessToken.value = session.accessToken
    user.value = session.user
  }

  function clearSession(): void {
    accessToken.value = null
    user.value = null
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
   * el token vence (401). Devuelve el token, o null si la sesión ya no es válida.
   */
  async function refreshSession(): Promise<string | null> {
    try {
      const session = await authApi.refresh()
      setSession(session)
      return session.accessToken
    } catch {
      clearSession()
      return null
    }
  }

  /** Recupera la sesión al abrir o recargar la app. Se ejecuta una sola vez aunque se llame varias. */
  function restoreSession(): Promise<void> {
    restoring ??= refreshSession().then(() => {
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
