// Contratos de la API del backend. Deben coincidir con las respuestas de Express.

/** Respuesta exitosa: `{ success: true, data }`. */
export interface ApiSuccess<T> {
  success: true
  data: T
}

/** Respuesta de error: `{ success: false, message, details?, correlationId? }`. */
export interface ApiErrorBody {
  success: false
  message: string
  details?: unknown
  correlationId?: string
}

export type Role = 'user' | 'admin'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  createdAt: string
}

/** Sesión que devuelven login, registro y refresh. El refresh token viaja aparte, en una cookie HttpOnly. */
export interface AuthSession {
  accessToken: string
  tokenType: 'Bearer'
  /** Segundos de vida del access token. */
  expiresIn: number
  user: User
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  name: string
  email: string
  password: string
}
