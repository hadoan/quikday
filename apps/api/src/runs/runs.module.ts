import { Module, forwardRef } from '@nestjs/common';
import { RunsService } from './runs.service.js';
import { RunsController } from './runs.controller.js';
import { PrismaModule } from '@quikday/prisma';
import { QueueModule } from '../queue/queue.module.js';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { ConfigModule } from '../config/config.module.js';
import { RunTokenService } from './run-token.service.js';
import { CurrentUserModule } from '@quikday/libs';
import { StepsService } from './steps.service.js';
import { ChatService } from './chat.service.js';
import { RunEnrichmentService } from './run-enrichment.service.js';
import { ChatItemOrchestratorService } from './chat-item-orchestrator.service.js';
import { RunCreationService } from './run-creation.service.js';
import { RunQueryService } from './run-query.service.js';
import { RunAuthorizationService } from './run-authorization.service.js';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => QueueModule),
    TelemetryModule,
    ConfigModule,
    CurrentUserModule,
  ],
  providers: [
    RunsService,
    RunTokenService,
    StepsService,
    ChatService,
    RunEnrichmentService,
    ChatItemOrchestratorService,
    RunCreationService,
    RunQueryService,
    RunAuthorizationService,
  ],
  controllers: [RunsController],
  exports: [RunsService, StepsService, RunEnrichmentService],
})
export class RunsModule {}
