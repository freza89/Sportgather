import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { pushSubscription, withContext, type Database } from '@sportgather/db';
import {
  AnnouncementInputSchema,
  AnnouncementTargetSchema,
  PushSubscriptionSchema,
} from '@sportgather/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { clientMeta, type AppRequest, type AuthUser, type OrgContext } from '../common/request.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { DB } from '../db/db.module.js';
import { NotifierService } from '../notifications/notifier.js';
import { CurrentOrg, OrgContextGuard, RequirePermission } from '../orgs/org-context.guard.js';
import { AnnouncementsService } from './announcements.service.js';
import { AnnouncementJobs } from './jobs.js';

// A-16 (admin) & P-05 (pelatih, terbatas tim yang dipegang)
@ApiTags('announcements')
@Controller('orgs/:slug/announcements')
@UseGuards(AuthGuard, OrgContextGuard)
export class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) {}

  @Get()
  @RequirePermission('announcement.send_team')
  history(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.svc.history(org, user);
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermission('announcement.send_team')
  @ApiZodBody(AnnouncementTargetSchema)
  preview(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(AnnouncementTargetSchema)) target: z.output<typeof AnnouncementTargetSchema>,
  ) {
    return this.svc.preview(org, user, target);
  }

  @Post()
  @RequirePermission('announcement.send_team')
  @ApiZodBody(AnnouncementInputSchema)
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(AnnouncementInputSchema)) body: z.output<typeof AnnouncementInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.create(org, user, body, clientMeta(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('announcement.send_team')
  async cancel(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ) {
    await this.svc.cancel(org, user, id, clientMeta(req));
  }
}

@ApiTags('announcements')
@Controller('me')
@UseGuards(AuthGuard)
export class MyAnnouncementsController {
  constructor(
    private readonly svc: AnnouncementsService,
    @Inject(DB) private readonly db: Database,
  ) {}

  @Get('announcements')
  mine(@CurrentUser() user: AuthUser) {
    return this.svc.mine(user);
  }

  @Post('announcements/:id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.markRead(user, id);
  }

  /** Daftarkan langganan Web Push perangkat ini. */
  @Post('push-subscriptions')
  @HttpCode(204)
  @ApiZodBody(PushSubscriptionSchema)
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(PushSubscriptionSchema)) body: z.output<typeof PushSubscriptionSchema>,
    @Req() req: AppRequest,
  ) {
    // Endpoint milik akun lain di perangkat yang sama tidak bisa diambil alih (RLS); abaikan.
    await withContext(this.db, { personId: user.personId }, async (tx) => {
      await tx
        .insert(pushSubscription)
        .values({
          personId: user.personId,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent: req.headers['user-agent'] ?? null,
        })
        .onConflictDoUpdate({
          target: pushSubscription.endpoint,
          set: { p256dh: body.keys.p256dh, auth: body.keys.auth },
        });
    }).catch(() => undefined);
  }

  @Post('push-subscriptions/remove')
  @HttpCode(204)
  async unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(z.object({ endpoint: z.url() }))) body: { endpoint: string },
  ) {
    await withContext(this.db, { personId: user.personId }, (tx) =>
      tx
        .delete(pushSubscription)
        .where(
          and(
            eq(pushSubscription.endpoint, body.endpoint),
            eq(pushSubscription.personId, user.personId),
          ),
        ),
    );
  }
}

@ApiTags('announcements')
@Controller('public')
export class PublicAnnouncementsController {
  constructor(
    private readonly svc: AnnouncementsService,
    private readonly notifier: NotifierService,
  ) {}

  /** Link bertoken dari WhatsApp/push: buka pengumuman & tandai dibaca. */
  @Get('announcements/:token')
  open(@Param('token') token: string) {
    return this.svc.openByToken(token);
  }

  @Get('push-key')
  pushKey() {
    return { publicKey: this.notifier.pushPublicKey };
  }
}

@Module({
  controllers: [AnnouncementsController, MyAnnouncementsController, PublicAnnouncementsController],
  providers: [
    AnnouncementsService,
    AnnouncementJobs,
    NotifierService,
    AuditService,
    OrgContextGuard,
  ],
  exports: [AnnouncementsService, NotifierService],
})
export class AnnouncementsModule {}
