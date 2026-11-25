-- Hapus data anak atas permintaan wali (ADR-029, revisi M5). Bagian identitas lintas klub
-- (person, guardian_link) dikerjakan fungsi ini: hanya untuk keanggotaan di klub konteks
-- (app_org_id), dan identitas hanya dianonimkan bila anak tidak terdaftar di klub lain.
CREATE OR REPLACE FUNCTION sg_erase_child_identity(p_membership uuid)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
  AS $$
DECLARE
  v_person uuid;
BEGIN
  SELECT person_id INTO v_person FROM membership
    WHERE id = p_membership AND org_id = app_org_id();
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'membership not in current org';
  END IF;
  IF EXISTS (SELECT 1 FROM membership WHERE person_id = v_person AND org_id <> app_org_id()) THEN
    RETURN false;
  END IF;
  DELETE FROM guardian_link WHERE child_person_id = v_person;
  UPDATE person SET full_name = 'Data dihapus', birth_date = NULL, gender = NULL, updated_at = now()
    WHERE id = v_person;
  RETURN true;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sg_erase_child_identity(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sg_erase_child_identity(uuid) TO sg_app;
