import { z } from 'zod';

/**
 * Goal extraction output schema
 * Enforces structure via Zod instead of prose instructions
 */
export const GoalSchema = z.object({
  outcome: z.string().describe('What the user wants to accomplish, in one sentence'),
  
  context: z.object({
    who: z.string().optional().describe('People involved (emails, names)'),
    what: z.string().optional().describe('Subject matter, content'),
    when: z.string().optional().describe('Time or timeframe (ISO 8601 or relative)'),
    where: z.string().optional().describe('Location, channel, platform'),
    constraints: z.array(z.string()).optional().describe('Limits, boundaries, what to avoid'),
  }).optional(),
  
  provided: z.record(z.string(), z.unknown()).describe('Explicit values extracted from user input'),
  
  missing: z.array(z.object({
    key: z.string(),
    question: z.string(),
    type: z.string().optional(),
    options: z.array(z.string()).optional(),
    required: z.boolean().optional(),
  })).optional().describe('Information needed to proceed'),
  
  success_criteria: z.string().optional().describe('Definition of done'),
  
  confidence: z.number().min(0).max(1).default(0.7),
});

export type GoalExtraction = z.infer<typeof GoalSchema>;
