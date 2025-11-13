import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';
import { RunEnrichmentService } from './run-enrichment.service.js';
import { RunStatus, type Prisma, type Run, type User } from '@prisma/client';

/**
 * Run with user and step count information
 */
type RunWithUserAndCount = Run & {
  User: User;
  _count?: { steps: number };
};

/**
 * Run list item response
 */
interface RunListItem {
  id: string;
  title: string;
  status: RunStatus;
  createdAt: Date;
  createdBy: {
    id: number;
    name: string;
    avatar: string | null;
  };
  kind: 'action';
  source: string;
  stepCount: number;
  approvals: { required: boolean };
  undo: { available: boolean };
  lastEventAt: Date;
  tags: unknown[];
}

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
    private enrichmentService: RunEnrichmentService
  ) {}

  /**
   * List runs with pagination, filtering, and sorting
   */
  async list(params: {
    userId?: string;
    page?: number;
    pageSize?: number;
    status?: RunStatus[];
    q?: string;
    sortBy?: 'createdAt' | 'lastEventAt' | 'status' | 'stepCount';
    sortDir?: 'asc' | 'desc';
  }): Promise<{ items: RunListItem[]; page: number; pageSize: number; total: number }> {
    const teamId = this.current.getCurrentTeamId();
    const userSub = params.userId || this.current.getCurrentUserSub();
    if (!userSub) throw new UnauthorizedException('Not authenticated');

    // Look up the user by their Kinde sub to get the numeric database ID
    const user = await this.prisma.user.findUnique({ where: { sub: userSub } });
    if (!user) {
      throw new UnauthorizedException(
        'User not found in database. Please ensure user sync completed.'
      );
    }
    const numericUserId = user.id;

    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 25)));

    const where: Prisma.RunWhereInput = {
      userId: numericUserId,
    };

    if (teamId) where.teamId = Number(teamId);
    if (params.status && params.status.length) where.status = { in: params.status };
    if (params.q && params.q.trim()) {
      const q = params.q.trim();
      where.OR = [{ id: { contains: q } }, { prompt: { contains: q, mode: 'insensitive' } }];
    }

    // Sorting
    type SortOrder = 'asc' | 'desc';

    const dir: SortOrder = (params.sortDir ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    let orderBy: Prisma.RunOrderByWithRelationInput = { createdAt: dir };

    switch (params.sortBy) {
      case 'status':
        orderBy = { status: dir };
        break;
      case 'stepCount':
        orderBy = { steps: { _count: dir } };
        break;
      case 'lastEventAt':
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
          _count: { select: { steps: true } },
        },
      }),
    ]);

    const items: RunListItem[] = runs.map((r: RunWithUserAndCount) => {
      const intentData = r.intent as { title?: string } | null;
      const configData = r.config as { meta?: { source?: string } } | null;

      return {
        id: r.id,
        title: intentData?.title || r.prompt?.slice(0, 80) || 'Run',
        status: r.status,
        createdAt: r.createdAt,
        createdBy: {
          id: r.userId,
          name: r.User?.displayName || r.User?.email || 'User',
          avatar: r.User?.avatar || null,
        },
        kind: 'action' as const,
        source: configData?.meta?.source || 'api',
        stepCount: r._count?.steps ?? 0,
        approvals: { required: false },
        undo: { available: false },
        lastEventAt: r.updatedAt,
        tags: [],
      };
    });

    return { items, page, pageSize, total };
  }

  /**
   * Get a single run by ID with ownership verification
   */
  async get(
    id: string,
    userSub?: string
  ): Promise<
    Run & {
      User: User;
      steps: any[];
      effects: any[];
      chat?: any | null;
      plan?: any;
    }
  > {
    const run = await this.prisma.run.findUnique({
      where: { id },
      include: {
        steps: true,
        effects: true,
        User: true,
        chat: {
          include: {
            items: {
              where: {
                hideInChat: false,
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Run not found');
    }

    // Verify ownership if userSub provided
    if (userSub) {
      const user = await this.prisma.user.findUnique({ where: { sub: userSub } });
      if (!user) {
        throw new UnauthorizedException(
          'User not found in database. Please ensure user sync completed.'
        );
      }

      if (run.userId !== user.id) {
        throw new NotFoundException('Run not found');
      }
    }

    const enrichedSteps = await this.enrichmentService.getEnrichedSteps(run.id, run.userId);

    let nextPlan = run.plan;
    if (run.plan && Array.isArray(run.plan) && enrichedSteps.length > 0) {
      nextPlan = this.enrichmentService.mapStepsToPlanFormat(enrichedSteps, run.plan as any) as any;
    }

    const hydratedChat =
      run.chat && run.chat.items?.length
        ? this.hydrateChatItemsWithSteps(run.chat, enrichedSteps)
        : run.chat;

    return {
      ...run,
      plan: nextPlan,
      steps: enrichedSteps,
      chat: hydratedChat,
    };
  }

  private hydrateChatItemsWithSteps(chat: any, enrichedSteps: any[]) {
    if (!Array.isArray(enrichedSteps) || enrichedSteps.length === 0) {
      return chat;
    }

    const chatSteps = this.enrichmentService.mapStepsToChatFormat(enrichedSteps);
    const stepsNeedingCredentials = chatSteps.filter(
      (step) => step.appId && (step.credentialId === null || step.credentialId === undefined)
    );
    const hasMissingCredentials = stepsNeedingCredentials.length > 0;

    return {
      ...chat,
      items: (chat.items || []).map((item: any) => {
        if (!item?.content || typeof item.content !== 'object') {
          return item;
        }

        const content = { ...(item.content as Record<string, unknown>) };

        switch (item.type) {
          case 'plan':
            return {
              ...item,
              content: {
                ...content,
                steps: chatSteps,
              },
            };
          case 'app_credentials':
            return {
              ...item,
              content: {
                ...content,
                steps: stepsNeedingCredentials,
              },
            };
          case 'questions':
            return {
              ...item,
              content: {
                ...content,
                steps: chatSteps,
                hasMissingCredentials,
              },
            };
          default:
            return item;
        }
      }),
    };
  }
}
