# GitHub Copilot Instructions for Runfast.now

## Project Overview

**Runfast.now** is an open-source AI-powered execution assistant for founders and small teams. The core concept is: **One Prompt. One Run. Done.**

Users type a goal (e.g., "Schedule a check-in with Sara tomorrow at 10:00") and Runfast executes it instantly across connected apps with full audit logs, undo capabilities, and governance controls.

## Architecture & Design Principles

### System Flow
```
Browser (Vite + React) → NestJS API → BullMQ Workers → LangChain/Graph Orchestrator → External APIs
```

### Core Principles
1. **Immediacy** — Tasks complete in seconds, not minutes
2. **Security** — BYOK (Bring Your Own Keys), short-lived JWTs, scoped tokens per run
3. **Governance** — Every run is logged, idempotent, and reversible
4. **Simplicity** — One prompt, one run, clear execution
5. **Team-ready** — Shared runs, policies, metrics, controlled automation

## Tech Stack & Conventions

### Monorepo Structure
- `apps/api/` — NestJS backend (REST API, auth, orchestration)
- `apps/web/` — Vite + React frontend (UI/UX)
- `packages/types/` — Zod schemas for type safety
- `packages/crypto/` — AES-GCM encryption for tokens
- `packages/sdk/` — API client SDK
- `packages/agent/` — AI agent core logic
- `packages/appstore/` — Integration plugins

### Backend (NestJS)
- **Use dependency injection** for all services
- **Guard all endpoints** with auth guards (Kinde JWT)
- **Validate inputs** using Zod schemas from `@runfast/types`
- **Use Prisma** for all database operations
- **Queue long-running tasks** with BullMQ
- **Structure**: Controllers → Services → Repositories pattern
- **Error handling**: Use NestJS exception filters
- **Logging**: Use NestJS Logger with structured logs

### Frontend (React + Vite)
- **Use TypeScript** strictly
- **Components**: Functional components with hooks
- **UI Library**: shadcn/ui components + Tailwind CSS
- **State management**: React hooks + Context API (avoid Redux unless necessary)
- **API calls**: Use `@runfast/sdk` for type-safe API interactions
- **Forms**: Use React Hook Form with Zod validation
- **Routing**: React Router

### Database (Prisma + PostgreSQL)
- **Always use Prisma Client** from `@runfast/prisma`
- **Migrations**: Use `pnpm db:migrate` for schema changes (don't use db:push in production)
- **Transactions**: Use Prisma transactions for multi-step operations
- **Soft deletes**: Prefer soft deletes over hard deletes for audit trail
- **Timestamps**: Always include `createdAt`, `updatedAt` fields

### LangChain/Graph Integration
- **Tools**: Each integration is a LangChain tool
- **Modes**: Support both PLAN (preview) and AUTO (execute) modes
- **Deterministic**: Graph execution should be reproducible
- **Guardrails**: Validate inputs/outputs at each step
- **Errors**: Handle tool errors gracefully, log to run steps

### BullMQ Workers
- **One queue per run type** (e.g., `runs`, `integrations`)
- **Idempotency**: Use job IDs to prevent duplicate processing
- **Retries**: Configure exponential backoff
- **Concurrency**: Set appropriate worker concurrency limits
- **Monitoring**: Log job progress and failures

## Code Style & Patterns

### TypeScript
- Use strict mode
- Prefer interfaces over types for objects
- Use enums from `@runfast/types` for constants
- Avoid `any` — use `unknown` and type guards
- Use Zod for runtime validation

### Naming Conventions
- **Files**: kebab-case (e.g., `run.service.ts`, `auth.guard.ts`)
- **Classes**: PascalCase (e.g., `RunService`, `AuthGuard`)
- **Functions/Variables**: camelCase (e.g., `createRun`, `userId`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Interfaces**: PascalCase with `I` prefix optional (e.g., `IRunConfig` or `RunConfig`)

### API Design
- **REST conventions**: GET, POST, PUT, DELETE
- **Endpoints**: `/resource` (list), `/resource/:id` (get), etc.
- **Response format**:
  ```typescript
  {
    success: boolean;
    data?: T;
    error?: { message: string; code: string };
  }
  ```
- **Pagination**: Use cursor-based pagination for lists
- **Versioning**: Use `/v1/` prefix if needed

### Security Best Practices
- **Authentication**: All endpoints require JWT auth (except public routes)
- **Authorization**: Check user permissions per resource
- **Rate limiting**: Apply rate limits to prevent abuse
- **Input validation**: Validate all inputs with Zod
- **Secrets**: Never log or expose API keys, tokens
- **BYOK**: Store user API keys encrypted with AES-GCM
- **Run tokens**: Generate short-lived scoped tokens per run

## Integration Development

### Adding New Integrations
1. Create folder in `packages/appstore/[integration-name]/`
2. Implement `metadata.ts` with app info
3. Implement `index.ts` with LangChain tool
4. Add OAuth callback handler if needed
5. Register in `_appRegistry.ts`
6. Add Zod schemas to `@runfast/types`
7. Update database schema if new fields needed

### Integration Structure
```typescript
// metadata.ts
export const metadata = {
  id: 'app-name',
  name: 'App Name',
  description: 'What this integration does',
  category: 'social' | 'productivity' | 'communication',
  requiresAuth: true,
  authType: 'oauth' | 'apikey',
};

// index.ts
export class AppNameTool extends Tool {
  name = 'app_name_action';
  description = 'Clear description for LLM';
  
  async _call(input: string): Promise<string> {
    // Implementation
  }
}
```

## Testing Guidelines

### Unit Tests
- Test services and business logic
- Mock external dependencies
- Use Jest for testing
- Aim for >80% coverage on core logic

### Integration Tests
- Test API endpoints end-to-end
- Use test database (separate from dev)
- Clean up test data after each test

### Test Naming
```typescript
describe('RunService', () => {
  describe('createRun', () => {
    it('should create a new run with valid input', async () => {
      // Test implementation
    });
    
    it('should throw error when user not found', async () => {
      // Test implementation
    });
  });
});
```

## Common Patterns & Examples

### Creating a New Run
```typescript
// Controller
@Post('runs')
@UseGuards(AuthGuard)
async createRun(@Body() dto: CreateRunDto, @User() user: JwtPayload) {
  return this.runService.createRun(dto, user.sub);
}

// Service
async createRun(dto: CreateRunDto, userId: string) {
  // Validate with Zod
  const validated = createRunSchema.parse(dto);
  
  // Create in DB
  const run = await this.prisma.run.create({
    data: {
      userId,
      prompt: validated.prompt,
      mode: validated.mode,
      status: 'pending',
    },
  });
  
  // Queue for execution if AUTO mode
  if (validated.mode === 'auto') {
    await this.queueService.enqueueRun(run.id);
  }
  
  return run;
}
```

### Error Handling
```typescript
try {
  const result = await this.externalApi.call();
  return result;
} catch (error) {
  this.logger.error('External API call failed', {
    error: error.message,
    context: 'RunService.executeStep',
  });
  
  throw new HttpException(
    'Failed to execute step',
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
```

### Working with Prisma
```typescript
// Transaction example
await this.prisma.$transaction(async (tx) => {
  const run = await tx.run.update({
    where: { id: runId },
    data: { status: 'completed' },
  });
  
  await tx.runStep.createMany({
    data: steps.map(step => ({
      runId,
      toolName: step.tool,
      input: step.input,
      output: step.output,
    })),
  });
});
```

## Performance Considerations

- **Database queries**: Use `select` to fetch only needed fields
- **Pagination**: Always paginate lists, never fetch all records
- **Caching**: Use Redis for frequently accessed data
- **Background jobs**: Move heavy operations to BullMQ workers
- **Rate limiting**: Respect external API rate limits
- **Connection pooling**: Configure Prisma connection pool appropriately

## Debugging & Logging

- Use structured logging with context
- Log levels: error, warn, info, debug
- Include request IDs for tracing
- Log all run executions with steps
- Don't log sensitive data (tokens, keys, PII)

```typescript
this.logger.log('Run created', {
  runId: run.id,
  userId: user.id,
  mode: run.mode,
  timestamp: new Date().toISOString(),
});
```

## License & Contributing

- **License**: GNU Affero General Public License v3.0 (AGPL-3.0)
- **Key requirement**: If you deploy a modified version as a network service, source code must be made available
- **Contributions**: See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines

## Quick Reference

### Useful Commands
```bash
pnpm dev              # Start all dev servers
pnpm build            # Build all packages
pnpm db:push          # Push schema changes (dev)
pnpm db:migrate       # Create and apply migrations
pnpm test             # Run tests
pnpm lint             # Lint code
```

### Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `KINDE_DOMAIN` — Kinde auth domain
- `KINDE_CLIENT_ID` — Kinde client ID
- `KINDE_BYPASS` — Set to `true` for local dev (skips auth)
- `POSTHOG_KEY` — PostHog API key for telemetry

---

**When in doubt**: Prioritize security, governance, and user control. Every action should be auditable and reversible.

© 2025 Runfast. Built with ❤️ by Ha Doan and the open source community.
