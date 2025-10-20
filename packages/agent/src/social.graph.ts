import { StateGraph, END, START } from '@langchain/langgraph';
import { MessagesAnnotation } from '@langchain/langgraph';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { model } from './llm.js';
import { SOCIAL_SYSTEM_PROMPT, createSocialPlanPrompt } from './prompts.js';

/** Plan node: Use OpenAI to understand and plan the social post */
async function planNode(state: typeof MessagesAnnotation.State) {
  const userMessages = state.messages.filter((m: any) => 
    m._getType?.() === 'human' || m.role === 'user'
  );
  const lastUserMessage = userMessages[userMessages.length - 1];
  const userPrompt = typeof lastUserMessage?.content === 'string' 
    ? lastUserMessage.content 
    : '';
  
  // Call OpenAI to generate a plan
  const response = await model.invoke([
    new SystemMessage(SOCIAL_SYSTEM_PROMPT),
    new HumanMessage(createSocialPlanPrompt(userPrompt)),
  ]);
  
  return { messages: [response] };
}

/** Configure node: Set platform and schedule */
async function configureNode(state: typeof MessagesAnnotation.State) {
  const configMessage = new AIMessage({
    content: JSON.stringify({
      platform: 'linkedin',
      time: new Date().toISOString(),
      status: 'configured',
    }),
  });
  
  return { messages: [configMessage] };
}

/** Authorize node: Handle credentials and auth */
async function authorizeNode(state: typeof MessagesAnnotation.State) {
  // TODO: BYOK token minting and validation
  const authMessage = new AIMessage({
    content: 'Authorization complete',
  });
  
  return { messages: [authMessage] };
}

/** Execute node: Perform the actual social post */
async function executeNode(state: typeof MessagesAnnotation.State) {
  const resultMessage = new AIMessage({
    content: JSON.stringify({
      ok: true,
      id: 'ln_123',
      tool: 'linkedin',
      action: 'scheduled',
      ts: new Date().toISOString(),
    }),
  });
  
  return { messages: [resultMessage] };
}

/** Compile the social graph */
export function buildSocialGraph() {
  const graph = new StateGraph(MessagesAnnotation)
    .addNode('plan', planNode)
    .addNode('configure', configureNode)
    .addNode('authorize', authorizeNode)
    .addNode('execute', executeNode)
    .addEdge(START, 'plan')
    .addEdge('plan', 'configure')
    .addEdge('configure', 'authorize')
    .addEdge('authorize', 'execute')
    .addEdge('execute', END);
  
  return graph.compile();
}
