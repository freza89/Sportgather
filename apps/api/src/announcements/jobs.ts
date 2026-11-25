import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { AnnouncementsService } from './announcements.service.js';

const QUEUE = 'sportgather-announcements';

/** Kirim pengumuman terjadwal tiap 5 menit. Hanya bila JOBS_ENABLED. */
@Injectable()
export class AnnouncementJobs implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('AnnouncementJobs');
  private connection?: Redis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly svc: AnnouncementsService,
  ) {}

  async onModuleInit() {
    if (!this.env.JOBS_ENABLED) return;
    this.connection = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE, { connection: this.connection });
    await this.queue.upsertJobScheduler(
      'scheduled-announcements',
      { every: 5 * 60_000 },
      {
        name: 'scheduled-announcements',
      },
    );
    this.worker = new Worker(
      QUEUE,
      async () => {
        const { sent } = await this.svc.runScheduled(new Date());
        if (sent) this.logger.log(`Pengumuman terjadwal terkirim: ${sent}`);
      },
      { connection: this.connection, concurrency: 1 },
    );
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
