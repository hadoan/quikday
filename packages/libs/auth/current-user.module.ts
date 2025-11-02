// src/auth/current-user.module.ts
import { Module, MiddlewareConsumer } from '@nestjs/common';
import { CurrentUserService } from './current-user.service.js';
import { CurrentUserMiddleware } from './current-user.middleware.js';

@Module({
  providers: [CurrentUserService],
  exports: [CurrentUserService],
})
export class CurrentUserModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CurrentUserMiddleware).forRoutes('*');
  }
}
