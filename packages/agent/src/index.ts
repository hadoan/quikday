import 'dotenv/config';
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
export { compileApp } from './graph.js';
export * from './prompts.js';

/**
 * Run the agent for a single user prompt and return assistant/tool outputs as strings.
 */
export async function runAgent(prompt: string): Promise<string[]> {
  const { compileApp } = await import('./graph.js');
  const app = compileApp();
  const res = await app.invoke({ messages: [new HumanMessage(prompt)] });
  return res.messages.map((m: any) =>
    typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  );
}

/**
 * Run the agent with event callbacks for real-time updates.
 * Emits events for plan generation, tool execution, and completion.
 */
export async function runAgentWithEvents(
  prompt: string,
  callbacks: {
    onPlanGenerated?: (plan: { tools: string[]; intent: string }) => void;
    onToolStarted?: (tool: string, args: any) => void;
    onToolCompleted?: (tool: string, result: string) => void;
    onCompleted?: (finalMessage: string) => void;
  }
): Promise<{
  messages: any[];
  finalOutput: string | null;
}> {
  const { compileApp } = await import('./graph.js');
  const app = compileApp();
  const res = await app.invoke({ messages: [new HumanMessage(prompt)] });

  // Parse messages to emit events
  let finalOutput: string | null = null;
  const toolsUsed: string[] = [];

  for (let i = 0; i < res.messages.length; i++) {
    const msg = res.messages[i];

    // AI Message with tool calls = plan generated
    if (AIMessage.isInstance(msg) && msg.tool_calls && msg.tool_calls.length > 0) {
      const tools = msg.tool_calls.map((tc: any) => tc.name);
      toolsUsed.push(...tools);
      callbacks.onPlanGenerated?.({
        tools,
        intent: prompt,
      });

      // Emit tool started events
      for (const toolCall of msg.tool_calls) {
        callbacks.onToolStarted?.(toolCall.name, toolCall.args);
      }
    }

    // Tool Message = tool completed
    if (ToolMessage.isInstance(msg)) {
      callbacks.onToolCompleted?.(
        msg.tool_call_id || 'unknown',
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      );
    }

    // Final AI Message without tool calls = completion
    if (
      AIMessage.isInstance(msg) &&
      (!msg.tool_calls || msg.tool_calls.length === 0) &&
      msg.content
    ) {
      finalOutput = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      callbacks.onCompleted?.(finalOutput);
    }
  }

  return {
    messages: res.messages,
    finalOutput,
  };
}
