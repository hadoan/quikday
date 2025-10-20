import { Module } from '@nestjs/common';
import { KindeGuard } from './kinde.guard';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '@quikday/prisma';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [KindeGuard, AuthService],
  exports: [KindeGuard, AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
