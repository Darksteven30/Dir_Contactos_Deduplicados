import { describe, expect, it } from 'vitest';
import { levenshtein, levenshteinSimilarity } from '../../src/shared/algorithms/levenshtein';
import { UnionFind } from '../../src/shared/algorithms/unionFind';

describe('levenshtein', () => {
  it.each([
    ['kitten', 'sitting', 3],
    ['peres', 'perez', 1],
    ['juan', 'jaun', 2],
    ['flaw', 'lawn', 2],
    ['', 'abc', 3],
    ['abc', '', 3],
    ['', '', 0],
    ['igual', 'igual', 0],
  ])('distancia("%s", "%s") = %i', (a, b, expected) => {
    expect(levenshtein(a, b)).toBe(expected);
  });

  it('es simétrica', () => {
    expect(levenshtein('gomez', 'gomes perez')).toBe(levenshtein('gomes perez', 'gomez'));
  });

  it('cuenta caracteres fuera del plano básico como uno solo', () => {
    expect(levenshtein('a😀b', 'ab')).toBe(1);
  });

  it('normaliza la similitud entre 0 y 1', () => {
    expect(levenshteinSimilarity('peres', 'perez')).toBeCloseTo(0.8);
    expect(levenshteinSimilarity('abc', 'xyz')).toBe(0);
    expect(levenshteinSimilarity('', '')).toBe(1);
  });
});

describe('UnionFind', () => {
  it('agrupa de forma transitiva', () => {
    const uf = new UnionFind();
    uf.union(1, 2);
    uf.union(2, 3);
    uf.union(7, 8);

    expect(uf.find(1)).toBe(uf.find(3));
    expect(uf.find(1)).not.toBe(uf.find(7));
    expect(uf.groups().sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))).toEqual([
      [1, 2, 3],
      [7, 8],
    ]);
  });

  it('une conjuntos ya formados', () => {
    const uf = new UnionFind();
    uf.union(1, 2);
    uf.union(3, 4);
    uf.union(4, 1);

    expect(uf.groups()).toEqual([[1, 2, 3, 4]]);
  });

  it('trata un elemento aislado como su propio grupo', () => {
    const uf = new UnionFind();
    uf.find(5);

    expect(uf.groups()).toEqual([[5]]);
  });
});
