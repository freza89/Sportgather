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
import { RsvpService } from './rsvp.service.js';

const QUEUE = 'sportgather-schedule';

/**
 * Job terjadwal: pengingat sesi H-1 (17.00 waktu cabang) dicek tiap 15 menit. Aman diulang
 * karena setiap pesan punya kunci dedupe di notification_log. Hanya aktif bila JOBS_ENABLED.
 */
@Injectable()
export class ScheduleJobs implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('ScheduleJobs');
  private connection?: Redis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly rsvp: RsvpService,
  ) {}

  async onModuleInit() {
    if (!this.env.JOBS_ENABLED) return;
    this.connection = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE, { connection: this.connection });
    await this.queue.upsertJobScheduler(
      'session-reminders',
      { every: 15 * 60_000 },
      { name: 'session-reminders' },
    );
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        if (job.name === 'session-reminders') {
          const { sent } = await this.rsvp.runReminders(new Date());
          if (sent) this.logger.log(`Pengingat sesi terkirim: ${sent}`);
        }
      },
      { connection: this.connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.name} gagal: ${err.message}`),
    );
    this.logger.log('Job terjadwal aktif (pengingat sesi tiap 15 menit)');
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
