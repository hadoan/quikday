import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { resolveEmailService } from './utils.js';
import type { LLM } from '../../../llm/types.js';
import { FOLLOWUP_EMAIL_SYSTEM } from '../../../prompts/FOLLOWUP_EMAIL_SYSTEM.js';
import { FOLLOWUP_EMAIL_USER_PROMPT } from '../../../prompts/FOLLOWUP_EMAIL_USER_PROMPT.js';

// ---------------- email.generateFollowup ----------------
export const EmailGenerateFollowupIn = z.object({
  threadId: z.string().describe('Gmail thread ID to generate follow-up for'),
  originalSubject: z.string().describe('Original email subject'),
  originalSnippet: z.string().describe('Snippet or preview of original email'),
  recipient: z.string().describe('Recipient email address'),
  // Be flexible on casing from upstream (e.g., "Friendly" → "friendly")
  tone: z.preprocess(
    (v) => (typeof v === 'string' ? v.toLowerCase() : v),
    z.enum(['polite', 'friendly', 'professional']).default('polite'),
  ).describe('Tone of the follow-up email'),
});

export const EmailGenerateFollowupOut = z.object({
  threadId: z.string(),
  subject: z.string(),
  body: z.string(),
  to: z.string(),
  preview: z.string(),
});

export type EmailGenerateFollowupArgs = z.infer<typeof EmailGenerateFollowupIn>;
export type EmailGenerateFollowupResult = z.infer<typeof EmailGenerateFollowupOut>;

export function emailGenerateFollowup(
  moduleRef: ModuleRef,
  llm: LLM,
): Tool<EmailGenerateFollowupArgs, EmailGenerateFollowupResult> {
  return {
    name: 'email.generateFollowup',
    description:
      'Generate a polite follow-up email draft for a thread with no reply. Uses AI to create a contextual, professional follow-up message.',
    in: EmailGenerateFollowupIn,
    out: EmailGenerateFollowupOut,
    apps: ['gmail-email'],
    scopes: [],
    rate: '30/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const parsed = EmailGenerateFollowupIn.parse(args);
      const svc = await resolveEmailService(moduleRef);

      // Get full thread context for better draft generation
      let threadContext = parsed.originalSnippet;
      if (svc?.getThread && typeof svc.getThread === 'function') {
        try {
          const thread = await svc.getThread(parsed.threadId);
          if (thread.length > 0) {
            const originalMessage = thread[0];
            threadContext = originalMessage.bodyText || originalMessage.snippet || threadContext;
          }
        } catch {
          // Fallback to snippet if thread fetch fails
        }
      }

      // Generate contextual follow-up using LLM
      const userPrompt = FOLLOWUP_EMAIL_USER_PROMPT({
        tone: parsed.tone,
        originalSubject: parsed.originalSubject,
        recipient: parsed.recipient,
        threadContext: threadContext.substring(0, 500),
      });

      const draftBody = await llm.text({
        system: FOLLOWUP_EMAIL_SYSTEM,
        user: userPrompt,
        temperature: 0.7,
        maxTokens: 500,
        metadata: {
          userId: ctx.userId,
          runId: ctx.runId,
          requestType: 'email-followup-generation',
        },
      });

      const result: EmailGenerateFollowupResult = {
        threadId: parsed.threadId,
        subject: `Re: ${parsed.originalSubject}`,
        body: draftBody.trim(),
        to: parsed.recipient,
        preview: draftBody.substring(0, 150) + (draftBody.length > 150 ? '...' : ''),
      };

      return EmailGenerateFollowupOut.parse(result);
    },
  };
}
