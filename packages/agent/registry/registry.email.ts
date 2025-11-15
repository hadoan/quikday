import type { ToolRegistry } from './registry.js';
import { ModuleRef } from '@nestjs/core';
import { LLM } from '../llm/types.js';
import {
  emailSend,
  emailRead,
  emailMessageGet,
  emailThreadGet,
  emailDraftCreate,
  emailDraftSend,
  emailLabelsChange,
  emailArchive,
  emailSnooze,
  emailSearchNoReply,
  emailGenerateFollowup,
  emailSendFollowup,
  emailSetOutOfOffice,
} from './tools/email.js';

export function registerEmailTools(registry: ToolRegistry, moduleRef: ModuleRef, llm: LLM) {
  registry.register(emailSend(moduleRef));
  registry.register(emailRead(moduleRef));
  registry.register(emailMessageGet(moduleRef));
  registry.register(emailThreadGet(moduleRef));
  registry.register(emailDraftCreate(moduleRef));
  registry.register(emailDraftSend(moduleRef));
  registry.register(emailLabelsChange(moduleRef));
  registry.register(emailArchive(moduleRef));
  registry.register(emailSnooze(moduleRef));
  registry.register(emailSearchNoReply(moduleRef));
  registry.register(emailGenerateFollowup(moduleRef, llm));
  registry.register(emailSendFollowup(moduleRef));
  registry.register(emailSetOutOfOffice(moduleRef));
}
