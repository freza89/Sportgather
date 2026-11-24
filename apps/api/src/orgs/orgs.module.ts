import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { InvitationsController, OrgsController, StaffController } from './orgs.controller.js';
import { OrgContextGuard } from './org-context.guard.js';
import { OrgsService } from './orgs.service.js';
import { StaffService } from './staff.service.js';

@Module({
  controllers: [OrgsController, StaffController, InvitationsController],
  providers: [OrgsService, StaffService, OrgContextGuard, AuditService],
})
export class OrgsModule {}
