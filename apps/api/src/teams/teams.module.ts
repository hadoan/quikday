import { Module } from "@nestjs/common";
import { TeamsController } from "./teams.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({ imports: [PrismaModule], controllers: [TeamsController] })
export class TeamsModule {}

