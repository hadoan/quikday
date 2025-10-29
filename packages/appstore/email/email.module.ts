import { DynamicModule, Module } from '@nestjs/common';
import { EMAIL_FACTORY, EMAIL_REGISTRY } from './email.tokens.js';
import { EmailFactory } from './email.factory.js';

@Module({})
export class EmailModule {
  static register(providers: { registry: Map<any, any> }): DynamicModule {
    return {
      module: EmailModule,
      providers: [
        { provide: EMAIL_REGISTRY, useValue: providers.registry },
        { provide: EMAIL_FACTORY, useClass: EmailFactory },
      ],
      exports: [EMAIL_FACTORY],
    };
  }
}
