import { randomUUID } from 'node:crypto';
import type { Logger } from '../logging/logger';
import { getCorrelationId, runWithContext } from '../logging/requestContext';

export interface JobQueueOptions {
  /** Trabajos que se ejecutan a la vez. */
  concurrency?: number;
  /** Intentos por trabajo antes de darlo por fallido. */
  maxAttempts?: number;
  /** Espera antes del primer reintento; se duplica en cada intento (backoff exponencial). */
  baseDelayMs?: number;
  /** Inyectable para las pruebas. */
  sleep?: (ms: number) => Promise<void>;
}

export interface JobQueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

interface Job {
  id: string;
  name: string;
  correlationId: string;
  run: () => Promise<void>;
}

export class QueueClosedError extends Error {
  constructor() {
    super('La cola está cerrada y no acepta trabajos nuevos');
    this.name = 'QueueClosedError';
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Cola de trabajos en memoria para tareas asíncronas que no deben bloquear la respuesta HTTP.
 *
 * - Ejecuta como máximo `concurrency` trabajos a la vez (FIFO).
 * - Reintenta los que fallan con backoff exponencial: baseDelayMs, 2×, 4×...
 * - Cada trabajo corre con el correlation id de quien lo encoló, así sus logs se enlazan con la petición.
 * - `stop()` deja de aceptar trabajos y espera a que terminen los pendientes (apagado ordenado).
 *
 * Los trabajos se pierden si el proceso se cae: sirve para tareas que se pueden repetir
 * (limpiezas, recálculos). Para tareas que no se pueden perder haría falta Redis o la base de datos.
 */
export class InMemoryJobQueue {
  private readonly pending: Job[] = [];
  private running = 0;
  private completed = 0;
  private failed = 0;
  private closed = false;
  private idleWaiters: Array<() => void> = [];

  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly logger: Logger,
    options: JobQueueOptions = {},
  ) {
    this.concurrency = options.concurrency ?? 1;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** Encola un trabajo y devuelve su id sin esperar a que se ejecute. */
  enqueue(name: string, run: () => Promise<void>): string {
    if (this.closed) throw new QueueClosedError();

    const job: Job = { id: randomUUID(), name, correlationId: getCorrelationId() ?? randomUUID(), run };
    this.pending.push(job);
    this.logger.debug({ jobId: job.id, job: name }, 'Trabajo encolado');
    this.pump();
    return job.id;
  }

  stats(): JobQueueStats {
    return { pending: this.pending.length, running: this.running, completed: this.completed, failed: this.failed };
  }

  /** Se resuelve cuando no quedan trabajos pendientes ni en ejecución. */
  onIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Deja de aceptar trabajos nuevos y espera a que terminen los que ya estaban encolados. */
  async stop(): Promise<void> {
    this.closed = true;
    await this.onIdle();
  }

  private isIdle(): boolean {
    return this.pending.length === 0 && this.running === 0;
  }

  private pump(): void {
    while (this.running < this.concurrency) {
      const job = this.pending.shift();
      if (!job) break;
      this.running++;
      void runWithContext({ correlationId: job.correlationId }, () => this.execute(job)).finally(() => {
        this.running--;
        this.pump();
        if (this.isIdle()) this.idleWaiters.splice(0).forEach((resolve) => resolve());
      });
    }
  }

  private async execute(job: Job): Promise<void> {
    const context = { jobId: job.id, job: job.name };

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const start = Date.now();
      try {
        await job.run();
        this.completed++;
        this.logger.info({ ...context, attempt, durationMs: Date.now() - start }, 'Trabajo completado');
        return;
      } catch (err) {
        if (attempt === this.maxAttempts) {
          this.failed++;
          this.logger.error({ ...context, attempt, err }, 'Trabajo fallido: se agotaron los reintentos');
          return;
        }
        const delayMs = this.baseDelayMs * 2 ** (attempt - 1);
        this.logger.warn({ ...context, attempt, delayMs, err }, 'Trabajo fallido: se reintentará');
        await this.sleep(delayMs);
      }
    }
  }
}
