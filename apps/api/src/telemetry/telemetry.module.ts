import { Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { ConfigModule } from '../config/config.module';

@Module({ imports: [ConfigModule], providers: [TelemetryService], exports: [TelemetryService] })
export class TelemetryModule {}
