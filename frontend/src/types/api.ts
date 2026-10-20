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

// ---- Duplicados y fusiones ----

export interface DuplicatePair extends ContactMatch {
  contactIds: [number, number]
}

/** Contactos que probablemente son la misma persona (agrupados de forma transitiva). */
export interface DuplicateGroup {
  /** Mayor puntaje entre los pares del grupo. */
  score: number
  /** El más completo (y el más antiguo si empatan): el que se conserva al fusionar. */
  suggestedPrimaryId: number
  /** Resultado de fusionar el grupo con el principal sugerido. */
  mergePreview: ContactInput
  contacts: Contact[]
  pairs: DuplicatePair[]
}

export interface VersionedContactRef {
  id: number
  version: number
}

export interface MergeRequest {
  primary: VersionedContactRef
  duplicates: VersionedContactRef[]
  /** Datos finales elegidos por el usuario; si se omiten, el backend los combina automáticamente. */
  contact?: ContactInput
}

/** Contacto tal como estaba antes de una fusión. */
export interface MergedContactSnapshot extends ContactInput {
  id: number
}

export interface ContactMerge {
  id: number
  primaryContactId: number
  mergedContactIds: number[]
  /** Todos los contactos (principal incluido) antes de fusionar. */
  before: MergedContactSnapshot[]
  createdAt: string
  /** null mientras la fusión siga vigente. */
  undoneAt: string | null
}

export interface MergeResult {
  merge: ContactMerge
  /** Contacto principal con los datos finales. */
  contact: Contact
}
