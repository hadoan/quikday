import { StateGraph, START, END } from "@langchain/langgraph";
import { agentWithTools } from "./agent.js";
import { tools } from "./tools.js";
/** Use LangGraph's built-in messages channel + reducer. */
import { MessagesAnnotation } from "@langchain/langgraph";
import { AIMessage, ToolMessage } from "@langchain/core/messages";

/** Agent node: ask the LLM what to do next. */
async function agentNode(state: typeof MessagesAnnotation.State) {
  const result = await agentWithTools.invoke({ messages: state.messages });
  return { messages: [result] };
}
/** Router: if the last message has tool calls, go to tools; otherwise END. */
function shouldContinue(state: typeof MessagesAnnotation.State) {
  const last = state.messages[state.messages.length - 1];
  if (!last) return END;
  const hasToolCalls = AIMessage.isInstance(last) && Array.isArray(last.tool_calls) && last.tool_calls.length > 0;
  return hasToolCalls ? "tools" : END;
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
      if (!tool) {
        return new ToolMessage({
          content: `Tool not found: ${call.name}`,
          tool_call_id: call.id ?? call.name,
          status: "error",
        });
      }
      const output = await (tool as any).invoke(call.args as any);
      return new ToolMessage({
        content: typeof output === "string" ? output : JSON.stringify(output),
        tool_call_id: call.id ?? call.name,
        status: "success",
      });
    })
  );
  return { messages: results };
}

export function compileApp() {
  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agent", agentNode)
    .addNode("tools", toolsNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue, ["tools", END])
    .addEdge("tools", "agent");
  return graph.compile();
}
