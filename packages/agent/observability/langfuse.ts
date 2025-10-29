// Lazy import to avoid requiring the dependency if not configured
let _langfuse: any | null | undefined;

function init() {
  if (_langfuse !== undefined) return _langfuse; // already initialized

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_HOST || process.env.LANGFUSE_BASE_URL;

  if (!publicKey || !secretKey) {
    _langfuse = null; // explicitly disabled
    return _langfuse;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Langfuse } = require('langfuse');
  _langfuse = new Langfuse({ publicKey, secretKey, baseUrl });
  return _langfuse;
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
  const lf = init();
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
