import { Injectable } from '@nestjs/common';
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';

import { compileApp } from './graph.js';
import {
  setToolExecutionContext,
  getToolExecutionContext,
  type ToolExecutionContext,
} from './tools.js';

export interface RunAgentCallbacks {
  onPlanGenerated?: (plan: { tools: string[]; intent: string }) => void;
  onToolStarted?: (tool: string, args: any) => void;
  onToolCompleted?: (tool: string, result: string) => void;
  onCompleted?: (finalMessage: string) => void;
}

@Injectable()
export class AgentService {
  /**
   * Execute the agent once and return the formatted outputs.
   */
  async runAgent(prompt: string): Promise<string[]> {
    const app = compileApp();
    const res = await app.invoke({ messages: [new HumanMessage(prompt)] });
    return res.messages.map((m: any) =>
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    );
  }

  /**
   * Execute the agent while emitting lifecycle callbacks.
   */
  async runAgentWithEvents(
    prompt: string,
    callbacks: RunAgentCallbacks = {},
  ): Promise<{
    messages: any[];
    finalOutput: string | null;
  }> {
    const app = compileApp();
    const res = await app.invoke({ messages: [new HumanMessage(prompt)] });

    let finalOutput: string | null = null;

    for (const msg of res.messages) {
      if (AIMessage.isInstance(msg) && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        const tools = msg.tool_calls.map((tc: any) => tc.name);
        callbacks.onPlanGenerated?.({
          tools,
          intent: prompt,
        });

        for (const toolCall of msg.tool_calls) {
          callbacks.onToolStarted?.(toolCall.name, toolCall.args);
        }
      }

      if (ToolMessage.isInstance(msg)) {
        callbacks.onToolCompleted?.(
          msg.tool_call_id || 'unknown',
          typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        );
      }

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

  /**
   * Update the shared tool execution context used by LangChain tools.
   */
  setToolExecutionContext(context: ToolExecutionContext | null): void {
    setToolExecutionContext(context);
  }

  getToolExecutionContext(): ToolExecutionContext | null {
    return getToolExecutionContext();
  }
}
