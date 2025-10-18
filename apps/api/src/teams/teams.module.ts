import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { PrismaModule } from '@runfast/prisma';
import { ConfigModule } from '../config/config.module';

@Module({ imports: [PrismaModule, ConfigModule], controllers: [TeamsController] })
export class TeamsModule {}
