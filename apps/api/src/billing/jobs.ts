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
import { BillingService } from './billing.service.js';
import { PaymentsService } from './payments.service.js';

const QUEUE = 'sportgather-billing';

/**
 * Job iuran (tiap jam): terbit tagihan bulanan saat tanggal terbit tiba dan pengingat
 * H-3/H/H+3/H+7. Keduanya idempoten (unique index & dedupe log). Hanya bila JOBS_ENABLED.
 */
@Injectable()
export class BillingJobs implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('BillingJobs');
  private connection?: Redis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly billing: BillingService,
    private readonly payments: PaymentsService,
  ) {}

  async onModuleInit() {
    if (!this.env.JOBS_ENABLED) return;
    this.connection = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE, { connection: this.connection });
    await this.queue.upsertJobScheduler(
      'billing-hourly',
      { every: 60 * 60_000 },
      {
        name: 'billing-hourly',
      },
    );
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        if (job.name !== 'billing-hourly') return;
        const { created } = await this.billing.runIssuance(new Date());
        if (created) this.logger.log(`Tagihan terbit: ${created}`);
        const { sent } = await this.payments.runReminders(new Date());
        if (sent) this.logger.log(`Pengingat iuran terkirim: ${sent}`);
      },
      { connection: this.connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.name} gagal: ${err.message}`),
    );
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
