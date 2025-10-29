// packages/agent/runtime/graph.ts

// ---- Public types ----
export type Node<S extends object, E = any> = (
  s: S,
  eventBus: E,
) => Promise<Partial<S> | NodeResult<S> | void>;

export type Router<S extends object> =
  | ((s: S) => string | { next: string; reason?: string } | 'END')
  | ((s: S) => 'END');

export type NodeResult<S extends object> = Partial<S> & {
  control?: 'PAUSE' | 'CONTINUE';
};

export type RunOutcome<S extends object> =
  | { state: S; control: 'CONTINUE' }
  | { state: S; control: 'PAUSE'; delta: Partial<S> };

// Optional hooks for observability
export type Hooks<S extends object> = {
  onEnter?: (id: string, s: S) => void;
  onExit?: (id: string, s: S, delta?: Partial<S> | NodeResult<S> | void) => void;
  onEdge?: (from: string, to: string, s: S) => void;
};

// ---- Graph runtime ----
export class Graph<S extends object, E> {
  private nodes = new Map<string, Node<S, E>>();
  private edges = new Map<string, Router<S>>();

  constructor(private hooks: Hooks<S> = {}) {}

  addNode(id: string, fn: Node<S, E>) {
    this.nodes.set(id, fn);
    return this;
  }

  addEdge(from: string, router: Router<S>) {
    this.edges.set(from, router);
    return this;
  }

  async run(start: string, state: S, eventBus: E, maxSteps = 64): Promise<S> {
    let current = start;
    // structuredClone keeps S shape at runtime; cast for TS
    let s = structuredClone(state) as S;

    for (let i = 0; i < maxSteps && current !== 'END'; i++) {
      this.hooks.onEnter?.(current, s);

      const node = this.nodes.get(current);
      if (!node) throw new Error(`Node not found: ${current}`);

      const delta = await node(s, eventBus);

      // Handle PAUSE contract early; merge non-control fields before returning
      if (
        delta &&
        typeof delta === 'object' &&
        'control' in delta &&
        (delta as any).control === 'PAUSE'
      ) {
        const { control: _c, ...rest } = delta as NodeResult<S>;
        if (Object.keys(rest).length > 0) {
          s = shallowMerge(s, rest as Partial<S>);
        }
        break; // treat PAUSE as an immediate END; callers can inspect s
      }

      // Normal merge path
      if (delta) {
        s = shallowMerge(s, delta as Partial<S>);
      }

      this.hooks.onExit?.(current, s, delta);

      const router = this.edges.get(current);
      if (!router) throw new Error(`Router not found for node: ${current}`);

      const r = router(s);
      if (r === 'END') break;

      const to = typeof r === 'string' ? r : r.next;
      this.hooks.onEdge?.(current, to, s);
      current = to;
    }

    return s;
  }
}

// ---- Helpers ----

// super lightweight shallow merge suitable for state objects
function shallowMerge<T extends object>(a: T, b: Partial<T>): T {
  // Use spread to keep typings simple and avoid Object.assign issues
  return { ...(a as any), ...(b as any) } as T;
}
