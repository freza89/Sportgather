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
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import {
  CheckoutSchema,
  FeePlanInputSchema,
  InvoiceListQuerySchema,
  IssueInvoicesSchema,
  ManualPaymentSchema,
  MidtransNotificationSchema,
  OneTimeFeeSchema,
  ScholarshipSchema,
  WithdrawalSchema,
} from '@sportgather/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { readMultipart } from '../common/multipart.js';
import { clientMeta, type AppRequest, type AuthUser, type OrgContext } from '../common/request.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { CurrentOrg, OrgContextGuard, RequirePermission } from '../orgs/org-context.guard.js';
import { BillingJobs } from './jobs.js';
import { BillingService } from './billing.service.js';
import { PaymentsService } from './payments.service.js';
import { renderReceipt } from './receipt.js';

const StatusChangeSchema = z.object({
  status: z.enum(['waived', 'void']),
  reason: z.string().trim().min(3, 'Isi alasan').max(200),
});

async function sendPdf(reply: FastifyReply, name: string, bytes: Uint8Array) {
  reply
    .header('content-type', 'application/pdf')
    .header('content-disposition', `inline; filename="${name}.pdf"`)
    .header('cache-control', 'private, no-store');
  return Buffer.from(bytes);
}

// A-13/A-14 · Iuran & tagihan (admin)
@ApiTags('billing')
@Controller('orgs/:slug/billing')
@UseGuards(AuthGuard, OrgContextGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('plans')
  @RequirePermission('billing.manage')
  plans(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.billing.listPlans(org, user);
  }

  @Post('plans')
  @RequirePermission('billing.manage')
  @ApiZodBody(FeePlanInputSchema)
  createPlan(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(FeePlanInputSchema)) body: z.output<typeof FeePlanInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.billing.createPlan(org, user, body, clientMeta(req));
  }

  @Patch('plans/:planId')
  @RequirePermission('billing.manage')
  @ApiZodBody(FeePlanInputSchema)
  updatePlan(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('planId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(FeePlanInputSchema)) body: z.output<typeof FeePlanInputSchema>,
    @Req() req: AppRequest,
  ) {
    return this.billing.updatePlan(org, user, id, body, clientMeta(req));
  }

  @Post('plans/:planId/issue')
  @RequirePermission('billing.manage')
  issueRegistration(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('planId', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ) {
    return this.billing.issueRegistration(org, user, id, clientMeta(req));
  }

  @Get('scholarships')
  @RequirePermission('billing.manage')
  scholarships(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.billing.listScholarships(org, user);
  }

  @Post('scholarships')
  @RequirePermission('billing.scholarship')
  @ApiZodBody(ScholarshipSchema)
  setScholarship(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(ScholarshipSchema)) body: z.output<typeof ScholarshipSchema>,
    @Req() req: AppRequest,
  ) {
    return this.billing.setScholarship(org, user, body, clientMeta(req));
  }

  @Get('invoices')
  @RequirePermission('billing.manage')
  invoices(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(InvoiceListQuerySchema)) q: z.output<typeof InvoiceListQuerySchema>,
  ) {
    return this.billing.listInvoices(org, user, q);
  }

  @Post('invoices/issue')
  @RequirePermission('billing.manage')
  @ApiZodBody(IssueInvoicesSchema)
  issue(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(IssueInvoicesSchema)) body: z.output<typeof IssueInvoicesSchema>,
    @Req() req: AppRequest,
  ) {
    return this.billing.issueMonthly(org, user, body.period, clientMeta(req));
  }

  @Post('invoices/one-time')
  @RequirePermission('billing.manage')
  @ApiZodBody(OneTimeFeeSchema)
  oneTime(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(OneTimeFeeSchema)) body: z.output<typeof OneTimeFeeSchema>,
    @Req() req: AppRequest,
  ) {
    return this.billing.oneTime(org, user, body, clientMeta(req));
  }

  /** US-14: catat bayar tunai/transfer. JSON, atau multipart (`data` + berkas `proof`). */
  @Post('invoices/:invoiceId/manual-payment')
  @RequirePermission('billing.manage')
  async manual(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ) {
    let data: unknown = req.body;
    let proof;
    if (req.isMultipart()) {
      const mp = await readMultipart(req);
      data = mp.data;
      proof = mp.files.get('proof');
    }
    const body = new ZodPipe(ManualPaymentSchema).transform(data);
    return this.billing.recordManual(org, user, id, body, proof, clientMeta(req));
  }

  @Patch('invoices/:invoiceId/status')
  @RequirePermission('billing.manage')
  @ApiZodBody(StatusChangeSchema)
  setStatus(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(StatusChangeSchema)) body: z.output<typeof StatusChangeSchema>,
    @Req() req: AppRequest,
  ) {
    return this.billing.setStatus(org, user, id, body.status, body.reason, clientMeta(req));
  }

  @Get('invoices/:invoiceId/proof')
  @RequirePermission('billing.manage')
  async proof(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const f = await this.billing.proof(org, user, id);
    reply.header('content-type', f.mime).header('cache-control', 'private, no-store');
    return f.body;
  }

  @Get('invoices/:invoiceId/receipt.pdf')
  @RequirePermission('billing.manage')
  async receipt(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('invoiceId', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const r = await this.payments.receiptForInvoice(org, user, id);
    return sendPdf(reply, `kuitansi-${r.invoiceNumber}`, await renderReceipt(r));
  }

  // A-15 · Penyaluran dana
  @Get('payouts')
  @RequirePermission('payout.view')
  payouts(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser) {
    return this.payments.payoutOverview(org, user);
  }

  @Post('payouts/withdraw')
  @RequirePermission('payout.withdraw')
  @ApiZodBody(WithdrawalSchema)
  withdraw(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(WithdrawalSchema)) body: z.output<typeof WithdrawalSchema>,
    @Req() req: AppRequest,
  ) {
    return this.payments.withdraw(org, user, body.amount, clientMeta(req));
  }
}

const QuoteSchema = z.object({ invoiceIds: CheckoutSchema.shape.invoiceIds });

// O-05 · Wali membayar
@ApiTags('billing')
@Controller('me')
@UseGuards(AuthGuard)
export class MyBillingController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('invoices')
  invoices(@CurrentUser() user: AuthUser) {
    return this.payments.myInvoices(user);
  }

  @Get('payments')
  history(@CurrentUser() user: AuthUser) {
    return this.payments.myPayments(user);
  }

  @Post('checkout/quote')
  @HttpCode(200)
  @ApiZodBody(QuoteSchema)
  quote(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(QuoteSchema)) body: z.output<typeof QuoteSchema>,
  ) {
    return this.payments.quote(user, body.invoiceIds);
  }

  @Post('checkout')
  @ApiZodBody(CheckoutSchema)
  checkout(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(CheckoutSchema)) body: z.output<typeof CheckoutSchema>,
    @Req() req: AppRequest,
  ) {
    return this.payments.createCheckout(user, body, clientMeta(req));
  }

  @Get('checkout/:checkoutId')
  status(@CurrentUser() user: AuthUser, @Param('checkoutId', ParseUUIDPipe) id: string) {
    return this.payments.checkoutStatus(user, id);
  }

  @Get('payments/:paymentId/receipt.pdf')
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('paymentId', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const r = await this.payments.receiptForGuardian(user, id);
    return sendPdf(reply, `kuitansi-${r.invoiceNumber}`, await renderReceipt(r));
  }
}

/** HTTP notification Midtrans — publik, diverifikasi lewat signature_key. */
@ApiTags('billing')
@Controller('webhooks/midtrans')
export class MidtransWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  notify(
    @Body(new ZodPipe(MidtransNotificationSchema))
    body: z.output<typeof MidtransNotificationSchema>,
  ) {
    return this.payments.handleNotification(body);
  }
}

@Module({
  controllers: [BillingController, MyBillingController, MidtransWebhookController],
  providers: [BillingService, PaymentsService, BillingJobs, AuditService, OrgContextGuard],
  exports: [BillingService, PaymentsService],
})
export class BillingModule {}
