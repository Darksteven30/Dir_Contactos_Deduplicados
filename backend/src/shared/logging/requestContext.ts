import { AsyncLocalStorage } from 'node:async_hooks';

// Datos de la operación en curso (una petición HTTP o un trabajo de la cola).
export interface RequestContext {
  correlationId: string;
}

/**
 * AsyncLocalStorage conserva el contexto a través de todo el flujo asíncrono (await, callbacks),
 * así cualquier log emitido mientras se atiende una petición lleva su correlation id sin tener
 * que pasarlo de función en función.
 */
const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
