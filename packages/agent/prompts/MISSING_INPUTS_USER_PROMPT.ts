/**
 * User prompt builder for missing inputs detection
 * 
 * Constructs a prompt with the user's message, provided information,
 * and tool requirements for the LLM to analyze.
 */

export interface ToolRequirement {
  tool: string;
  requiredParams: Array<{
    name: string;
    type: string;
    description?: string;
    required: boolean;
  }>;
  currentArgs: any;
}

export function buildMissingInputsUserPrompt(
  userMessage: string,
  providedInfo: Record<string, unknown>,
  toolRequirements: ToolRequirement[]
): string {
  return `User's original message:
"${userMessage}"

Already provided/extracted information:
${JSON.stringify(providedInfo, null, 2)}

Planned tool calls and their requirements:
${JSON.stringify(toolRequirements, null, 2)}

Identify which required parameters are missing and need to be asked. Return only the JSON array.`;
}
