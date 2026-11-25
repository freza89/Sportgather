import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CompetitionInputSchema,
  ReferencePreviewSchema,
  SeasonInputSchema,
} from '@sportgather/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { clientMeta, type AppRequest, type AuthUser, type OrgContext } from '../common/request.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { CurrentOrg, OrgContextGuard, RequirePermission } from '../orgs/org-context.guard.js';
import { SeasonsService } from './seasons.service.js';

const PrimarySchema = z.object({ competitionId: z.uuid() });
const PreviewSchema = ReferencePreviewSchema.extend({
  competitionId: z.uuid().nullable().default(null),
});

// A-05 · Musim & kompetisi
@ApiTags('seasons')
@Controller('orgs/:slug/seasons')
@UseGuards(AuthGuard, OrgContextGuard)
export class SeasonsController {
  constructor(private readonly seasons: SeasonsService) {}

  @Get()
  @RequirePermission('club.view')
  list(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.seasons.list(org, user);
  }

  @Get('active')
  @RequirePermission('club.view')
  active(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.seasons.active(org, user);
  }

  @Get(':seasonId')
  @RequirePermission('club.view')
  get(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('seasonId', ParseUUIDPipe) id: string,
  ) {
    return this.seasons.get(org, user, id);
  }

  @Post()
  @RequirePermission('players.manage')
  @ApiZodBody(SeasonInputSchema)
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(SeasonInputSchema)) body: z.output<typeof SeasonInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.seasons.create(org, user, body, clientMeta(req));
  }

  @Put(':seasonId')
  @RequirePermission('players.manage')
  @ApiZodBody(SeasonInputSchema)
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('seasonId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(SeasonInputSchema)) body: z.output<typeof SeasonInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.seasons.update(org, user, id, body, clientMeta(req));
  }

  @Post(':seasonId/competitions')
  @RequirePermission('players.manage')
  @ApiZodBody(CompetitionInputSchema)
  addCompetition(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('seasonId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CompetitionInputSchema)) body: z.output<typeof CompetitionInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.seasons.addCompetition(org, user, id, body, clientMeta(req));
  }

  @Patch(':seasonId/primary')
  @RequirePermission('players.manage')
  @ApiZodBody(PrimarySchema)
  setPrimary(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('seasonId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(PrimarySchema)) body: z.output<typeof PrimarySchema>,
    @Req() req: AppRequest,
  ) {
    return this.seasons.setPrimary(org, user, id, body.competitionId, clientMeta(req));
  }
}

@ApiTags('seasons')
@Controller('orgs/:slug/competitions')
@UseGuards(AuthGuard, OrgContextGuard)
export class CompetitionsController {
  constructor(private readonly seasons: SeasonsService) {}

  /** US-05: daftar pemain yang KU-nya berubah sebelum tanggal acuan disimpan. */
  @Post('preview')
  @HttpCode(200)
  @RequirePermission('players.manage')
  @ApiZodBody(PreviewSchema)
  preview(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(PreviewSchema)) body: z.output<typeof PreviewSchema>,
  ) {
    return this.seasons.preview(org, user, body.competitionId, body.referenceDate);
  }

  @Put(':competitionId')
  @RequirePermission('players.manage')
  @ApiZodBody(CompetitionInputSchema)
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('competitionId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CompetitionInputSchema)) body: z.output<typeof CompetitionInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.seasons.updateCompetition(org, user, id, body, clientMeta(req));
  }

  @Delete(':competitionId')
  @RequirePermission('players.manage')
  remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('competitionId', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ) {
    return this.seasons.deleteCompetition(org, user, id, clientMeta(req));
  }
}

@Module({
  controllers: [SeasonsController, CompetitionsController],
  providers: [SeasonsService, AuditService, OrgContextGuard],
  exports: [SeasonsService],
})
export class SeasonsModule {}
