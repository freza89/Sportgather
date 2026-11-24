import {
  Global,
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createDb, type Database, type DbHandle } from '@sportgather/db';
import { ENV, type Env } from '../config/env.js';
import { assertRlsEnforced } from './role-check.js';

export const DB_HANDLE = Symbol('DB_HANDLE');
export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLE,
      inject: [ENV],
      useFactory: (env: Env): DbHandle => createDb(env.DATABASE_URL),
    },
    { provide: DB, inject: [DB_HANDLE], useFactory: (h: DbHandle): Database => h.db },
  ],
  exports: [DB, DB_HANDLE],
})
export class DbModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: DbHandle) {}

  async onApplicationBootstrap(): Promise<void> {
    await assertRlsEnforced(this.handle.db);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}
