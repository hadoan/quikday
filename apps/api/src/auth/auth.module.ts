import { Module } from '@nestjs/common';
import { KindeGuard } from './kinde.guard';
import { ConfigModule } from '../config/config.module';

@Module({ imports: [ConfigModule], providers: [KindeGuard], exports: [KindeGuard] })
export class AuthModule {}
