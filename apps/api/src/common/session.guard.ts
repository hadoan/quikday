import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    // TODO: Integrate Kinde/NextAuth/JWT middleware to populate req.user
    // For now, this is a stub that allows all requests while reading if a user exists.
    // Example expected shape: req.user = { id: string, ... }
    const _userId = req?.user?.id;
    return true; // Allow by default in scaffold
  }
}

