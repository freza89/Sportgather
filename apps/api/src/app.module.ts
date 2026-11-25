import { type DynamicModule, Module } from '@nestjs/common';
import { BillingModule } from './billing/billing.controller.js';
import { AnnouncementsModule } from './announcements/announcements.controller.js';
import { DevelopmentModule } from './development/development.controller.js';
import { ReportsModule } from './reports/reports.controller.js';
import { GuardianModule } from './guardian/guardian.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { ENV, type Env } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { DevModule } from './dev/dev.module.js';
import { HealthController } from './health/health.controller.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { MeModule } from './me/me.controller.js';
import { OrgsModule } from './orgs/orgs.module.js';
import { PlayersModule } from './players/players.controller.js';
import { ScheduleModule } from './schedule/schedule.controller.js';
import { SeasonsModule } from './seasons/seasons.controller.js';
import { StorageModule } from './storage/storage.module.js';
import { TeamsModule } from './teams/teams.controller.js';

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
        StorageModule,
        OrgsModule,
        SeasonsModule,
        TeamsModule,
        PlayersModule,
        ScheduleModule,
        BillingModule,
        AnnouncementsModule,
        DevelopmentModule,
        ReportsModule,
        GuardianModule,
        MeModule,
        ...(devTools ? [DevModule] : []),
      ],
      controllers: [HealthController],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
