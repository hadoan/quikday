import { Module } from '@nestjs/common';
import { KindeGuard } from './kinde.guard';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config.service';

@Module({ imports: [ConfigModule], providers: [KindeGuard, ConfigService], exports: [KindeGuard] })
export class AuthModule {}
