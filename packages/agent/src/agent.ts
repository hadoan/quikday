import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { model } from "./llm.js";
import { tools } from "./tools.js";


/** System message: give intent-first guidance (no hard mapping). */
export const SYSTEM_MESSAGE = `
You are an executive assistant with tools. Consider the user's intent and context.
If an action helps, choose exactly ONE available tool that best achieves the outcome.
If no tool fits, answer normally.
Before any result, include a brief justification (≤12 words).`.trim();


/** Bind tools to the model for tool calling. */
export const agentWithTools = (() => {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_MESSAGE],
    new MessagesPlaceholder("messages")
  ]);
  return prompt.pipe(model.bindTools(tools));
})();