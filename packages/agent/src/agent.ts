import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { model } from './llm.js';
import { tools } from './tools.js';
import { AGENT_SYSTEM_MESSAGE } from './prompts.js';

/** Bind tools to the model for tool calling. */
export const agentWithTools = (() => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', AGENT_SYSTEM_MESSAGE],
    new MessagesPlaceholder('messages'),
  ]);
  return prompt.pipe(model.bindTools(tools));
})();
