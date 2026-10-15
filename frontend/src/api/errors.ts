import axios from 'axios'
import type { ApiErrorBody } from '@/types/api'

/** Errores de validación por campo, como los devuelve el backend en `details` (status 400). */
export type FieldErrors = Record<string, string[]>

/**
 * Error normalizado de la API. Toda llamada al backend que falla se convierte en un ApiError,
 * así los stores y las vistas manejan un único tipo de error.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    /** Código HTTP; 0 si no hubo respuesta (sin conexión, servidor caído). */
    readonly status: number,
    readonly details?: unknown,
    /** Id de la petición en los logs del backend (header x-correlation-id). */
    readonly correlationId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** Errores por campo de un 400 de validación (vacío en otros casos). */
  get fieldErrors(): FieldErrors {
    if (this.status !== 400 || !isFieldErrors(this.details)) return {}
    return this.details
  }
}

function isFieldErrors(value: unknown): value is FieldErrors {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every(
      (messages) => Array.isArray(messages) && messages.every((m) => typeof m === 'string'),
    )
  )
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  )
}

const NETWORK_ERROR = 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
const UNEXPECTED_ERROR = 'Ocurrió un error inesperado. Intenta de nuevo.'

/** Convierte cualquier error de una petición en un ApiError con un mensaje para el usuario. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (!axios.isAxiosError(error)) return new ApiError(UNEXPECTED_ERROR, 0)

  const response = error.response
  if (!response) return new ApiError(NETWORK_ERROR, 0)

  const correlationId = response.headers['x-correlation-id']
  const body: unknown = response.data
  if (isApiErrorBody(body)) {
    return new ApiError(body.message, response.status, body.details, body.correlationId)
  }
  return new ApiError(
    UNEXPECTED_ERROR,
    response.status,
    undefined,
    typeof correlationId === 'string' ? correlationId : undefined,
  )
}
