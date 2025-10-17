import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { RunsService } from "./runs.service";
import { KindeGuard } from "../auth/kinde.guard";

@Controller("runs")
@UseGuards(KindeGuard)
export class RunsController {
  constructor(private runs: RunsService) {}

  @Post()
  create(@Body() body: { prompt: string; mode: "plan" | "auto"; teamId: number }) {
    return this.runs.createFromPrompt(body);
  }

  @Post(":id/confirm")
  async confirm(@Param("id") id: string) {
    await this.runs.enqueue(id);
    return { ok: true };
  }

  @Post(":id/undo")
  async undo(@Param("id") id: string) {
    // TODO: Implement undo with inverse actions in engine
    return { ok: false, message: "Undo not implemented yet" };
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.runs.get(id);
  }
}

