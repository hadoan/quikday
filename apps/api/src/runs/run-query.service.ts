import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

/**
 * RunQueryService handles querying and retrieving runs.
 * Follows Single Responsibility Principle by focusing only on read operations.
 */
@Injectable()
export class RunQueryService {
  private readonly logger = new Logger(RunQueryService.name);

  constructor(
    private prisma: PrismaService,
    private readonly current: CurrentUserService,
  ) {}

  /**
   * List runs with pagination, filtering, and sorting
   */
  async list(params: {
    userId?: string;
    page?: number;
    pageSize?: number;
    status?: string[];
    q?: string;
    sortBy?: 'createdAt' | 'lastEventAt' | 'status' | 'stepCount';
    sortDir?: 'asc' | 'desc';
  }) {
    const teamId = this.current.getCurrentTeamId();
    const userSub = params.userId || this.current.getCurrentUserSub();
    if (!userSub) throw new UnauthorizedException('Not authenticated');

    // Look up the user by their Kinde sub to get the numeric database ID
    const user = await this.prisma.user.findUnique({ where: { sub: userSub } });
    if (!user) {
      throw new UnauthorizedException(
        'User not found in database. Please ensure user sync completed.',
      );
    }
    const numericUserId = user.id;

    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 25)));
    const where: any = { userId: numericUserId }; // CRITICAL: Filter by userId to prevent cross-user data access
    if (teamId) where.teamId = Number(teamId);
    if (params.status && params.status.length) where.status = { in: params.status };
    if (params.q && params.q.trim()) {
      const q = params.q.trim();
      where.OR = [{ id: { contains: q } }, { prompt: { contains: q, mode: 'insensitive' } }];
    }

    // Sorting
    let orderBy: any = { createdAt: 'desc' };
    const dir = (params.sortDir ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    switch (params.sortBy) {
      case 'status':
        orderBy = { status: dir };
        break;
      case 'stepCount':
        orderBy = { steps: { _count: dir as any } } as any;
        break;
      case 'lastEventAt':
        // No lastEventAt column; use updatedAt as a proxy
        orderBy = { updatedAt: dir };
        break;
      case 'createdAt':
      default:
        orderBy = { createdAt: dir };
        break;
    }

    const [total, runs] = await this.prisma.$transaction([
      this.prisma.run.count({ where }),
      this.prisma.run.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          User: true,
          _count: { select: { steps: true } } as any,
        },
      } as any),
    ]);

    const items = runs.map((r: any) => ({
      id: r.id,
      title: (r.intent as any)?.title || r.prompt?.slice(0, 80) || 'Run',
      status: r.status,
      createdAt: r.createdAt,
      createdBy: {
        id: r.userId,
        name: r.User?.displayName || r.User?.email || 'User',
        avatar: r.User?.avatar || null,
      },
      kind: 'action',
      source: ((r.config as any)?.meta?.source as string) || 'api',
      stepCount: r._count?.steps ?? 0,
      approvals: { required: false },
      undo: { available: false },
      lastEventAt: r.updatedAt,
      tags: [],
    }));

    return { items, page, pageSize, total };
  }

  /**
   * Get a single run by ID with ownership verification
   */
  async get(id: string, userSub?: string) {
    const run = await this.prisma.run.findUnique({
      where: { id },
      include: {
        steps: true,
        effects: true,
        User: true, // Include user to verify ownership
      },
    });
    if (!run) throw new NotFoundException('Run not found');

    // If userSub is provided, verify ownership
    if (userSub) {
      // Look up the user by their Kinde sub to get the numeric database ID
      const user = await this.prisma.user.findUnique({ where: { sub: userSub } });
      if (!user) {
        throw new UnauthorizedException(
          'User not found in database. Please ensure user sync completed.',
        );
      }

      // Verify the run belongs to this user
      if (run.userId !== user.id) {
        throw new NotFoundException('Run not found'); // Don't reveal existence to unauthorized users
      }
    }

    // Enrich the plan with credential information from steps
    if (run.plan && Array.isArray(run.plan) && run.steps && run.steps.length > 0) {
      const enrichedPlan = (run.plan as any[]).map((planStep: any) => {
        // Find matching step by planStepId or tool name
        const matchingStep = run.steps.find(
          (s) => s.planStepId === planStep.id || s.tool === planStep.tool,
        );

        if (matchingStep) {
          return {
            ...planStep,
            appId: matchingStep.appId || undefined,
            credentialId: matchingStep.credentialId || undefined,
          };
        }

        return planStep;
      });

      return { ...run, plan: enrichedPlan };
    }

    return run;
  }
}
