import type { ApiSuccess, AuthSession, LoginCredentials, RegisterData, User } from '@/types/api'
import { http } from './client'

// Las rutas de autenticación no deben disparar la renovación automática ante un 401:
// un 401 aquí significa credenciales incorrectas o sesión inválida, no un token vencido.
const AUTH_ROUTE = { skipAuthRefresh: true }

/** Funciones tipadas para `/api/auth`. Devuelven directamente el `data` de la respuesta. */
export const authApi = {
  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const { data } = await http.post<ApiSuccess<AuthSession>>(
      '/auth/login',
      credentials,
      AUTH_ROUTE,
    )
    return data.data
  },

  async register(input: RegisterData): Promise<AuthSession> {
    const { data } = await http.post<ApiSuccess<AuthSession>>('/auth/register', input, AUTH_ROUTE)
    return data.data
  },

  /** Usa la cookie HttpOnly del refresh token (el navegador la envía sola) y la rota. */
  async refresh(): Promise<AuthSession> {
    const { data } = await http.post<ApiSuccess<AuthSession>>(
      '/auth/refresh',
      undefined,
      AUTH_ROUTE,
    )
    return data.data
  },

  async logout(): Promise<void> {
    await http.post('/auth/logout', undefined, AUTH_ROUTE)
  },

  /** Cierra la sesión en todos los dispositivos (requiere access token). */
  async logoutAll(): Promise<void> {
    await http.post('/auth/logout-all')
  },

  async me(): Promise<User> {
    const { data } = await http.get<ApiSuccess<User>>('/auth/me')
    return data.data
  },
}
