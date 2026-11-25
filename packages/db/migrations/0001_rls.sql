-- Isolasi tenant dengan Row-Level Security (ADR-002).
-- Role runtime `sg_app` TIDAK punya BYPASSRLS; semua tabel tenant memakai FORCE RLS.
-- Konteks diisi per transaksi oleh withContext(): app.org_id dan app.person_id.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sg_app') THEN
    CREATE ROLE sg_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO sg_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sg_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sg_app;
--> statement-breakpoint
-- Audit log append-only.
REVOKE UPDATE, DELETE ON audit_log FROM sg_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON auth_event FROM sg_app;
--> statement-breakpoint
-- Tabel riwayat migrasi tidak boleh disentuh aplikasi.
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM sg_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_org_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_person_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.person_id', true), '')::uuid $$;
--> statement-breakpoint

-- Policy standar untuk tabel bertipe tenant (punya kolom org_id).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['branch', 'bank_account', 'invitation', 'membership', 'consent', 'audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO sg_app USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id())',
      t
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- staff_role: terbaca di klub aktif, ATAU baris milik orang yang sedang login
-- (untuk daftar "klub saya" sebelum memilih klub). Tulis hanya di klub aktif.
ALTER TABLE staff_role ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_role FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY staff_role_read ON staff_role FOR SELECT TO sg_app
  USING (org_id = app_org_id() OR person_id = app_person_id());
--> statement-breakpoint
CREATE POLICY staff_role_write ON staff_role FOR ALL TO sg_app
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint

-- organization: id adalah tenant itu sendiri. Terbaca bila klub aktif, atau bila
-- orang yang login adalah staf (belum dihapus) di klub tersebut.
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organization FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organization_read ON organization FOR SELECT TO sg_app
  USING (
    id = app_org_id()
    OR EXISTS (
      SELECT 1 FROM staff_role s
      WHERE s.org_id = organization.id AND s.person_id = app_person_id() AND s.status <> 'removed'
    )
  );
--> statement-breakpoint
CREATE POLICY organization_write ON organization FOR ALL TO sg_app
  USING (id = app_org_id()) WITH CHECK (id = app_org_id());
--> statement-breakpoint

-- Mencari undangan dari token (sebelum klubnya diketahui). SECURITY DEFINER dengan
-- keluaran minimal: hanya id & org_id, tidak membuka data lain.
CREATE OR REPLACE FUNCTION sg_find_invitation(p_token_hash text)
  RETURNS TABLE (invitation_id uuid, org_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT i.id, i.org_id FROM invitation i WHERE i.token_hash = p_token_hash $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sg_find_invitation(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sg_find_invitation(text) TO sg_app;
--> statement-breakpoint
-- Cek ketersediaan slug klub saat pendaftaran (slug klub lain tidak terbaca lewat RLS).
CREATE OR REPLACE FUNCTION sg_slug_taken(p_slug text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM organization WHERE slug = p_slug) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sg_slug_taken(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sg_slug_taken(text) TO sg_app;
