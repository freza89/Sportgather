-- RLS tabel komunikasi, pembinaan & hak data (M5).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['announcement', 'announcement_recipient', 'skill', 'assessment', 'assessment_note', 'report_publication', 'data_request']
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
-- Langganan push milik orangnya sendiri.
ALTER TABLE push_subscription ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE push_subscription FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY own_subscription ON push_subscription FOR ALL TO sg_app
  USING (person_id = app_person_id()) WITH CHECK (person_id = app_person_id());
--> statement-breakpoint
-- Pengirim notifikasi (tanpa konteks orang): ambil langganan penerima.
CREATE OR REPLACE FUNCTION sg_push_targets(p_people uuid[])
  RETURNS TABLE (id uuid, person_id uuid, endpoint text, p256dh text, auth text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT s.id, s.person_id, s.endpoint, s.p256dh, s.auth FROM push_subscription s WHERE s.person_id = ANY(p_people) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sg_push_targets(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sg_push_targets(uuid[]) TO sg_app;
--> statement-breakpoint
-- Hasil kirim: hapus langganan kedaluwarsa (410/404) atau catat sukses.
CREATE OR REPLACE FUNCTION sg_push_result(p_id uuid, p_ok boolean)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
  AS $$
    DELETE FROM push_subscription WHERE id = p_id AND NOT p_ok;
    UPDATE push_subscription SET last_success_at = now() WHERE id = p_id AND p_ok;
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sg_push_result(uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sg_push_result(uuid, boolean) TO sg_app;
