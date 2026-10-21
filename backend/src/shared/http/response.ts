// Contrato de respuesta común de la API.
export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  message: string;
  details?: unknown;
  /** Id de la petición (header x-correlation-id), para rastrearla en los logs. */
  correlationId?: string;
}

export function ok<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}
