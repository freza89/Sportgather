import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  AcceptInvitationSchema,
  BankAccountInputSchema,
  BranchInputSchema,
  CreateOrgSchema,
  InviteStaffSchema,
  UpdateOrgSchema,
  UpdateStaffSchema,
} from '@sportgather/shared';
import type { z } from 'zod';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { clientMeta, type AppRequest, type AuthUser, type OrgContext } from '../common/request.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { CurrentOrg, OrgContextGuard, RequirePermission } from './org-context.guard.js';
import { OrgsService } from './orgs.service.js';
import { StaffService } from './staff.service.js';

@ApiTags('orgs')
@Controller('orgs')
@UseGuards(AuthGuard)
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Post()
  @ApiZodBody(CreateOrgSchema)
  create(
    @Body(new ZodPipe(CreateOrgSchema)) body: z.output<typeof CreateOrgSchema>,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ) {
    return this.orgs.create(user, body, clientMeta(req));
  }

  @Get(':slug')
  @UseGuards(OrgContextGuard)
  @RequirePermission('club.view')
  get(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.orgs.get(org, user);
  }

  @Patch(':slug')
  @UseGuards(OrgContextGuard)
  @RequirePermission('club.manage')
  @ApiZodBody(UpdateOrgSchema)
  update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(UpdateOrgSchema)) body: z.output<typeof UpdateOrgSchema>,
    @Req() req: AppRequest,
  ) {
    return this.orgs.update(org, user, body, clientMeta(req));
  }

  @Get(':slug/branches')
  @UseGuards(OrgContextGuard)
  @RequirePermission('club.view')
  branches(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.orgs.listBranches(org, user);
  }

  @Post(':slug/branches')
  @UseGuards(OrgContextGuard)
  @RequirePermission('club.manage')
  @ApiZodBody(BranchInputSchema)
  addBranch(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(BranchInputSchema)) body: z.output<typeof BranchInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.orgs.addBranch(org, user, body, clientMeta(req));
  }

  @Put(':slug/branches/:branchId')
  @UseGuards(OrgContextGuard)
  @RequirePermission('club.manage')
  @ApiZodBody(BranchInputSchema)
  updateBranch(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body(new ZodPipe(BranchInputSchema)) body: z.output<typeof BranchInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.orgs.updateBranch(org, user, branchId, body, clientMeta(req));
  }

  @Delete(':slug/branches/:branchId')
  @HttpCode(204)
  @UseGuards(OrgContextGuard)
  @RequirePermission('club.manage')
  async archiveBranch(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Req() req: AppRequest,
  ) {
    await this.orgs.archiveBranch(org, user, branchId, clientMeta(req));
  }

  @Get(':slug/bank-account')
  @UseGuards(OrgContextGuard)
  @RequirePermission('club.manage')
  bankAccount(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.orgs.getBankAccount(org, user);
  }

  @Put(':slug/bank-account')
  @UseGuards(OrgContextGuard)
  @RequirePermission('club.manage_finance_settings')
  @ApiZodBody(BankAccountInputSchema)
  replaceBankAccount(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(BankAccountInputSchema)) body: z.output<typeof BankAccountInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.orgs.replaceBankAccount(org, user, body, clientMeta(req));
  }
}

@ApiTags('staff')
@Controller('orgs/:slug/staff')
@UseGuards(AuthGuard, OrgContextGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermission('staff.view')
  list(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.staff.list(org, user);
  }

  @Post()
  @RequirePermission('staff.invite')
  @ApiZodBody(InviteStaffSchema)
  invite(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(InviteStaffSchema)) body: z.output<typeof InviteStaffSchema>,
    @Req() req: AppRequest,
  ) {
    return this.staff.invite(org, user, body, clientMeta(req));
  }

  @Patch(':staffId')
  @RequirePermission('staff.invite')
  @ApiZodBody(UpdateStaffSchema)
  changeRole(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body(new ZodPipe(UpdateStaffSchema)) body: z.output<typeof UpdateStaffSchema>,
    @Req() req: AppRequest,
  ) {
    return this.staff.changeRole(org, user, staffId, body.role, clientMeta(req));
  }

  @Delete(':staffId')
  @HttpCode(204)
  @RequirePermission('staff.invite')
  async remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Req() req: AppRequest,
  ) {
    await this.staff.remove(org, user, staffId, clientMeta(req));
  }
}

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly staff: StaffService) {}

  /** Publik: dibuka dari link WhatsApp sebelum login. */
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.staff.preview(token);
  }

  @Post('accept')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiZodBody(AcceptInvitationSchema)
  accept(
    @Body(new ZodPipe(AcceptInvitationSchema)) body: z.output<typeof AcceptInvitationSchema>,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ) {
    return this.staff.accept(body.token, user, clientMeta(req));
  }
}
