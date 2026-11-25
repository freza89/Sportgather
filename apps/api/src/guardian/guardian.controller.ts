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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  DeleteRequestSchema,
  HandleDataRequestSchema,
  PhotoConsentSchema,
  ProfileUpdateSchema,
} from '@sportgather/shared';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { clientMeta, type AppRequest, type AuthUser, type OrgContext } from '../common/request.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { CurrentOrg, OrgContextGuard, RequirePermission } from '../orgs/org-context.guard.js';
import { PlayersModule } from '../players/players.controller.js';
import { GuardianService } from './guardian.service.js';

// O-08 · Profil wali & hak data
@ApiTags('guardian')
@Controller('me')
@UseGuards(AuthGuard)
export class GuardianController {
  constructor(private readonly svc: GuardianService) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.svc.profile(user);
  }

  @Patch('profile')
  @ApiZodBody(ProfileUpdateSchema)
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(ProfileUpdateSchema)) body: z.output<typeof ProfileUpdateSchema>,
  ) {
    return this.svc.updateProfile(user, body);
  }

  @Patch('children/:membershipId/photo-consent')
  @ApiZodBody(PhotoConsentSchema)
  photo(
    @CurrentUser() user: AuthUser,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(PhotoConsentSchema)) body: z.output<typeof PhotoConsentSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.setPhotoConsent(user, id, body.photoPublic, clientMeta(req));
  }

  @Post('children/:membershipId/delete-request')
  @ApiZodBody(DeleteRequestSchema)
  deleteRequest(
    @CurrentUser() user: AuthUser,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(DeleteRequestSchema)) body: z.output<typeof DeleteRequestSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.requestDeletion(user, id, body.reason, clientMeta(req));
  }

  @Get('children/:membershipId/export')
  @HttpCode(200)
  async export(
    @CurrentUser() user: AuthUser,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { bytes, name } = await this.svc.exportChild(user, id, clientMeta(req));
    reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${name}.pdf"`)
      .header('cache-control', 'private, no-store');
    return Buffer.from(bytes);
  }
}

@ApiTags('guardian')
@Controller('orgs/:slug/data-requests')
@UseGuards(AuthGuard, OrgContextGuard)
export class DataRequestsController {
  constructor(private readonly svc: GuardianService) {}

  @Get()
  @RequirePermission('players.manage')
  list(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.svc.listRequests(org, user);
  }

  @Patch(':id')
  @RequirePermission('players.manage')
  @ApiZodBody(HandleDataRequestSchema)
  handle(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(HandleDataRequestSchema)) body: z.output<typeof HandleDataRequestSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.handleRequest(org, user, id, body, clientMeta(req));
  }
}

@Module({
  imports: [PlayersModule],
  controllers: [GuardianController, DataRequestsController],
  providers: [GuardianService, AuditService, OrgContextGuard],
})
export class GuardianModule {}
