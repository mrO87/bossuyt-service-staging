-- De dagklok — zie docs/superpowers/specs/2026-09-14-dagklok-en-stiptheid-ontwerp.md
--
-- Handmatig uit te voeren op BEIDE databases: bossuyt_staging én bossuyt_test.
--
-- Alles is herhaalbaar (IF NOT EXISTS), zodat twee keer draaien niets stukmaakt.

-- Wanneer een technieker zijn dag echt begon en eindigde.
--
-- Eén rij per technieker per dag. Dat is geen vorm maar een regel: je vertrekt
-- één keer en je komt één keer thuis, en twee rijen voor dezelfde dag zouden
-- meteen de vraag oproepen welke de juiste is. De primaire sleutel dwingt het af.
--
-- `day` is een kale datum en geen tijdstip: de vraag "welke dag was dit" mag
-- nooit van een tijdzone afhangen. De twee uren zijn wél tijdstippen mét zone,
-- want die worden op de klok afgelezen.
--
-- Allebei mogen leeg blijven, en dat is de gewone gang van zaken: tussen
-- vertrekken en thuiskomen staat er een halve dag lang alleen een begin. Een
-- dag waar niets van geweten is, heeft gewoon geen rij.
CREATE TABLE IF NOT EXISTS technician_days (
  technician_id text        NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  day           date        NOT NULL,
  started_at    timestamptz,
  ended_at      timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (technician_id, day)
);

-- De weekweergave vraagt zeven dagen tegelijk op, per technieker.
CREATE INDEX IF NOT EXISTS technician_days_day_idx
  ON technician_days (technician_id, day);
