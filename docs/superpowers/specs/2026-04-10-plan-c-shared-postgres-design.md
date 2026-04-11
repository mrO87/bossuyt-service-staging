# Plan C Shared PostgreSQL Design

**Datum:** 2026-04-10

**Doel**

De service-app evolueert van mock-only frontenddata naar een gedeelde datafundering die later ook bruikbaar is voor Vanventory en OCR. Voor nu lossen we tegelijk twee concrete problemen op: routeherberekening na wijziging van start/einde, en een echte offline-first flow die 10 volledige werkbonnen kan laden.

**Beslissing**

We kiezen voor Plan C:

- een Dockerized PostgreSQL in deze repo als eerste gedeelde databasis
- mock data als seed, zodat staging en lokaal meteen bruikbare records hebben
- een minimale lees- en synclaag in deze app die later kan uitgroeien naar de gedeelde Core API

We kiezen expliciet niet voor:

- mock-data verder uitbouwen als eindpad
- een app-specifieke databasearchitectuur die losstaat van het ERP-masterplan

**Architectuur**

De service-app blijft een Next.js app, maar stopt stapsgewijs met rechtstreeks lezen uit `lib/mock-data.ts`. In plaats daarvan komt er een server-side data-accesslaag boven PostgreSQL met een seedproces dat dezelfde demo-entiteiten omzet naar echte records.

Voor fase 1 beperken we de gedeelde database tot de minimale tabellen die nodig zijn om deze app correct te laten werken:

- `technicians`
- `customers`
- `sites`
- `devices`
- `work_orders`
- optioneel een eenvoudige `work_order_assignments` of equivalente toewijzingsstructuur

De morning sync leest uit deze gedeelde bron en bewaart de relevante werkbonnen in IndexedDB. De UI leest vervolgens uit die offline cache of uit de live synclaag, niet langer direct uit de mock-array.

**Datastroom**

1. PostgreSQL draait in Docker.
2. Een seedscript laadt de huidige mock data in de relationele tabellen.
3. Een server-side sync/readlaag leest maximaal 10 volledige werkbonnen voor de technieker.
4. `lib/sync.ts` schrijft deze naar IndexedDB.
5. `DayView` leest geplande en open items uit cache/live data in plaats van uit `MOCK_INTERVENTIONS`.

**Routeherberekening**

De routebug wordt apart en snel opgelost in `useRouteTimeline`. De route-refresh mag niet enkel afhangen van `state.movableItems`, maar ook van:

- `startAddress`
- `endAddress`
- `sameAsStart`

Daarbij moeten adreswijzigingen vertaald worden naar bruikbare coördinaten. In fase 1 volstaat:

- depotcoördinaten voor de standaardwaarde
- sitecoördinaten voor werkbonnen
- geocoding of duidelijke fallback voor vrije adressen

**Offline-first scope**

Voor deze fase betekent “10 volledige werkbonnen”:

- geplande en open interventies samen tot maximaal 10 items
- voldoende detail per werkbon om dagoverzicht en detailpagina offline te openen
- bewaarbasis in IndexedDB voor interventiegegevens en bijhorende werkbondata

Niet in scope voor deze eerste slice:

- volledige Vanventory-koppeling
- OCR-ingest
- volledige Keycloak/Core API-migratie

**Bestandsimpact**

Waarschijnlijk nieuwe of aangepaste onderdelen:

- `docker-compose.yml` of extra composebestand voor PostgreSQL
- nieuwe Drizzle schema- en seedbestanden
- nieuwe data-accesslaag onder `lib/`
- `lib/sync.ts`
- `lib/idb.ts`
- `components/DayView/DayView.tsx`
- `components/DayTimeline/useRouteTimeline.ts`
- nieuwe sync API-route(s)

**Risico's**

- De app bevat nog geen bestaande testinfrastructuur; we zullen de kleinste zinvolle verificatie per stap moeten toevoegen.
- `syncToday()` verwijst vandaag naar een niet-bestaande route; dat moet eerst functioneel gemaakt worden voor offline-first kan kloppen.
- Zonder deploy of lokale preview zou nieuwe uitleg/functionaliteit moeilijk zichtbaar zijn; daarom is er nu een previewroute en een lokale previewpagina.

**Aanpak**

We voeren dit in twee sporen uit:

1. directe functionele fix voor routeherberekening
2. minimale gedeelde databasefundering + syncpad voor offline-first

Zo verbeteren we staging meteen waar het fout loopt, zonder opnieuw te investeren in een tijdelijke mock-architectuur.
