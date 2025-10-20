import { Module } from '@nestjs/common';
import { PrismaModule } from '@quikday/prisma';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';

@Module({ imports: [PrismaModule, AuthModule, ConfigModule], controllers: [UsersController] })
export class UsersModule {}
