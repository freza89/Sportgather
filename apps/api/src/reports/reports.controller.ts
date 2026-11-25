import { Controller, Get, Module, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReportPeriodSchema, type ReportKind } from '@sportgather/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser, OrgContext } from '../common/request.js';
import { ZodPipe } from '../common/zod.js';
import { CurrentOrg, OrgContextGuard, RequirePermission } from '../orgs/org-context.guard.js';
import { REPORT_TITLES, summaryTable, toPdf, toTables, toXlsx } from './export.js';
import { ReportsService } from './reports.service.js';

const KindSchema = z.enum(['receivables', 'revenue', 'attendance', 'payouts']);
const ExportQuery = ReportPeriodSchema.and(
  z.object({ format: z.enum(['xlsx', 'pdf']).default('xlsx') }),
);

@ApiTags('reports')
@Controller('orgs/:slug')
@UseGuards(AuthGuard, OrgContextGuard)
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  // A-17
  @Get('dashboard')
  @RequirePermission('players.manage')
  dashboard(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.svc.dashboard(org, user);
  }

  private async data(
    org: OrgContext,
    user: AuthUser,
    kind: ReportKind,
    q: z.output<typeof ReportPeriodSchema>,
  ) {
    return this.svc.withPeriod(org, user, q, async (tx, p) => {
      const summary = await this.svc.summary(tx, p);
      let data: unknown;
      if (kind === 'receivables') data = await this.svc.receivables(tx, p);
      else if (kind === 'attendance') data = await this.svc.attendance(tx, p);
      else if (kind === 'payouts') data = await this.svc.payouts(tx, p);
      else {
        const r = await this.svc.revenue(tx, p);
        data = { ...r, rows: r.rows.map((x) => ({ ...x, label: this.svc.kuName(x.ku) })) };
      }
      return { period: p, summary, data };
    });
  }

  // A-18 pratinjau
  @Get('reports/:kind')
  @RequirePermission('billing.manage')
  report(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('kind', new ZodPipe(KindSchema)) kind: ReportKind,
    @Query(new ZodPipe(ReportPeriodSchema)) q: z.output<typeof ReportPeriodSchema>,
  ) {
    return this.data(org, user, kind, q);
  }

  @Get('reports/:kind/export')
  @RequirePermission('billing.manage')
  async export(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('kind', new ZodPipe(KindSchema)) kind: ReportKind,
    @Query(new ZodPipe(ExportQuery)) q: z.output<typeof ExportQuery>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { period, summary, data } = await this.data(org, user, kind, q);
    const tables = [summaryTable(summary), ...toTables(kind, data)];
    const name = `${kind}-${period.from}_${period.to}`;
    reply.header('cache-control', 'private, no-store');
    if (q.format === 'pdf') {
      reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="${name}.pdf"`);
      return Buffer.from(await toPdf(org.slug, REPORT_TITLES[kind], period, tables));
    }
    reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${name}.xlsx"`);
    return toXlsx(tables);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
