export type Node<S> = (s: S) => Promise<Partial<S> | void>;
export type Router<S> = (s: S) => string | { next: string; reason?: string } | 'END';

export type Hooks<S> = {
  onEnter?: (id: string, s: S) => void;
  onExit?: (id: string, s: S, delta?: Partial<S> | void) => void;
  onEdge?: (from: string, to: string, s: S) => void;
};

export class Graph<S> {
  private nodes = new Map<string, Node<S>>();
  private edges = new Map<string, Router<S>>();

  constructor(private hooks: Hooks<S> = {}) {}

  addNode(id: string, fn: Node<S>) {
    this.nodes.set(id, fn);
    return this;
  }
  addEdge(from: string, router: Router<S>) {
    this.edges.set(from, router);
    return this;
  }

  async run(start: string, state: S, maxSteps = 64): Promise<S> {
    let current = start;
    let s = structuredClone(state);
    for (let i = 0; i < maxSteps && current !== 'END'; i++) {
      this.hooks.onEnter?.(current, s);
      const delta = await this.nodes.get(current)!(s);
      if (delta) Object.assign(s as any, deepMerge(s, delta));
      this.hooks.onExit?.(current, s, delta);
      const r = this.edges.get(current)!(s);
      if (r === 'END') break;
      const to = typeof r === 'string' ? r : r.next;
      this.hooks.onEdge?.(current, to, s);
      current = to;
    }
    return s;
  }
}

// trivial deep merge for plain objects
function deepMerge<T>(a: T, b: Partial<T>) {
  return Object.assign({}, a, b);
}
