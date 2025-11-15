import type { ToolRegistry } from './registry.js';
import { ModuleRef } from '@nestjs/core';
import { slackPostMessage, slackChannelsList } from './tools/slack.js';

export function registerSlackTools(registry: ToolRegistry, moduleRef: ModuleRef) {
  registry.register(slackChannelsList(moduleRef));
  registry.register(slackPostMessage(moduleRef));
}
