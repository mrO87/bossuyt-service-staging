-- v1.61 — een bon op een uur zetten.
--
-- Het eerste uur dat deze app onthoudt in plaats van berekent. Twee kolommen,
-- omdat het twee verschillende beweringen zijn: waar de bon staat, en of dat
-- een afspraak is. Zie docs/superpowers/specs/2026-09-12-vast-uur-ontwerp.md.
--
-- Additief en herhaalbaar: bestaande rijen krijgen NULL (uur wordt berekend,
-- zoals vandaag) en false (geen afspraak). Er verandert dus niets aan een
-- planning die al draait tot iemand een bon versleept.
--
-- Toe te passen op BEIDE databases in de bossuyt-db-staging container:
--   docker exec -i bossuyt-db-staging psql -U bossuyt -d bossuyt_staging < dit bestand
--   docker exec -i bossuyt-db-staging psql -U bossuyt -d bossuyt_test    < dit bestand
--
-- Toegepast op 12 september 2026, op allebei.

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS planned_start_minutes integer;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS start_is_appointment boolean NOT NULL DEFAULT false;
