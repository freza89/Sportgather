-- RLS profil & lisensi pelatih (M7).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['coach_profile', 'coach_experience', 'coach_license']
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
