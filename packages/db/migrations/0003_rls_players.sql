-- RLS untuk tabel M2 + perlindungan data orang (ADR-015).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['season', 'competition', 'team', 'team_member', 'team_staff', 'team_competition', 'document']
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

-- person: data anak & wali. Terbaca bila (a) dirinya sendiri, (b) anggota/staf di klub
-- aktif, (c) anak dari orang yang login, atau (d) wali dari anggota klub aktif.
-- INSERT bebas (pendaftaran/impor membuat orang baru) — id dibuat aplikasi agar tidak
-- butuh RETURNING sebelum relasinya ada.
ALTER TABLE person ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE person FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sg_person_visible(p_person uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT p_person = app_person_id()
      OR EXISTS (SELECT 1 FROM membership m WHERE m.person_id = p_person AND m.org_id = app_org_id())
      OR EXISTS (SELECT 1 FROM staff_role s WHERE s.person_id = p_person AND s.org_id = app_org_id())
      OR EXISTS (SELECT 1 FROM guardian_link g WHERE g.guardian_person_id = app_person_id() AND g.child_person_id = p_person)
      OR EXISTS (
        SELECT 1 FROM guardian_link g JOIN membership m ON m.person_id = g.child_person_id
        WHERE g.guardian_person_id = p_person AND m.org_id = app_org_id()
      )
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sg_person_visible(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sg_person_visible(uuid) TO sg_app;
--> statement-breakpoint
CREATE POLICY person_read ON person FOR SELECT TO sg_app USING (sg_person_visible(id));
--> statement-breakpoint
CREATE POLICY person_insert ON person FOR INSERT TO sg_app WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY person_update ON person FOR UPDATE TO sg_app USING (sg_person_visible(id)) WITH CHECK (true);
--> statement-breakpoint

-- guardian_link: terbaca oleh wali itu sendiri atau oleh klub tempat anaknya terdaftar.
ALTER TABLE guardian_link ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE guardian_link FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY guardian_link_read ON guardian_link FOR SELECT TO sg_app
  USING (
    guardian_person_id = app_person_id()
    OR EXISTS (SELECT 1 FROM membership m WHERE m.person_id = guardian_link.child_person_id AND m.org_id = app_org_id())
  );
--> statement-breakpoint
CREATE POLICY guardian_link_insert ON guardian_link FOR INSERT TO sg_app
  WITH CHECK (
    guardian_person_id = app_person_id()
    OR EXISTS (SELECT 1 FROM membership m WHERE m.person_id = guardian_link.child_person_id AND m.org_id = app_org_id())
  );
--> statement-breakpoint
CREATE POLICY guardian_link_update ON guardian_link FOR UPDATE TO sg_app
  USING (EXISTS (SELECT 1 FROM membership m WHERE m.person_id = guardian_link.child_person_id AND m.org_id = app_org_id()));
--> statement-breakpoint

-- Formulir pendaftaran publik (O-01): cari klub dari slug tanpa membuka data klub lain.
CREATE OR REPLACE FUNCTION sg_org_id_by_slug(p_slug text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM organization WHERE slug = p_slug $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sg_org_id_by_slug(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sg_org_id_by_slug(text) TO sg_app;
--> statement-breakpoint

-- Portal wali: daftar klub tempat anak-anak saya terdaftar (lintas tenant, data minimal).
CREATE OR REPLACE FUNCTION sg_my_children_orgs(p_guardian uuid)
  RETURNS TABLE (org_id uuid, membership_id uuid, child_person_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT m.org_id, m.id, m.person_id
    FROM guardian_link g JOIN membership m ON m.person_id = g.child_person_id
    WHERE g.guardian_person_id = p_guardian AND p_guardian = app_person_id()
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sg_my_children_orgs(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sg_my_children_orgs(uuid) TO sg_app;
