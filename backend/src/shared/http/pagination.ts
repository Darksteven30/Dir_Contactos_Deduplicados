// Contrato común de paginación por página/tamaño.
export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Page<T> extends PageRequest {
  items: T[];
  total: number;
}

export function pageOffset({ page, pageSize }: PageRequest): number {
  return (page - 1) * pageSize;
}
