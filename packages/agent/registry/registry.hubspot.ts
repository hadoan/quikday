import type { ToolRegistry } from './registry.js';
import { ModuleRef } from '@nestjs/core';
import {
  hubspotFindContactsByEmail,
  hubspotCreateContacts,
  hubspotCreateMeeting,
  hubspotUpdateMeeting,
} from './tools/hubspot.js';

export function registerHubspotTools(registry: ToolRegistry, moduleRef: ModuleRef) {
  registry.register(hubspotFindContactsByEmail(moduleRef));
  registry.register(hubspotCreateContacts(moduleRef));
  registry.register(hubspotCreateMeeting(moduleRef));
  registry.register(hubspotUpdateMeeting(moduleRef));
}
