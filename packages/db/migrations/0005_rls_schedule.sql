-- RLS tabel jadwal & absensi (M3).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_series', 'event', 'holiday', 'rsvp', 'attendance', 'attendance_op', 'access_token', 'notification_log']
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
-- Link bertoken dari WhatsApp: temukan klubnya tanpa membuka data lain.
CREATE OR REPLACE FUNCTION sg_find_access_token(p_token_hash text)
  RETURNS TABLE (token_id uuid, org_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT t.id, t.org_id FROM access_token t WHERE t.token_hash = p_token_hash $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sg_find_access_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sg_find_access_token(text) TO sg_app;
--> statement-breakpoint
-- Job terjadwal (pengingat) berjalan per klub: daftar id klub saja.
CREATE OR REPLACE FUNCTION sg_all_org_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM organization $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sg_all_org_ids() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sg_all_org_ids() TO sg_app;
