CREATE TYPE "public"."coach_license_status" AS ENUM('in_progress', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "coach_experience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"staff_role_id" uuid NOT NULL,
	"title" text NOT NULL,
	"organization" text NOT NULL,
	"start_year" smallint NOT NULL,
	"end_year" smallint,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_experience_years_ck" CHECK ("coach_experience"."end_year" is null or "coach_experience"."end_year" >= "coach_experience"."start_year")
);
--> statement-breakpoint
CREATE TABLE "coach_license" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"staff_role_id" uuid NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"level" text,
	"license_number" text,
	"issued_on" date,
	"expires_on" date,
	"status" "coach_license_status" NOT NULL,
	"file_storage_key" text,
	"file_name" text,
	"file_mime_type" text,
	"file_size_bytes" integer,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reminder_stage" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_license_dates_ck" CHECK ("coach_license"."expires_on" is null or "coach_license"."issued_on" is null or "coach_license"."expires_on" >= "coach_license"."issued_on")
);
--> statement-breakpoint
CREATE TABLE "coach_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"staff_role_id" uuid NOT NULL,
	"headline" text,
	"specialization" text,
	"bio" text,
	"years_coaching" smallint,
	"playing_background" text,
	"education" text,
	"city" text,
	"photo_storage_key" text,
	"photo_mime_type" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_profile_years_ck" CHECK ("coach_profile"."years_coaching" is null or "coach_profile"."years_coaching" between 0 and 60)
);
--> statement-breakpoint
ALTER TABLE "coach_experience" ADD CONSTRAINT "coach_experience_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_experience" ADD CONSTRAINT "coach_experience_staff_role_id_staff_role_id_fk" FOREIGN KEY ("staff_role_id") REFERENCES "public"."staff_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_license" ADD CONSTRAINT "coach_license_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_license" ADD CONSTRAINT "coach_license_staff_role_id_staff_role_id_fk" FOREIGN KEY ("staff_role_id") REFERENCES "public"."staff_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_license" ADD CONSTRAINT "coach_license_reviewed_by_person_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_license" ADD CONSTRAINT "coach_license_created_by_person_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD CONSTRAINT "coach_profile_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD CONSTRAINT "coach_profile_staff_role_id_staff_role_id_fk" FOREIGN KEY ("staff_role_id") REFERENCES "public"."staff_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD CONSTRAINT "coach_profile_updated_by_person_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_experience_staff_idx" ON "coach_experience" USING btree ("staff_role_id");--> statement-breakpoint
CREATE INDEX "coach_license_staff_idx" ON "coach_license" USING btree ("staff_role_id");--> statement-breakpoint
CREATE INDEX "coach_license_expiry_idx" ON "coach_license" USING btree ("org_id","expires_on");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_profile_staff_key" ON "coach_profile" USING btree ("staff_role_id");--> statement-breakpoint
CREATE INDEX "coach_profile_org_idx" ON "coach_profile" USING btree ("org_id");