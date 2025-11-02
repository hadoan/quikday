import { Module } from '@nestjs/common';
import { PrismaModule } from '@quikday/prisma';
import { UsersController } from './users.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { ConfigModule } from '../config/config.module.js';
import { UsersMeController } from './me.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [UsersController, UsersMeController],
})
export class UsersModule {}
