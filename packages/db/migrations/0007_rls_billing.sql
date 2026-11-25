-- RLS tabel iuran & pembayaran (M4).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_plan', 'invoice_counter', 'invoice', 'checkout', 'checkout_invoice', 'payment_attempt', 'gateway_event', 'payment', 'withdrawal', 'ledger_entry']
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
-- Ledger append-only bagi aplikasi.
REVOKE UPDATE, DELETE ON ledger_entry FROM sg_app;
--> statement-breakpoint
-- Webhook Midtrans datang tanpa konteks klub: temukan klub dari order_id (data minimal).
CREATE OR REPLACE FUNCTION sg_find_payment_attempt(p_order_id text)
  RETURNS TABLE (attempt_id uuid, org_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT a.id, a.org_id FROM payment_attempt a WHERE a.order_id = p_order_id $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sg_find_payment_attempt(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sg_find_payment_attempt(text) TO sg_app;
