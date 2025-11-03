
## Implement and use `ICurrentUser` in NestJS (practical guide)

This guide shows a minimal, practical implementation of an `ICurrentUser` contract and how to wire it into a NestJS app: the interface, a parameter decorator, a request-scoped provider, an auth guard that attaches the user, example controller/service usage, testing tips, and a link to the Quik.day repo for reference.

The goal: you can copy the snippets below into your NestJS project and have a typed current-user object available throughout your code.

### What you'll get

- `ICurrentUser` interface
- `@CurrentUser()` parameter decorator
- A tiny request-scoped `CurrentUserProvider` (reads `request.user`)
- Example `JwtAuthGuard` (attach user to request)
- Controller and service usage examples
- Unit testing tips and examples

> Note: adapt import paths to match your project structure.

### 1) Define the interface

Create a lightweight interface file, for example: `packages/libs/auth/src/interfaces/icurrent-user.ts` (or `src/lib/auth` in a standalone project).

```ts
// icurrent-user.ts
export interface ICurrentUser {
  id: string;
  email?: string;
  displayName?: string;
  roles?: string[];
  // Optional: tokens or raw claims if you need them for downstream calls
  accessToken?: string;
}
```

Keep the surface area small — add only fields you actually need.

### 2) Implement a parameter decorator

Create `current-user.decorator.ts`. This reads `request.user` and returns a typed object to controller params.

```ts
// current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ICurrentUser } from './interfaces/icurrent-user';

export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext): ICurrentUser | null => {
  const req = ctx.switchToHttp().getRequest();
  return (req.user as ICurrentUser) ?? null;
});
```

Usage in a controller:

```ts
import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { ICurrentUser } from './interfaces/icurrent-user';

@Controller('profile')
export class ProfileController {
  @Get()
  get(@CurrentUser() user: ICurrentUser | null) {
    if (!user) return { message: 'unauthenticated' };
    return { id: user.id, email: user.email };
  }
}
```

### 3) Request-scoped provider (optional)

If services deep in your stack need access to the current user without passing it through every method, implement a request-scoped provider.

```ts
// current-user.provider.ts
import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { ICurrentUser } from './interfaces/icurrent-user';

@Injectable({ scope: Scope.REQUEST })
export class CurrentUserProvider {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  get user(): ICurrentUser | null {
    return (this.request as any).user ?? null;
  }
}
```

Register this provider in the module that provides auth utilities or globally where appropriate.

### 4) Auth guard: attach `user` to `request`

Your authentication guard should validate the token (JWT, Kinde, etc.) and attach a plain object to `request.user`. Keep the object shape compatible with `ICurrentUser`.

```ts
// jwt-auth.guard.ts (simplified)
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { verify } from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    if (!auth) return false;

    const token = auth.replace('Bearer ', '');
    try {
      const payload = verify(token, process.env.JWT_PUBLIC_KEY || 'changeme');
      // Map payload -> ICurrentUser
      req.user = {
        id: (payload as any).sub,
        email: (payload as any).email,
        roles: (payload as any).roles || [],
      };
      return true;
    } catch (err) {
      return false;
    }
  }
}
```

Attach this guard to controllers or routes with `@UseGuards(JwtAuthGuard)` or globally.

### 5) Use `ICurrentUser` in services (pass plain objects)

Prefer to pass a plain `ICurrentUser` object into your business services rather than depending on request objects inside them.

```ts
// run.service.ts
export class RunService {
  constructor(private readonly prisma: PrismaClient) {}

  async createRun(input: { prompt: string }, user: ICurrentUser) {
    if (!user) throw new Error('Unauthenticated');
    return this.prisma.run.create({ data: { prompt: input.prompt, userId: user.id } });
  }
}
```

Controller wiring example:

```ts
@Post('runs')
@UseGuards(JwtAuthGuard)
create(@Body() dto: CreateRunDto, @CurrentUser() user: ICurrentUser) {
  return this.runService.createRun(dto, user);
}
```

### 6) Testing

Unit tests become trivial because `ICurrentUser` is a plain object. Two recommended strategies:

- Unit-test controllers by directly calling controller methods and passing a fake `ICurrentUser`.
- Integration-test the guard and decorator separately using Nest's Test.createTestingModule and an injected mock request.

Example unit test (Jest):

```ts
describe('ProfileController', () => {
  let controller: ProfileController;

  beforeEach(() => {
    controller = new ProfileController();
  });

  it('returns profile for user', async () => {
    const user = { id: 'user-1', email: 'a@b.com' } as ICurrentUser;
    const result = controller.get(user);
    expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
  });
});
```

Integration test tip: when testing the `CurrentUser` decorator, mount the controller with an overridden provider for `REQUEST` and set `user` on the fake request.

### 7) Edge cases & best practices

- Validate presence: treat `ICurrentUser | null` where routes may be public.
- Minimal interface: add only fields you need and prefer IDs over full nested objects.
- Background jobs: explicitly pass userId or service account identity instead of relying on request-scoped providers.
- Avoid leaking tokens in logs.

### 8) Copyable checklist to implement in another NestJS project

1. Add `icurrent-user.ts` (interface).
2. Add `current-user.decorator.ts` and export it from your auth module.
3. Add an optional request-scoped `CurrentUserProvider` if services need it.
4. Implement an auth guard that populates `request.user` with the `ICurrentUser` shape.
5. Use `@CurrentUser()` in controllers; pass `ICurrentUser` into services.
6. Unit-test controllers by passing fake `ICurrentUser` values.

### Reference: Quik.day repository

This guide is based on common NestJS patterns and the Quik.day project structure. For reference and real-world usage, see the Quik.day repository:

- https://github.com/hadoan/quikday

You can inspect how auth utilities and decorators are organized in `packages/libs/auth` and other packages in the repo to adapt naming and module wiring to your project.

---

If you'd like, I can now:

- Add the concrete decorator and provider files directly into `packages/libs/auth` in this repository.
- Add unit tests and a tiny integration test that verifies the decorator and guard wiring.

Tell me which next step you want and I'll implement it.

