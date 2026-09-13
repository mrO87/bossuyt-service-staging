-- Toestellen op de bon — zie docs/superpowers/specs/2026-09-13-toestellen-op-de-bon-ontwerp.md
--
-- Handmatig uit te voeren op BEIDE databases: bossuyt_staging én bossuyt_test.
--
-- Alles is herhaalbaar (IF NOT EXISTS / ON CONFLICT), zodat twee keer draaien
-- niets stukmaakt.

-- 1. De toestellen waar een bezoek over gaat.
--
-- `work_orders.device_id` blijft bestaan als het hoofdtoestel — daar hangen het
-- verslag en de onderdelen aan. Deze tabel zegt wélke toestellen de bon raakt.
-- Wanneer het verslag later per toestel gaat, splitst het langs deze rijen.
CREATE TABLE IF NOT EXISTS work_order_devices (
  work_order_id text NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  device_id     text NOT NULL REFERENCES devices(id)     ON DELETE RESTRICT,
  position      integer NOT NULL DEFAULT 1,
  PRIMARY KEY (work_order_id, device_id)
);

CREATE INDEX IF NOT EXISTS work_order_devices_device_idx
  ON work_order_devices (device_id);

-- 2. De regel zoals ze op de bon stond.
--
-- Merk en model worden eruit gegokt; zonder de bron zou een verkeerde gok
-- betekenen dat iemand de papieren bon terug moet zoeken.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS source_label text;

-- 3. Het aangeduide toesteltype.
--
-- De documenten werden gezocht met een tekstvergelijking op merk en model.
-- Eén spatie ernaast en er was niets gevonden, en een hernoemd type verbrak
-- stil de koppeling van elk toestel dat erop leunde. Deze verwijzing maakt
-- "dit toestel is van dat type" één handeling.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_type_id text
  REFERENCES device_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS devices_device_type_idx
  ON devices (device_type_id);

-- 4. Bestaande bonnen krijgen hun hoofdtoestel als eerste rij in de koppeltabel,
--    zodat de nieuwe code ook voor oude bonnen één waarheid leest.
INSERT INTO work_order_devices (work_order_id, device_id, position)
SELECT id, device_id, 1
FROM work_orders
WHERE device_id IS NOT NULL
ON CONFLICT (work_order_id, device_id) DO NOTHING;

-- 5. De uitgelezen toestellen bij een upload.
--
-- Een eigen kolom en niet in `extracted`: dat is een platte tekstmap, en er een
-- lijst in verstoppen zou elke lezer ervan laten raden wat een waarde is.
ALTER TABLE work_order_intakes ADD COLUMN IF NOT EXISTS extracted_devices jsonb;
