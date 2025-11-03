// Lazy import to avoid loading dependency unless configured (ESM-safe)
let _langfuse: any | null | undefined;
let _initPromise: Promise<any | null> | null = null;

async function init(): Promise<any | null> {
  if (_langfuse !== undefined) return _langfuse; // already initialized
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const baseUrl = process.env.LANGFUSE_HOST || process.env.LANGFUSE_BASE_URL;

    if (!publicKey || !secretKey) {
      _langfuse = null; // explicitly disabled
      return _langfuse;
    }

    try {
      const mod = await import('langfuse');
      const LangfuseCtor = (mod as any).Langfuse ?? (mod as any).default?.Langfuse ?? (mod as any);
      _langfuse = new LangfuseCtor({ publicKey, secretKey, baseUrl });
    } catch (err) {
      _langfuse = null;
      if (process.env.NODE_ENV !== 'production') {
        console.error('Langfuse init failed', err);
      }
    }
    return _langfuse;
  })();

  return _initPromise;
}

export async function logLlmGeneration(args: {
  runId?: string;
  userId?: string | number;
  teamId?: string | number;
  requestType?: string;
  apiEndpoint?: string;
  model?: string;
  system?: string;
  user?: string;
  completion: string;
  usage?:
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | Record<string, any>;
}): Promise<void> {
  const lf = await init();
  if (!lf) return; // not configured

  const name = args.requestType ?? 'llm.call';
  const endpoint = args.apiEndpoint ?? 'chat.completions.create';
  const usage = args.usage ?? {};

  const trace = args.runId ? lf.trace({ id: args.runId, name }) : lf.trace({ name });

  trace.generation({
    name: endpoint,
    model: args.model,
    input: {
      system: args.system,
      user: args.user,
    },
    output: args.completion,
    usage: {
      input: usage.prompt_tokens,
      output: usage.completion_tokens,
      total: usage.total_tokens,
    },
    metadata: {
      userId: args.userId,
      teamId: args.teamId,
    },
  });

  // Flush in background; don't block caller
  void lf.flushAsync?.();
}
