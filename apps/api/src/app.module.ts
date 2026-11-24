import { type DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ENV, type Env } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { DevModule } from './dev/dev.module.js';
import { HealthController } from './health/health.controller.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { MeModule } from './me/me.controller.js';
import { OrgsModule } from './orgs/orgs.module.js';

@Module({})
export class AppModule {
  static register(env: Env): DynamicModule {
    const devTools = env.NODE_ENV !== 'production' && env.WHATSAPP_PROVIDER === 'mock';
    return {
      module: AppModule,
      global: true,
      imports: [
        DbModule,
        IntegrationsModule,
        AuthModule,
        OrgsModule,
        MeModule,
        ...(devTools ? [DevModule] : []),
      ],
      controllers: [HealthController],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
