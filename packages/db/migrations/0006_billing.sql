CREATE TYPE "public"."checkout_status" AS ENUM('pending', 'paid', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."fee_plan_kind" AS ENUM('monthly', 'registration');--> statement-breakpoint
CREATE TYPE "public"."invoice_kind" AS ENUM('recurring', 'registration', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('unpaid', 'paid', 'waived', 'void');--> statement-breakpoint
CREATE TYPE "public"."ledger_kind" AS ENUM('club_gross', 'platform_fee', 'midtrans_fee', 'withdrawal', 'refund');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'bukti_bayar';--> statement-breakpoint
CREATE TABLE "checkout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"guardian_person_id" uuid NOT NULL,
	"method" text NOT NULL,
	"base" bigint NOT NULL,
	"service_fee" bigint NOT NULL,
	"gross" bigint NOT NULL,
	"platform_fee" bigint NOT NULL,
	"status" "checkout_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_invoice" (
	"org_id" uuid NOT NULL,
	"checkout_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	CONSTRAINT "checkout_invoice_checkout_id_invoice_id_pk" PRIMARY KEY("checkout_id","invoice_id")
);
--> statement-breakpoint
CREATE TABLE "fee_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "fee_plan_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"issue_day" integer DEFAULT 1 NOT NULL,
	"due_days" integer DEFAULT 9 NOT NULL,
	"ku_groups" integer[],
	"team_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"transaction_status" text NOT NULL,
	"status_code" text NOT NULL,
	"gross_amount" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"membership_id" uuid NOT NULL,
	"plan_id" uuid,
	"kind" "invoice_kind" NOT NULL,
	"period" text,
	"description" text NOT NULL,
	"amount" bigint NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"total" bigint NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "invoice_status" DEFAULT 'unpaid' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_via" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_counter" (
	"org_id" uuid NOT NULL,
	"period" text NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_counter_org_id_period_pk" PRIMARY KEY("org_id","period")
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "ledger_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"invoice_id" uuid,
	"payment_id" uuid,
	"checkout_id" uuid,
	"withdrawal_id" uuid,
	"available_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"checkout_id" uuid,
	"method" text NOT NULL,
	"amount" bigint NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"recorded_by" uuid,
	"proof_document_id" uuid,
	"reference" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"checkout_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"method" text NOT NULL,
	"gross" bigint NOT NULL,
	"snap_token" text,
	"redirect_url" text,
	"gateway_status" text DEFAULT 'pending' NOT NULL,
	"payment_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"fee" bigint NOT NULL,
	"net" bigint NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"status" "withdrawal_status" DEFAULT 'processing' NOT NULL,
	"provider_ref" text,
	"failure_reason" text,
	"requested_by" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "scholarship_pct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "scholarship_reason" text;--> statement-breakpoint
ALTER TABLE "checkout" ADD CONSTRAINT "checkout_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout" ADD CONSTRAINT "checkout_guardian_person_id_person_id_fk" FOREIGN KEY ("guardian_person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_invoice" ADD CONSTRAINT "checkout_invoice_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_invoice" ADD CONSTRAINT "checkout_invoice_checkout_id_checkout_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_invoice" ADD CONSTRAINT "checkout_invoice_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plan" ADD CONSTRAINT "fee_plan_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plan" ADD CONSTRAINT "fee_plan_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_event" ADD CONSTRAINT "gateway_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_plan_id_fee_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."fee_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_person_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_counter" ADD CONSTRAINT "invoice_counter_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_checkout_id_checkout_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkout"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_withdrawal_id_withdrawal_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_checkout_id_checkout_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkout"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_recorded_by_person_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_proof_document_id_document_id_fk" FOREIGN KEY ("proof_document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_checkout_id_checkout_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal" ADD CONSTRAINT "withdrawal_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal" ADD CONSTRAINT "withdrawal_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal" ADD CONSTRAINT "withdrawal_requested_by_person_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_guardian_idx" ON "checkout" USING btree ("org_id","guardian_person_id");--> statement-breakpoint
CREATE INDEX "fee_plan_org_idx" ON "fee_plan" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_event_key" ON "gateway_event" USING btree ("order_id","transaction_status","status_code");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_number_key" ON "invoice" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_period_key" ON "invoice" USING btree ("membership_id","plan_id","period") WHERE "invoice"."plan_id" is not null and "invoice"."period" is not null and "invoice"."status" <> 'void';--> statement-breakpoint
CREATE INDEX "invoice_org_due_idx" ON "invoice" USING btree ("org_id","due_date");--> statement-breakpoint
CREATE INDEX "ledger_org_available_idx" ON "ledger_entry" USING btree ("org_id","available_at");--> statement-breakpoint
CREATE INDEX "ledger_invoice_idx" ON "ledger_entry" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_invoice_key" ON "payment" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_checkout_idx" ON "payment" USING btree ("checkout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempt_order_key" ON "payment_attempt" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "withdrawal_org_idx" ON "withdrawal" USING btree ("org_id","created_at");