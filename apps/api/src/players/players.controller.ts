import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AcceptRegistrationSchema,
  ImportRequestSchema,
  ManualPlayerSchema,
  PlayerListQuerySchema,
  RejectRegistrationSchema,
  UpdatePlayerSchema,
} from '@sportgather/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { readMultipart } from '../common/multipart.js';
import { clientMeta, type AppRequest, type AuthUser, type OrgContext } from '../common/request.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { CurrentOrg, OrgContextGuard, RequirePermission } from '../orgs/org-context.guard.js';
import { TeamsModule } from '../teams/teams.controller.js';
import { PlayersService } from './players.service.js';
import { RegistrationsService } from './registrations.service.js';

// A-06 Daftar pemain · A-07 Profil · A-04 Impor
@ApiTags('players')
@Controller('orgs/:slug/players')
@UseGuards(AuthGuard, OrgContextGuard)
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get()
  @RequirePermission('players.manage')
  list(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(PlayerListQuerySchema)) query: z.output<typeof PlayerListQuerySchema>,
  ) {
    return this.players.list(org, user, query);
  }

  @Post()
  @RequirePermission('players.manage')
  @ApiZodBody(ManualPlayerSchema)
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(ManualPlayerSchema)) body: z.output<typeof ManualPlayerSchema>,
    @Req() req: AppRequest,
  ) {
    return this.players.createManual(org, user, body, clientMeta(req));
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermission('players.manage')
  @ApiZodBody(ImportRequestSchema)
  import(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(ImportRequestSchema)) body: z.output<typeof ImportRequestSchema>,
    @Req() req: AppRequest,
  ) {
    return this.players.import(org, user, body.rows, body.commit, clientMeta(req));
  }

  @Get(':membershipId')
  @RequirePermission('players.manage')
  detail(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('membershipId', ParseUUIDPipe) id: string,
  ) {
    return this.players.detail(org, user, id);
  }

  @Patch(':membershipId')
  @RequirePermission('players.manage')
  @ApiZodBody(UpdatePlayerSchema)
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdatePlayerSchema)) body: z.output<typeof UpdatePlayerSchema>,
    @Req() req: AppRequest,
  ) {
    return this.players.update(org, user, id, body, clientMeta(req));
  }
}

/** Dokumen usia: hanya owner & admin; setiap pembukaan tercatat di audit log. */
@ApiTags('documents')
@Controller('orgs/:slug/documents')
@UseGuards(AuthGuard, OrgContextGuard)
export class DocumentsController {
  constructor(private readonly players: PlayersService) {}

  @Get(':documentId/content')
  @RequirePermission('documents.view')
  async content(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
    @Res() reply: FastifyReply,
  ) {
    const doc = await this.players.documentContent(org, user, id, clientMeta(req));
    await reply
      .header('content-type', doc.mimeType)
      .header('content-disposition', `inline; filename="${doc.fileName}"`)
      .header('cache-control', 'no-store, private')
      .header('x-content-type-options', 'nosniff')
      .header(
        'content-security-policy',
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      )
      .send(doc.buffer);
  }
}

// A-08 Antrean verifikasi
@ApiTags('registrations')
@Controller('orgs/:slug/registrations')
@UseGuards(AuthGuard, OrgContextGuard)
export class RegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Get()
  @RequirePermission('documents.view')
  queue(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.registrations.queue(org, user);
  }

  @Post(':membershipId/accept')
  @HttpCode(200)
  @RequirePermission('documents.view')
  @ApiZodBody(AcceptRegistrationSchema)
  accept(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(AcceptRegistrationSchema)) body: z.output<typeof AcceptRegistrationSchema>,
    @Req() req: AppRequest,
  ) {
    return this.registrations.accept(org, user, id, body, clientMeta(req));
  }

  @Post(':membershipId/reject')
  @HttpCode(200)
  @RequirePermission('documents.view')
  @ApiZodBody(RejectRegistrationSchema)
  reject(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(RejectRegistrationSchema)) body: z.output<typeof RejectRegistrationSchema>,
    @Req() req: AppRequest,
  ) {
    return this.registrations.reject(org, user, id, body.reason, clientMeta(req));
  }
}

// O-01 Formulir pendaftaran (publik untuk info klub; kirim butuh login OTP wali)
@ApiTags('public')
@Controller('public/orgs/:slug')
export class PublicRegistrationController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Get()
  info(@Param('slug') slug: string) {
    return this.registrations.publicInfo(slug);
  }

  @Post('registrations')
  @UseGuards(AuthGuard)
  async submit(@Param('slug') slug: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    const { data, files } = await readMultipart(req);
    return this.registrations.submit(slug, user, data, files, clientMeta(req));
  }
}

const ReuploadSchema = z.object({ kind: z.enum(['akta', 'kia', 'kk']).default('akta') });

// Portal wali: anak saya (O-03, O-08)
@ApiTags('me')
@Controller('me/children')
@UseGuards(AuthGuard)
export class MyChildrenController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.registrations.myChildren(user);
  }

  @Post(':membershipId/documents')
  async reupload(
    @CurrentUser() user: AuthUser,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ) {
    const { data, files } = await readMultipart(req);
    const { kind } = ReuploadSchema.parse(data ?? {});
    return this.registrations.reupload(user, id, kind, files.get('document'), clientMeta(req));
  }
}

@Module({
  imports: [TeamsModule],
  controllers: [
    PlayersController,
    DocumentsController,
    RegistrationsController,
    PublicRegistrationController,
    MyChildrenController,
  ],
  providers: [PlayersService, RegistrationsService, AuditService],
  exports: [RegistrationsService],
})
export class PlayersModule {}
