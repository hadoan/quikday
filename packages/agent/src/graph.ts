import { StateGraph, START, END } from '@langchain/langgraph';
import { agentWithTools } from './agent.js';
import { tools } from './tools.js';
/** Use LangGraph's built-in messages channel + reducer. */
import { MessagesAnnotation } from '@langchain/langgraph';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { AGENT_SYSTEM_MESSAGE } from './prompts.js';
import { Logger } from '@nestjs/common';

const logger = new Logger('AgentGraph');

/** Agent node: ask the LLM what to do next. */
async function agentNode(state: typeof MessagesAnnotation.State) {
  logger.log('🤖 [Agent] ========== COMPLETE PROMPT TO OPENAI ==========');
  logger.debug(`🤖 [Agent] System Message: ${AGENT_SYSTEM_MESSAGE}`);
  logger.debug(`🤖 [Agent] User Messages: ${JSON.stringify(state.messages, null, 2)}`);
  logger.log(`🤖 [Agent] Message count: ${state.messages.length}`);
  logger.log(`🤖 [Agent] Available tools: ${tools.map((t) => t.name).join(', ')}`);
  logger.log('🤖 [Agent] ================================================');

  const result = await agentWithTools.invoke({ messages: state.messages });

  logger.log('🤖 [Agent] ========== OPENAI RESPONSE ==========');
  logger.debug(`🤖 [Agent] Response: ${JSON.stringify(result, null, 2)}`);
  logger.log(`🤖 [Agent] Has tool calls: ${!!(result as any).tool_calls?.length}`);
  if ((result as any).tool_calls?.length) {
    logger.debug(`🤖 [Agent] Tool calls: ${JSON.stringify((result as any).tool_calls, null, 2)}`);
  }
  logger.log('🤖 [Agent] ======================================');

  return { messages: [result] };
}
/** Router: if the last message has tool calls, go to tools; otherwise END. */
function shouldContinue(state: typeof MessagesAnnotation.State) {
  const last = state.messages[state.messages.length - 1];
  if (!last) return END;
  const hasToolCalls =
    AIMessage.isInstance(last) && Array.isArray(last.tool_calls) && last.tool_calls.length > 0;
  return hasToolCalls ? 'tools' : END;
}
/** Compile the app graph. */
async function toolsNode(state: typeof MessagesAnnotation.State) {
  const last = state.messages[state.messages.length - 1];
  if (!last || !AIMessage.isInstance(last) || !Array.isArray(last.tool_calls)) {
    return { messages: [] };
  }
  const toolMap = new Map(tools.map((t) => [t.name, t] as const));
  const results = await Promise.all(
    last.tool_calls.map(async (call) => {
      const tool = toolMap.get(call.name);
      const id = call.id ?? call.name;

      // Helper to stringify with truncation for logs
      const safeStr = (v: unknown, max = 800) => {
        try {
          const s = typeof v === 'string' ? v : JSON.stringify(v);
          return s.length > max ? `${s.slice(0, max)}…(truncated)` : s;
        } catch {
          return '[unserializable]';
        }
      };

      if (!tool) {
        logger.warn(`🤖 [Agent] Tool not found: ${call.name} (id=${id})`);
        return new ToolMessage({
          content: `Tool not found: ${call.name}`,
          tool_call_id: id,
          status: 'error',
        });
      }

      const started = Date.now();
      logger.log(`🤖 [Agent] 🔧 Calling tool: ${call.name}`);
      logger.debug(`🤖 [Agent] 🔧 Tool call id: ${id}`);
      logger.debug(`🤖 [Agent] 🔧 Args: ${safeStr(call.args)}`);

      try {
        const output = await (tool as any).invoke(call.args as any);
        const duration = Date.now() - started;
        logger.log(`🤖 [Agent] 🔧 Tool '${call.name}' completed in ${duration}ms`);
        logger.debug(`🤖 [Agent] 🔧 Output: ${safeStr(output)}`);

        return new ToolMessage({
          content: typeof output === 'string' ? output : JSON.stringify(output),
          tool_call_id: id,
          status: 'success',
        });
      } catch (err) {
        const duration = Date.now() - started;
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`🤖 [Agent] 🔧 Tool '${call.name}' failed in ${duration}ms: ${message}`);
        return new ToolMessage({
          content: `Tool '${call.name}' error: ${message}`,
          tool_call_id: id,
          status: 'error',
        });
      }
    }),
  );
  return { messages: results };
}

export function compileApp() {
  const graph = new StateGraph(MessagesAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, ['tools', END])
    .addEdge('tools', 'agent');
  return graph.compile();
}
