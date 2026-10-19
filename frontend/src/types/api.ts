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

// ---- Contactos ----

/** Datos que el usuario captura. Los opcionales viajan como null cuando están vacíos. */
export interface ContactInput {
  fullName: string
  email: string | null
  phone: string | null
  company: string | null
  notes: string | null
}

export interface Contact extends ContactInput {
  id: number
  ownerId: number
  /** Versión para el bloqueo optimista: se envía al editar. */
  version: number
  createdAt: string
  updatedAt: string
}

/** Resultado de la búsqueda difusa: score de 0 a 1 (1 = coincidencia total). */
export interface ScoredContact extends Contact {
  score: number
}

export interface PageRequest {
  page: number
  pageSize: number
}

export interface Page<T> extends PageRequest {
  total: number
  items: T[]
}

/** Detalle de por qué dos contactos parecen la misma persona. */
export interface ContactMatch {
  score: number
  nameSimilarity: number
  /** null si alguno de los dos no tiene email. */
  emailMatch: boolean | null
  phoneMatch: boolean | null
}

/** Contacto existente parecido a uno que se está creando. */
export interface SimilarContact {
  contact: Contact
  match: ContactMatch
}

/** Cuerpo del 409 al editar: la versión vigente del contacto, para resolver el conflicto. */
export interface ContactConflictDetails {
  current: Contact
}
