/**
 * Union-Find (conjuntos disjuntos) para agrupar elementos relacionados transitivamente:
 * si A~B y B~C, entonces A, B y C quedan en el mismo grupo aunque A y C no se parezcan
 * directamente.
 *
 * Con compresión de caminos y unión por rango, cada operación cuesta O(α(n)), que en la
 * práctica es constante.
 */
export class UnionFind {
  private readonly parent = new Map<number, number>();
  private readonly rank = new Map<number, number>();

  /** Representante (raíz) del conjunto de `x`. Agrega `x` si no existía. */
  find(x: number): number {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
      return x;
    }

    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;

    // Compresión de caminos: todos los nodos recorridos apuntan directo a la raíz.
    let node = x;
    while (node !== root) {
      const next = this.parent.get(node)!;
      this.parent.set(node, root);
      node = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    // Unión por rango: el árbol más bajo cuelga del más alto para mantenerlos planos.
    const rankA = this.rank.get(rootA)!;
    const rankB = this.rank.get(rootB)!;
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  /** Conjuntos formados, cada uno con sus elementos en orden ascendente. */
  groups(): number[][] {
    const byRoot = new Map<number, number[]>();
    for (const x of this.parent.keys()) {
      const root = this.find(x);
      const members = byRoot.get(root);
      if (members) members.push(x);
      else byRoot.set(root, [x]);
    }
    return [...byRoot.values()].map((members) => members.sort((a, b) => a - b));
  }
}
