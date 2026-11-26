import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Database } from '@sportgather/db';
import { formatTanggal } from '@sportgather/shared';
import { sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Liveness: proses hidup (tidak menyentuh dependensi). */
  @Get()
  @ApiOkResponse({ description: 'API hidup' })
  check(): { status: 'ok'; tanggal: string } {
    return { status: 'ok', tanggal: formatTanggal(new Date()) };
  }

  /** Readiness untuk load balancer: database bisa dijangkau. */
  @Get('ready')
  @ApiOkResponse({ description: 'API siap melayani' })
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database tidak bisa dijangkau');
    }
  }
}
