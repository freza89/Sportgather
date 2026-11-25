CREATE TYPE "public"."document_kind" AS ENUM('akta', 'kia', 'kk', 'foto');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ku_rule" AS ENUM('UNDER_N', 'MAX_N');--> statement-breakpoint
CREATE TYPE "public"."placement" AS ENUM('same', 'play_up', 'play_down', 'over_age');--> statement-breakpoint
CREATE TYPE "public"."registration_source" AS ENUM('online', 'import', 'manual');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."team_gender" AS ENUM('male', 'female', 'mixed');--> statement-breakpoint
ALTER TYPE "public"."membership_status" ADD VALUE 'pending' BEFORE 'active';--> statement-breakpoint
ALTER TYPE "public"."membership_status" ADD VALUE 'rejected' BEFORE 'active';--> statement-breakpoint
CREATE TABLE "competition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"organizer" text,
	"kind" text DEFAULT 'Liga' NOT NULL,
	"reference_date" date NOT NULL,
	"ku_rule" "ku_rule",
	"ku_groups" integer[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" "document_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"uploaded_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" "season_status" DEFAULT 'draft' NOT NULL,
	"ku_rule" "ku_rule" DEFAULT 'MAX_N' NOT NULL,
	"ku_groups" integer[] DEFAULT '{8,10,12,14,16}'::integer[] NOT NULL,
	"primary_competition_id" uuid,
	"promotion_draft" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" text NOT NULL,
	"ku" integer NOT NULL,
	"level" text NOT NULL,
	"gender" "team_gender" DEFAULT 'mixed' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_competition" (
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"competition_id" uuid NOT NULL,
	CONSTRAINT "team_competition_team_id_competition_id_pk" PRIMARY KEY("team_id","competition_id")
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"jersey_number" integer,
	"actual_ku" integer,
	"placement" "placement" DEFAULT 'same' NOT NULL,
	"placement_reason" text,
	"approved_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_staff" (
	"org_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"staff_role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_staff_team_id_staff_role_id_pk" PRIMARY KEY("team_id","staff_role_id")
);
--> statement-breakpoint
ALTER TABLE "guardian_link" ADD COLUMN "is_primary" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "source" "registration_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "school" text;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "emergency_contact_name" text;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "emergency_contact_phone" text;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "photo_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "registered_by" uuid;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_uploaded_by_person_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_reviewed_by_person_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_primary_competition_id_competition_id_fk" FOREIGN KEY ("primary_competition_id") REFERENCES "public"."competition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_competition" ADD CONSTRAINT "team_competition_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_competition" ADD CONSTRAINT "team_competition_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_competition" ADD CONSTRAINT "team_competition_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_approved_by_person_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_staff" ADD CONSTRAINT "team_staff_staff_role_id_staff_role_id_fk" FOREIGN KEY ("staff_role_id") REFERENCES "public"."staff_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_season_idx" ON "competition" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "document_person_idx" ON "document" USING btree ("org_id","person_id");--> statement-breakpoint
CREATE INDEX "season_org_idx" ON "season" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "season_active_key" ON "season" USING btree ("org_id") WHERE "season"."status" = 'active';--> statement-breakpoint
CREATE INDEX "team_season_idx" ON "team" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "team_member_team_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_member_active_key" ON "team_member" USING btree ("membership_id","season_id") WHERE "team_member"."left_at" is null;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_registered_by_person_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_reviewed_by_person_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guardian_link_child_idx" ON "guardian_link" USING btree ("child_person_id");--> statement-breakpoint
CREATE INDEX "membership_org_status_idx" ON "membership" USING btree ("org_id","status");