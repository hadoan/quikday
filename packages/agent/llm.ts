import { ChatOpenAI } from '@langchain/openai';

// Masked log helper
function maskedKey(k?: string) {
  if (!k) return '(not set)';
  return `${k.slice(0, 10)}... (len=${k.length})`;
}

// At module initialization, ensure the process has an OPENAI_API_KEY or let the SDK fail
// but provide a clearer log message so it's easy to see what's happening at startup.
try {
  // eslint-disable-next-line no-console
  console.log('ChatOpenAI using OPENAI_API_KEY:', maskedKey(process.env.OPENAI_API_KEY));
} catch (err) {
  // ignore
}

export const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0.2,
});
