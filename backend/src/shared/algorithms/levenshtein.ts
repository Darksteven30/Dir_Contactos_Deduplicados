/**
 * Distancia de Levenshtein: número mínimo de ediciones de un carácter (insertar, borrar o
 * sustituir) para convertir `a` en `b`. Ejemplo: "peres" -> "perez" = 1 (sustituir s por z).
 *
 * Programación dinámica: D[i][j] = distancia entre los primeros i caracteres de `a` y los
 * primeros j de `b`:
 *   D[i][0] = i,  D[0][j] = j
 *   D[i][j] = min(D[i-1][j] + 1,            // borrar a[i]
 *                 D[i][j-1] + 1,            // insertar b[j]
 *                 D[i-1][j-1] + costo)      // sustituir (costo 0 si a[i] === b[j])
 *
 * Solo se guardan dos filas de la matriz: tiempo O(n·m), memoria O(min(n, m)).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;

  // Se itera sobre los code points (no sobre unidades UTF-16) para contar bien cualquier carácter.
  let longer = Array.from(a);
  let shorter = Array.from(b);
  if (longer.length < shorter.length) [longer, shorter] = [shorter, longer];
  if (shorter.length === 0) return longer.length;

  let previous = Array.from({ length: shorter.length + 1 }, (_, j) => j);
  let current = new Array<number>(shorter.length + 1).fill(0);

  for (let i = 1; i <= longer.length; i++) {
    current[0] = i;
    for (let j = 1; j <= shorter.length; j++) {
      const substitutionCost = longer[i - 1] === shorter[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + substitutionCost,
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[shorter.length]!;
}

/**
 * Similitud normalizada entre 0 y 1: 1 - distancia / longitud de la cadena más larga.
 * Ejemplo: "peres" vs "perez" -> 1 - 1/5 = 0.8.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLength = Math.max(Array.from(a).length, Array.from(b).length);
  if (maxLength === 0) return 1;
  return 1 - levenshtein(a, b) / maxLength;
}
