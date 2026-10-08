// Contrato de respuesta común de la API.
export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  message: string;
  details?: unknown;
}

export function ok<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}
