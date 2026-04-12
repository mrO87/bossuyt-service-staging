-- Audit trigger function
-- Fired after every INSERT / UPDATE / DELETE on tracked tables.
-- Reads the session variable app.current_user (set via set_config before writes)
-- to record who made the change.

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _changed_by text;
  _record_id  text;
BEGIN
  -- Read the session-local user set by the application layer
  _changed_by := nullif(current_setting('app.current_user', true), '');

  IF (TG_OP = 'DELETE') THEN
    _record_id := to_jsonb(OLD) ->> 'id';
    INSERT INTO audit_log (table_name, record_id, operation, changed_by, old_data)
    VALUES (TG_TABLE_NAME, _record_id, TG_OP, _changed_by, to_jsonb(OLD));
    RETURN OLD;
  ELSE
    _record_id := to_jsonb(NEW) ->> 'id';
    INSERT INTO audit_log (table_name, record_id, operation, changed_by, old_data, new_data)
    VALUES (
      TG_TABLE_NAME,
      _record_id,
      TG_OP,
      _changed_by,
      CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
      to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;
END;
$$;

-- Create (or replace) triggers on all tracked tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'technicians',
    'customers',
    'sites',
    'contacts',
    'devices',
    'work_orders',
    'work_order_assignments',
    'device_documents',
    'werkbonnen'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS audit_%I ON %I;
       CREATE TRIGGER audit_%I
         AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();',
      t, t, t, t
    );
  END LOOP;
END $$;
