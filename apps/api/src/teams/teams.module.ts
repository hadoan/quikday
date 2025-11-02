import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller.js';
import { PrismaModule } from '@quikday/prisma';
import { ConfigModule } from '../config/config.module.js';

@Module({ imports: [PrismaModule, ConfigModule], controllers: [TeamsController] })
export class TeamsModule {}
