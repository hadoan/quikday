import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { TelemetryService } from "../telemetry/telemetry.service";

@Injectable()
export class RunsService {
  constructor(
    private prisma: PrismaService,
    private telemetry: TelemetryService,
    @InjectQueue("runs") private runsQueue: Queue
  ) {}

  async createFromPrompt({ prompt, mode, teamId }: { prompt: string; mode: "plan" | "auto"; teamId: number }) {
    // TODO: Load or create user based on auth context
    // For now assume a placeholder user with id 1 exists or create a minimal one
    const user = await this.prisma.user.upsert({
      where: { sub: "dev-user" },
      update: {},
      create: { sub: "dev-user", email: "dev@example.com", displayName: "Dev User" },
    });

    // Ensure team exists
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException("Team not found");

    const run = await this.prisma.run.create({
      data: { teamId: team.id, userId: user.id, prompt, mode, status: "queued" },
    });

    await this.telemetry.track("run_created", { runId: run.id, teamId: team.id, mode });

    return run;
  }

  async enqueue(runId: string) {
    await this.runsQueue.add("execute", { runId }, { removeOnComplete: 100, removeOnFail: 100 });
  }

  async get(id: string) {
    const run = await this.prisma.run.findUnique({ where: { id }, include: { steps: true } });
    if (!run) throw new NotFoundException("Run not found");
    return run;
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.run.update({ where: { id }, data: { status } });
  }

  async persistResult(id: string, result: { logs?: any[]; output?: any; error?: any }) {
    if (result.logs?.length) {
      for (const entry of result.logs) {
        await this.prisma.step.create({
          data: {
            runId: id,
            tool: entry.tool || "unknown",
            action: entry.action || "",
            request: entry.request ?? null,
            response: entry.result ?? null,
            startedAt: new Date(entry.ts || Date.now()),
          },
        });
      }
    }
    await this.prisma.run.update({ where: { id }, data: { output: result.output ?? null, error: result.error ?? null } });
  }
}

