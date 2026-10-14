import type { InMemoryJobQueue } from './jobQueue';

/**
 * Encola `run` en la cola ahora y luego cada `intervalMs`. La ejecución (reintentos, logs,
 * apagado ordenado) la maneja la cola. Devuelve una función para cancelar la programación.
 */
export function scheduleRecurring(
  queue: InMemoryJobQueue,
  name: string,
  intervalMs: number,
  run: () => Promise<void>,
): () => void {
  queue.enqueue(name, run);
  const timer = setInterval(() => queue.enqueue(name, run), intervalMs);
  // El temporizador no mantiene vivo el proceso por sí solo.
  timer.unref();
  return () => clearInterval(timer);
}
