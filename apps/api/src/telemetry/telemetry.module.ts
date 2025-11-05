import { Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service.js';
import { ConfigModule } from '../config/config.module.js';

@Module({ imports: [ConfigModule], providers: [TelemetryService], exports: [TelemetryService] })
export class TelemetryModule {}
