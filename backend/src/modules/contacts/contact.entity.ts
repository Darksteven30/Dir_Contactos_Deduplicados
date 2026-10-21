// Datos que el usuario captura de un contacto.
export interface ContactData {
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
}

// Representación pública del contacto (no expone las columnas normalizadas internas).
export interface Contact extends ContactData {
  id: number;
  ownerId: number;
  /** Versión para bloqueo optimista: se debe enviar al actualizar. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// Resultado de la búsqueda difusa: score entre 0 y 1 (1 = coincidencia total).
export interface ScoredContact extends Contact {
  score: number;
}
