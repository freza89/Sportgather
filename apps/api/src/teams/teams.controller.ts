import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AddTeamMemberSchema,
  NewSeasonSchema,
  PromotionApplySchema,
  TeamInputSchema,
} from '@sportgather/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { clientMeta, type AppRequest, type AuthUser, type OrgContext } from '../common/request.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { CurrentOrg, OrgContextGuard, RequirePermission } from '../orgs/org-context.guard.js';
import { TeamsService } from './teams.service.js';

// A-09 Tim & KU · A-10 Detail tim · A-11 Kenaikan KU
@ApiTags('teams')
@Controller('orgs/:slug/teams')
@UseGuards(AuthGuard, OrgContextGuard)
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @RequirePermission('players.manage')
  list(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query('seasonId') seasonId?: string,
  ) {
    return this.teams.list(org, user, seasonId);
  }

  @Post()
  @RequirePermission('players.manage')
  @ApiZodBody(TeamInputSchema)
  create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(TeamInputSchema)) body: z.output<typeof TeamInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.teams.create(org, user, body, clientMeta(req));
  }

  @Get(':teamId')
  @RequirePermission('players.manage')
  detail(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId', ParseUUIDPipe) id: string,
  ) {
    return this.teams.detail(org, user, id);
  }

  @Put(':teamId')
  @RequirePermission('players.manage')
  @ApiZodBody(TeamInputSchema)
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(TeamInputSchema)) body: z.output<typeof TeamInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.teams.update(org, user, id, body, clientMeta(req));
  }

  @Delete(':teamId')
  @HttpCode(204)
  @RequirePermission('players.manage')
  async archive(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ) {
    await this.teams.archive(org, user, id, clientMeta(req));
  }

  @Get(':teamId/candidates')
  @RequirePermission('players.manage')
  candidates(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId', ParseUUIDPipe) id: string,
  ) {
    return this.teams.candidates(org, user, id);
  }

  @Post(':teamId/members')
  @RequirePermission('players.manage')
  @ApiZodBody(AddTeamMemberSchema)
  addMember(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(AddTeamMemberSchema)) body: z.output<typeof AddTeamMemberSchema>,
    @Req() req: AppRequest,
  ) {
    return this.teams.addMember(org, user, id, body, clientMeta(req));
  }

  @Delete(':teamId/members/:memberId')
  @HttpCode(204)
  @RequirePermission('players.manage')
  async removeMember(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Req() req: AppRequest,
  ) {
    await this.teams.removeMember(org, user, id, memberId, clientMeta(req));
  }
}

@ApiTags('teams')
@Controller('orgs/:slug/promotion')
@UseGuards(AuthGuard, OrgContextGuard)
export class PromotionController {
  constructor(private readonly teams: TeamsService) {}

  @Post('season')
  @RequirePermission('players.manage')
  @ApiZodBody(NewSeasonSchema)
  createSeason(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(NewSeasonSchema)) body: z.output<typeof NewSeasonSchema>,
    @Req() req: AppRequest,
  ) {
    return this.teams.createNextSeason(org, user, body, clientMeta(req));
  }

  @Get()
  @RequirePermission('players.manage')
  preview(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.teams.promotionPreview(org, user);
  }

  @Post()
  @HttpCode(200)
  @RequirePermission('players.manage')
  @ApiZodBody(PromotionApplySchema)
  apply(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(PromotionApplySchema)) body: z.output<typeof PromotionApplySchema>,
    @Req() req: AppRequest,
  ) {
    return this.teams.applyPromotion(org, user, body, clientMeta(req));
  }
}

@Module({
  controllers: [TeamsController, PromotionController],
  providers: [TeamsService, AuditService, OrgContextGuard],
  exports: [TeamsService],
})
export class TeamsModule {}
