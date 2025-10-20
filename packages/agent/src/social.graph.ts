import { StateGraph, END } from '@langchain/langgraph';

type NodeState = { prompt?: string; config?: any; logs?: any[]; output?: any };
const plan = async (s?: NodeState): Promise<NodeState> => s ?? { logs: [] };
const configure = async (s?: NodeState): Promise<NodeState> => ({
  ...(s ?? ({} as NodeState)),
  config: s?.config ?? { platform: 'linkedin', time: '2025-10-18T07:00:00Z' },
});
const authorize = async (s?: NodeState): Promise<NodeState> => s ?? { logs: [] }; // TODO: BYOK token minting
const execute = async (s?: NodeState): Promise<NodeState> => {
  const logs = [
    ...(s?.logs ?? []),
    {
      ts: new Date().toISOString(),
      tool: 'linkedin',
      action: 'scheduled',
      result: { id: 'ln_123' },
    },
  ];
  return { ...(s ?? ({} as NodeState)), logs, output: { ok: true, id: 'ln_123' } };
};
export function buildSocialGraph() {
  // Minimal graph; channel configuration not required for this simple state
  return new StateGraph<NodeState>({} as any)
    .addNode('plan', plan)
    .addNode('config', configure)
    .addNode('authorize', authorize)
    .addNode('execute', execute)
    .addEdge('plan', 'config')
    .addEdge('config', 'authorize')
    .addEdge('authorize', 'execute')
    .addEdge('execute', END)
    .compile();
}
