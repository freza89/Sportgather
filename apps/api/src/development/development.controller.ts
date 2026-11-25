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
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AssessmentInputSchema,
  PublishReportSchema,
  SkillInputSchema,
  type Semester,
} from '@sportgather/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AnnouncementsModule } from '../announcements/announcements.controller.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { clientMeta, type AppRequest, type AuthUser, type OrgContext } from '../common/request.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { CurrentOrg, OrgContextGuard, RequirePermission } from '../orgs/org-context.guard.js';
import { DevelopmentService } from './development.service.js';
import { renderReportCard } from './report-pdf.js';

const SemesterQuery = z.object({
  semester: z.coerce
    .number()
    .pipe(z.union([z.literal(1), z.literal(2)]))
    .optional(),
});

@ApiTags('development')
@Controller('orgs/:slug')
@UseGuards(AuthGuard, OrgContextGuard)
export class DevelopmentController {
  constructor(private readonly svc: DevelopmentService) {}

  @Get('skills')
  @RequirePermission('assessment.record_team')
  skills(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.svc.listSkills(org, user);
  }

  @Post('skills')
  @RequirePermission('players.manage')
  @ApiZodBody(SkillInputSchema)
  createSkill(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(SkillInputSchema)) body: z.output<typeof SkillInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.saveSkill(org, user, null, body, clientMeta(req));
  }

  @Patch('skills/:id')
  @RequirePermission('players.manage')
  @ApiZodBody(SkillInputSchema)
  updateSkill(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(SkillInputSchema)) body: z.output<typeof SkillInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.saveSkill(org, user, id, body, clientMeta(req));
  }

  // P-04
  @Get('coach/assessments')
  @RequirePermission('assessment.record_team')
  sheet(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query('teamId', ParseUUIDPipe) teamId: string,
    @Query(new ZodPipe(SemesterQuery)) q: z.output<typeof SemesterQuery>,
  ) {
    return this.svc.sheet(org, user, teamId, q.semester as Semester | undefined);
  }

  @Put('coach/assessments')
  @RequirePermission('assessment.record_team')
  @ApiZodBody(AssessmentInputSchema)
  save(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(AssessmentInputSchema)) body: z.output<typeof AssessmentInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.save(org, user, body, clientMeta(req));
  }

  @Get('coach/assessments/pending')
  @RequirePermission('assessment.record_team')
  pending(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.svc.pending(org, user);
  }

  // Rapor
  @Get('report-cards/status')
  @RequirePermission('players.manage')
  status(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(SemesterQuery)) q: z.output<typeof SemesterQuery>,
  ) {
    return this.svc.reportStatus(org, user, q.semester as Semester | undefined);
  }

  @Post('report-cards/publish')
  @RequirePermission('players.manage')
  @ApiZodBody(PublishReportSchema)
  publish(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(PublishReportSchema)) body: z.output<typeof PublishReportSchema>,
    @Req() req: AppRequest,
  ) {
    return this.svc.publish(org, user, body.seasonId, body.semester, clientMeta(req));
  }
}

// O-07
@ApiTags('development')
@Controller('me/report-cards')
@UseGuards(AuthGuard)
export class MyReportCardsController {
  constructor(private readonly svc: DevelopmentService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.myReportCards(user);
  }

  @Get(':membershipId/pdf')
  @HttpCode(200)
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const card = await this.svc.myReportCard(user, id);
    reply
      .header('content-type', 'application/pdf')
      .header(
        'content-disposition',
        `inline; filename="rapor-${card.childName.replace(/[^\w]+/g, '-').toLowerCase()}-s${card.semester}.pdf"`,
      )
      .header('cache-control', 'private, no-store');
    return Buffer.from(await renderReportCard(card));
  }
}

@Module({
  imports: [AnnouncementsModule],
  controllers: [DevelopmentController, MyReportCardsController],
  providers: [DevelopmentService, AuditService, OrgContextGuard],
  exports: [DevelopmentService],
})
export class DevelopmentModule {}
