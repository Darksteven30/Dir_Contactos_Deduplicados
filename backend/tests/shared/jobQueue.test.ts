import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/shared/logging/logger';
import { getCorrelationId, runWithContext } from '../../src/shared/logging/requestContext';
import { InMemoryJobQueue, QueueClosedError } from '../../src/shared/queue/jobQueue';
import { silentLogger } from '../support/inMemoryRepositories';

// Registra las esperas en lugar de dormir, para que las pruebas sean instantáneas.
function recordingSleep() {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number) => void delays.push(ms) };
}

describe('InMemoryJobQueue', () => {
  it('ejecuta los trabajos en orden de llegada', async () => {
    const queue = new InMemoryJobQueue(silentLogger);
    const order: string[] = [];

    queue.enqueue('a', async () => void order.push('a'));
    queue.enqueue('b', async () => void order.push('b'));
    queue.enqueue('c', async () => void order.push('c'));
    await queue.onIdle();

    expect(order).toEqual(['a', 'b', 'c']);
    expect(queue.stats()).toEqual({ pending: 0, running: 0, completed: 3, failed: 0 });
  });

  it('no ejecuta más trabajos a la vez que la concurrencia indicada', async () => {
    const queue = new InMemoryJobQueue(silentLogger, { concurrency: 2 });
    let running = 0;
    let maxRunning = 0;
    const job = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    };

    for (let i = 0; i < 6; i++) queue.enqueue('job', job);
    await queue.onIdle();

    expect(maxRunning).toBe(2);
  });

  it('reintenta con backoff exponencial hasta que el trabajo funciona', async () => {
    const { delays, sleep } = recordingSleep();
    const queue = new InMemoryJobQueue(silentLogger, { maxAttempts: 4, baseDelayMs: 100, sleep });
    let attempts = 0;

    queue.enqueue('inestable', async () => {
      attempts++;
      if (attempts < 3) throw new Error('falla temporal');
    });
    await queue.onIdle();

    expect(attempts).toBe(3);
    expect(delays).toEqual([100, 200]);
    expect(queue.stats().completed).toBe(1);
  });

  it('da el trabajo por fallido al agotar los reintentos sin detener la cola', async () => {
    const { delays, sleep } = recordingSleep();
    const queue = new InMemoryJobQueue(silentLogger, { maxAttempts: 3, baseDelayMs: 50, sleep });
    let after = false;

    queue.enqueue('roto', async () => {
      throw new Error('siempre falla');
    });
    queue.enqueue('siguiente', async () => {
      after = true;
    });
    await queue.onIdle();

    expect(delays).toEqual([50, 100]);
    expect(after).toBe(true);
    expect(queue.stats()).toMatchObject({ completed: 1, failed: 1 });
  });

  it('ejecuta el trabajo con el correlation id de quien lo encoló', async () => {
    const queue = new InMemoryJobQueue(silentLogger);
    let seen: string | undefined;

    runWithContext({ correlationId: 'peticion-123' }, () =>
      queue.enqueue('job', async () => {
        seen = getCorrelationId();
      }),
    );
    await queue.onIdle();

    expect(seen).toBe('peticion-123');
  });

  it('registra en los logs los reintentos y el resultado, con el correlation id', async () => {
    const lines: Array<Record<string, unknown>> = [];
    const logger = createLogger({ level: 'info' }, { write: (line: string) => void lines.push(JSON.parse(line)) });
    const queue = new InMemoryJobQueue(logger, { maxAttempts: 2, sleep: async () => undefined });
    let attempts = 0;

    runWithContext({ correlationId: 'abc' }, () =>
      queue.enqueue('limpieza', async () => {
        if (++attempts === 1) throw new Error('falla temporal');
      }),
    );
    await queue.onIdle();

    expect(lines.map((line) => [line.msg, line.job, line.correlationId])).toEqual([
      ['Trabajo fallido: se reintentará', 'limpieza', 'abc'],
      ['Trabajo completado', 'limpieza', 'abc'],
    ]);
  });

  it('al detenerse espera los trabajos pendientes y rechaza los nuevos', async () => {
    const queue = new InMemoryJobQueue(silentLogger);
    let done = false;
    queue.enqueue('lento', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      done = true;
    });

    await queue.stop();

    expect(done).toBe(true);
    expect(() => queue.enqueue('tarde', async () => undefined)).toThrow(QueueClosedError);
  });
});
