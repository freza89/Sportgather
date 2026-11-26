import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CoachExperienceInputSchema,
  CoachLicenseInputSchema,
  CoachLicenseReviewSchema,
  CoachProfileInputSchema,
} from '@sportgather/shared';
import { Queue, Worker } from 'bullmq';
import type { FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import type { z } from 'zod';
import { AnnouncementsModule } from '../announcements/announcements.controller.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { readMultipart } from '../common/multipart.js';
import { clientMeta, type AppRequest, type AuthUser, type OrgContext } from '../common/request.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { ENV, type Env } from '../config/env.js';
import { CurrentOrg, OrgContextGuard, RequirePermission } from '../orgs/org-context.guard.js';
import { CoachingService, SELF } from './coaching.service.js';

/** `:staffId` = id staf, atau `me` untuk profil sendiri. */
class StaffIdPipe extends ParseUUIDPipe {
  override async transform(value: string, metadata: Parameters<ParseUUIDPipe['transform']>[1]) {
    return value === SELF ? value : super.transform(value, metadata);
  }
}

async function sendFile(
  reply: FastifyReply,
  file: { buffer: Buffer; mimeType: string; fileName?: string },
) {
  await reply
    .header('content-type', file.mimeType)
    .header('content-disposition', `inline; filename="${file.fileName ?? 'foto'}"`)
    .header('cache-control', 'no-store, private')
    .header('x-content-type-options', 'nosniff')
    .header(
      'content-security-policy',
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    )
    .send(file.buffer);
}

/** Body lisensi: JSON, atau multipart (`data` + berkas `file`, opsional). */
async function licenseBody(req: AppRequest) {
  let data: unknown = req.body;
  let file;
  if (req.isMultipart()) {
    const mp = await readMultipart(req);
    data = mp.data;
    file = mp.files.get('file');
  }
  return { body: new ZodPipe(CoachLicenseInputSchema).transform(data), file };
}

/** M7 · Profil/CV & lisensi pelatih (ADR-034). Hak akses dicek di service. */
@ApiTags('coach-profiles')
@Controller('orgs/:slug/coach-profiles/:staffId')
@UseGuards(AuthGuard, OrgContextGuard)
@RequirePermission('club.view')
export class CoachProfilesController {
  constructor(private readonly svc: CoachingService) {}

  @Get()
  get(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
  ) {
    return this.svc.get(org, user, staffId);
  }

  @Put()
  @ApiZodBody(CoachProfileInputSchema)
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Body(new ZodPipe(CoachProfileInputSchema)) body: z.output<typeof CoachProfileInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.update(org, user, staffId, body, clientMeta(req));
  }

  @Post('photo')
  @HttpCode(200)
  async setPhoto(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Req() req: AppRequest,
  ) {
    const mp = await readMultipart(req);
    return this.svc.setPhoto(org, user, staffId, mp.files.get('file'), clientMeta(req));
  }

  @Get('photo')
  async photo(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Res() reply: FastifyReply,
  ) {
    await sendFile(reply, await this.svc.photo(org, user, staffId));
  }

  @Post('experiences')
  @ApiZodBody(CoachExperienceInputSchema)
  addExperience(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Body(new ZodPipe(CoachExperienceInputSchema))
    body: z.output<typeof CoachExperienceInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.addExperience(org, user, staffId, body, clientMeta(req));
  }

  @Put('experiences/:id')
  @ApiZodBody(CoachExperienceInputSchema)
  updateExperience(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CoachExperienceInputSchema))
    body: z.output<typeof CoachExperienceInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.updateExperience(org, user, staffId, id, body, clientMeta(req));
  }

  @Delete('experiences/:id')
  deleteExperience(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ) {
    return this.svc.updateExperience(org, user, staffId, id, null, clientMeta(req));
  }

  @Post('licenses')
  async addLicense(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Req() req: AppRequest,
  ) {
    const { body, file } = await licenseBody(req);
    return this.svc.addLicense(org, user, staffId, body, file, clientMeta(req));
  }

  /** POST (bukan PUT) agar bisa multipart dari browser lewat apiUpload. */
  @Post('licenses/:id')
  @HttpCode(200)
  async updateLicense(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ) {
    const { body, file } = await licenseBody(req);
    return this.svc.updateLicense(org, user, staffId, id, body, file, clientMeta(req));
  }

  @Delete('licenses/:id')
  deleteLicense(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ) {
    return this.svc.deleteLicense(org, user, staffId, id, clientMeta(req));
  }

  @Post('licenses/:id/review')
  @HttpCode(200)
  @ApiZodBody(CoachLicenseReviewSchema)
  review(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CoachLicenseReviewSchema)) body: z.output<typeof CoachLicenseReviewSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.review(org, user, staffId, id, body, clientMeta(req));
  }

  @Get('licenses/:id/file')
  async licenseFile(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', StaffIdPipe) staffId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
    @Res() reply: FastifyReply,
  ) {
    await sendFile(reply, await this.svc.licenseFile(org, user, staffId, id, clientMeta(req)));
  }
}

/** Wali: ringkasan pelatih tim anak (hanya lisensi terverifikasi & berlaku). */
@ApiTags('me')
@Controller('me/children/:membershipId/coaches')
@UseGuards(AuthGuard)
export class ChildCoachesController {
  constructor(private readonly svc: CoachingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('membershipId', ParseUUIDPipe) membershipId: string) {
    return this.svc.forGuardian(user, membershipId);
  }

  @Get(':staffId/photo')
  async photo(
    @CurrentUser() user: AuthUser,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Res() reply: FastifyReply,
  ) {
    await sendFile(reply, await this.svc.guardianPhoto(user, membershipId, staffId));
  }
}

const QUEUE = 'sportgather-coaching';

/** Pengingat masa berlaku lisensi (H-30 & kedaluwarsa), dicek tiap jam. Hanya bila JOBS_ENABLED. */
@Injectable()
export class CoachingJobs implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('CoachingJobs');
  private connection?: Redis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly svc: CoachingService,
  ) {}

  async onModuleInit() {
    if (!this.env.JOBS_ENABLED) return;
    this.connection = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE, { connection: this.connection });
    await this.queue.upsertJobScheduler(
      'license-expiry',
      { every: 60 * 60_000 },
      {
        name: 'license-expiry',
      },
    );
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        if (job.name !== 'license-expiry') return;
        const { sent } = await this.svc.runExpiryReminders(new Date());
        if (sent) this.logger.log(`Pengingat lisensi terkirim: ${sent}`);
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

@Module({
  imports: [AnnouncementsModule],
  controllers: [CoachProfilesController, ChildCoachesController],
  providers: [CoachingService, CoachingJobs, AuditService, OrgContextGuard],
  exports: [CoachingService],
})
export class CoachingModule {}
