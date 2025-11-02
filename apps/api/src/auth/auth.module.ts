import { Module } from '@nestjs/common';
import { KindeGuard } from './kinde.guard.js';
import { ConfigModule } from '../config/config.module.js';
import { PrismaModule } from '@quikday/prisma';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [KindeGuard, AuthService],
  exports: [KindeGuard, AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
