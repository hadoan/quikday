import type { ToolRegistry } from './registry.js';
import { ModuleRef } from '@nestjs/core';
import * as notionTools from './tools/notion.js';

export function registerNotionTools(registry: ToolRegistry, moduleRef: ModuleRef) {
  registry.register(notionTools.notionUpsert(moduleRef));
  registry.register(notionTools.notionPageGet(moduleRef));
  registry.register(notionTools.notionPageArchive(moduleRef));
  registry.register(notionTools.notionPagePropertiesUpdate(moduleRef));
  registry.register(notionTools.notionBlocksAppend(moduleRef));
  registry.register(notionTools.notionBlocksReplace(moduleRef));
  registry.register(notionTools.notionDatabaseQuery(moduleRef));
  registry.register(notionTools.notionDatabaseList(moduleRef));
  registry.register(notionTools.notionDatabaseFindOrCreate(moduleRef));
  registry.register(notionTools.notionRelationsSync(moduleRef));
  registry.register(notionTools.notionTodoAdd(moduleRef));
  registry.register(notionTools.notionTodoList(moduleRef));
  registry.register(notionTools.notionTodoToggle(moduleRef));
  registry.register(notionTools.notionTodoUpdate(moduleRef));
  registry.register(notionTools.notionTodoDelete(moduleRef));
  registry.register(notionTools.notionTodoAssign(moduleRef));
  registry.register(notionTools.notionTodoReschedule(moduleRef));
  registry.register(notionTools.notionTodoCompleteAll(moduleRef));
  registry.register(notionTools.notionDemoPrepBriefUpsert(moduleRef));
  registry.register(notionTools.notionAfterDemoSummaryToNotion(moduleRef));
  registry.register(notionTools.notionMeetingNotesFromCalendar(moduleRef));
  registry.register(notionTools.notionOutboundLogTouchpoints(moduleRef));
  registry.register(notionTools.notionNoReplyFollowupLog(moduleRef));
  registry.register(notionTools.notionContactFromEmailThread(moduleRef));
  registry.register(notionTools.notionChangelogAppend(moduleRef));
  registry.register(notionTools.notionLaunchBriefUpsert(moduleRef));
  registry.register(notionTools.notionBugFeedbackCapture(moduleRef));
  registry.register(notionTools.notionDailyFounderLogUpdate(moduleRef));
  registry.register(notionTools.notionTaskDigestForDay(moduleRef));
  registry.register(notionTools.notionWeeklyReviewPack(moduleRef));
}
