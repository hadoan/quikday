import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";
export { compileApp } from "./graph.js";

/**
 * Run the agent for a single user prompt and return assistant/tool outputs as strings.
 */
export async function runAgent(prompt: string): Promise<string[]> {
  const { compileApp } = await import("./graph.js");
  const app = compileApp();
  const res = await app.invoke({ messages: [new HumanMessage(prompt)] });
  return res.messages.map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)));
}
