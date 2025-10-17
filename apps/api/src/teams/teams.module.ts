import { Module } from "@nestjs/common";
import { TeamsController } from "./teams.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { ConfigModule } from "../config/config.module";

@Module({ imports: [PrismaModule, ConfigModule], controllers: [TeamsController] })
export class TeamsModule {}

