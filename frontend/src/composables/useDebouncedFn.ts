import { onScopeDispose } from 'vue'

/**
 * Ejecuta `fn` solo cuando pasan `ms` milisegundos sin nuevas llamadas (p. ej. al terminar de
 * escribir), para no hacer una petición por cada tecla. Se cancela solo al desmontar el componente.
 */
export function useDebouncedFn<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined

  const cancel = (): void => clearTimeout(timer)
  const run = (...args: A): void => {
    cancel()
    timer = setTimeout(() => fn(...args), ms)
  }

  onScopeDispose(cancel)
  return { run, cancel }
}
