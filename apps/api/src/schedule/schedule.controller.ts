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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AttendanceSyncSchema,
  EventInputSchema,
  EventUpdateSchema,
  HolidayInputSchema,
  IsoDateSchema,
  RsvpInputSchema,
  ScheduleQuerySchema,
  SeriesInputSchema,
  TokenRsvpSchema,
} from '@sportgather/shared';
import { z } from 'zod';
import { AnnouncementsModule } from '../announcements/announcements.controller.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { clientMeta, type AppRequest, type AuthUser, type OrgContext } from '../common/request.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { CurrentOrg, OrgContextGuard, RequirePermission } from '../orgs/org-context.guard.js';
import { todayIso } from '../seasons/ku-context.js';
import { CoachService } from './coach.service.js';
import { ScheduleJobs } from './jobs.js';
import { RsvpService } from './rsvp.service.js';
import { ScheduleService } from './schedule.service.js';

// A-12 · Kalender & jadwal (admin)
@ApiTags('schedule')
@Controller('orgs/:slug/schedule')
@UseGuards(AuthGuard, OrgContextGuard)
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get()
  @RequirePermission('players.manage')
  list(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(ScheduleQuerySchema)) q: z.output<typeof ScheduleQuerySchema>,
  ) {
    return this.schedule.list(org, user, q);
  }

  @Post('series')
  @RequirePermission('players.manage')
  @ApiZodBody(SeriesInputSchema)
  createSeries(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(SeriesInputSchema)) body: z.output<typeof SeriesInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.schedule.createSeries(org, user, body, clientMeta(req));
  }

  @Get('series')
  @RequirePermission('players.manage')
  listSeries(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query('teamId', ParseUUIDPipe) teamId: string,
  ) {
    return this.schedule.listSeries(org, user, teamId);
  }

  @Delete('series/:seriesId')
  @HttpCode(204)
  @RequirePermission('players.manage')
  async deleteSeries(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('seriesId', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ) {
    await this.schedule.deleteSeries(org, user, id, clientMeta(req));
  }

  @Post('events')
  @RequirePermission('players.manage')
  @ApiZodBody(EventInputSchema)
  createEvent(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(EventInputSchema)) body: z.output<typeof EventInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.schedule.createEvent(org, user, body, clientMeta(req));
  }

  @Patch('events/:eventId')
  @RequirePermission('players.manage')
  @ApiZodBody(EventUpdateSchema)
  updateEvent(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(EventUpdateSchema)) body: z.output<typeof EventUpdateSchema>,
    @Req() req: AppRequest,
  ) {
    return this.schedule.updateEvent(org, user, id, body, clientMeta(req));
  }

  @Get('holidays')
  @RequirePermission('players.manage')
  holidays(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.schedule.listHolidays(org, user);
  }

  @Post('holidays')
  @RequirePermission('players.manage')
  @ApiZodBody(HolidayInputSchema)
  addHoliday(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(HolidayInputSchema)) body: z.output<typeof HolidayInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.schedule.addHoliday(org, user, body, clientMeta(req));
  }

  @Delete('holidays/:holidayId')
  @HttpCode(204)
  @RequirePermission('players.manage')
  async removeHoliday(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('holidayId', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ) {
    await this.schedule.removeHoliday(org, user, id, clientMeta(req));
  }
}

const DateQuery = z.object({ date: IsoDateSchema.optional() });

// P-01 · P-02 · P-03 (pelatih & team manager: tim sendiri)
@ApiTags('coach')
@Controller('orgs/:slug/coach')
@UseGuards(AuthGuard, OrgContextGuard)
export class CoachController {
  constructor(private readonly coach: CoachService) {}

  @Get('sessions')
  @RequirePermission('attendance.record_team')
  today(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(DateQuery)) q: z.output<typeof DateQuery>,
  ) {
    return this.coach.today(org, user, q.date ?? todayIso());
  }

  @Get('sessions/:eventId')
  @RequirePermission('attendance.record_team')
  sheet(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('eventId', ParseUUIDPipe) id: string,
  ) {
    return this.coach.sheet(org, user, id);
  }

  @Post('attendance/sync')
  @HttpCode(200)
  @RequirePermission('attendance.record_team')
  @ApiZodBody(AttendanceSyncSchema)
  sync(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(AttendanceSyncSchema)) body: z.output<typeof AttendanceSyncSchema>,
    @Req() req: AppRequest,
  ) {
    return this.coach.sync(org, user, body.ops, clientMeta(req));
  }

  @Get('teams')
  @RequirePermission('players.view_team')
  teams(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.coach.myTeams(org, user);
  }
}

const RangeQuery = z.object({ from: IsoDateSchema, to: IsoDateSchema });

// O-04 · Jadwal & RSVP wali
@ApiTags('me')
@Controller('me')
@UseGuards(AuthGuard)
export class MyScheduleController {
  constructor(private readonly rsvp: RsvpService) {}

  @Get('schedule')
  schedule(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(RangeQuery)) q: z.output<typeof RangeQuery>,
  ) {
    return this.rsvp.mySchedule(user, q.from, q.to);
  }

  @Post('rsvp')
  @HttpCode(200)
  @ApiZodBody(RsvpInputSchema)
  submit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(RsvpInputSchema)) body: z.output<typeof RsvpInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.rsvp.submit(user, body, clientMeta(req));
  }
}

// Link bertoken dari WhatsApp (US-08): tanpa login ulang
@ApiTags('public')
@Controller('public/rsvp/:token')
export class TokenRsvpController {
  constructor(private readonly rsvp: RsvpService) {}

  @Get()
  view(@Param('token') token: string) {
    return this.rsvp.tokenView(token);
  }

  @Post()
  @HttpCode(200)
  @ApiZodBody(TokenRsvpSchema)
  submit(
    @Param('token') token: string,
    @Body(new ZodPipe(TokenRsvpSchema)) body: z.output<typeof TokenRsvpSchema>,
    @Req() req: AppRequest,
  ) {
    return this.rsvp.tokenSubmit(token, body.responses, clientMeta(req));
  }
}

@Module({
  imports: [AnnouncementsModule],
  controllers: [ScheduleController, CoachController, MyScheduleController, TokenRsvpController],
  providers: [
    ScheduleService,
    CoachService,
    RsvpService,
    ScheduleJobs,
    AuditService,
    OrgContextGuard,
  ],
  exports: [RsvpService],
})
export class ScheduleModule {}
