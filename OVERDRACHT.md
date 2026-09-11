# Overdracht — 11 september 2026 (avond)

Vervangt de vorige overdracht. Punt 1 (slepen tussen pool en planning) is
gebouwd; wat er nog open staat en waarom staat hieronder.

Alles hieronder is nagekeken in de code, niet uit het hoofd opgeschreven.

---

## Stand van zaken

**v1.57 draait op https://staging.bossuyt.fixassistant.com.** De code in `main`
loopt daarop voor: v1.58 is gebouwd en groen, maar **nog niet uitgerold**.

- 278 tests groen (was 208), typecheck schoon, lint schoon, `npm run build` ok
- Ontwerp: `docs/superpowers/specs/2026-09-11-slepen-pool-planning-design.md`

### Wat v1.58 bevat

1. **Slepen tussen open pool en dagplanning, beide richtingen.** Terugslepen
   wist enkel de datum — de technieker blijft aan de bon hangen.
2. **Overloop-waarschuwing** tegen het echte uurrooster.
3. **Aanpasbare geschatte duur** op elke kaart, ook leeg te laten.
4. **Instellingen blijven bewaard** — bug gevonden en opgelost.

---

## De vier vondsten die het ontwerp gestuurd hebben

Niet opnieuw uitzoeken.

### 1. De twee lijsten splitsten op `source`, niet op datum

De vorige overdracht baseerde zich op de commentaar van `assign/route.ts`. Die
beschrijft alleen wat die route *schrijft*. `getTodayInterventions()` splitste op
`source` — het herkomstveld, gezet bij het aanmaken en daarna nooit gewijzigd.

Gevolg: een poolbon (`reactive`) die een datum kreeg verscheen **niet** in de
planning en **bleef** in de pool. Slepen zou niets gedaan hebben.

**Nu:** de splitsing hangt aan `plannedDate`. Geen datum = pool. `source` blijft
herkomst, `visibleInPool` blijft de handmatige verbergschakelaar.

### 2. `planned_date` was NOT NULL

Daarom stonden er twee placeholders in de code die een nepdatum van vandaag
zetten (`work-order-intakes.ts` en `follow-up/route.ts`), met een commentaar dat
letterlijk zei dat een ongeplande bon per definitie geen datum heeft. De kolom is
nu nullable en beide placeholders zijn weg.

### 3. De reorder-schrijfweg weigerde elke wijziging van de verzameling

`saveTechnicianPlanningOrder` wees elke schrijfactie af waarbij de set bonnen
verschilde — precies wat slepen doet. Vervangen door `savePlanningSnapshot`:
één payload beschrijft de **hele dag** ("deze bonnen, in deze volgorde"), de
server leidt zelf af wat erbij komt en wat vrijgegeven wordt.

Omdat het een toestand beschrijft en geen wijziging, is het idempotent — en
daardoor kan de offline-wachtrij twintig sleepbewegingen samenvouwen tot één
schrijfactie.

De weggevallen set-check is vervangen door twee smallere: de versiecheck, en de
regel dat een gestarte bon nooit vrijgegeven wordt.

### 4. `planningVersion` werd verkeerd afgeleid

De client stuurde de versie van de **eerste** job; de server vergelijkt met de
**max** over de dag. Ging goed tot er een bon uit de pool bijkwam (die staat nog
op versie 1). Opgelost in `lib/planning/planningWrite.ts`, met tests.

---

## De instellingen-bug — opgelost

**Symptoom:** startlocatie en startuur bleven niet bewaard.

**Wat het niet was:** het gewone pad werkt. Gereproduceerd met Playwright tegen
staging — 07:30 → 08:15 overleeft een herlaadbeurt gewoon.

**Wat het wel was:** `persistSettings` en `readSettingsFromStorage` deden
`localStorage.removeItem(STORAGE_KEY)` in hun `catch`. Eén geweigerde schrijf-
actie wiste dus **alles**, niet enkel de nieuwe waarde. Bewezen met Playwright:
na één geweigerde `setItem` was de opslag leeg.

Dat gebeurt op een werktelefoon echt: deze app schrijft foto's als blobs naar
IndexedDB, de opslag loopt vol, `setItem` gooit.

**Fix:** opslaglogica uit de hook getrokken naar testbare functies
(`readSettingsFrom` / `writeSettingsTo`). Een mislukte schrijfactie verliest nu
alleen die ene wijziging. 7 regressietests.

Meegenomen: `settings.startTime` standaard 07:30 → **07:00**, gelijk aan het
rooster.

---

## Het uurrooster

Stond nergens; `OvertimeWidget` had een eigen `TARGET_MINUTES = 7u45` die niet
klopte. Nu één tabel in `lib/planning/workSchedule.ts`:

| dag | span | − pauze | capaciteit |
|---|---|---|---|
| ma–do | 07:00–16:00 | 30 min onbetaald | **8u30** |
| vr | 07:00–13:30 | 30 min onbetaald | **6u00** |

Week: 40u00. De pauze is onbetaald maar de klok loopt door, dus hij gaat van de
span af.

**Het weekpotje van 40u is bewust geen werkende teller.** Een week optellen
vraagt gewerkte tijd, en niets schrijft naar `workStart` / `workEnd` /
`statusArrivedAt` — zie punt 2 hieronder. `OvertimeWidget` krijgt nog altijd
`saldo={null}` hardgecodeerd.

---

## Openstaande punten

### 1. v1.58 staat nog niet op staging — te beslissen

De code is klaar en groen. Uitrollen breekt de open tab van de gebruiker, dus
eerst vragen. Volgorde: **eerst bumpen** (`scripts/pre-staging.sh` doet dat zelf
en schuift een placeholder in `lib/releases.ts`), **dan de notes schrijven**.

Na het uitrollen nog met de hand te testen op de telefoon: het slepen zelf. Dat
is de enige eerlijke test voor aanraking.

### 2. Rekbare tijdlijn — regel vastgelegd, niets schrijft de kolommen

Ongewijzigd sinds vorige overdracht:

- niet gestart → `estimatedMinutes`
- gestart, binnen de schatting → `estimatedMinutes`
- gestart, over de schatting → verstreken tijd; de kaart rekt uit
- afgewerkt → de echte duur

`statusOnderwegAt`, `statusArrivedAt`, `workStart`, `workEnd` bestaan als kolom
maar **er schrijft niets naar**. De pennen zijn nooit gebouwd. Dit blokkeert ook
de weekteller uit punt 1.

### 3. Rollen, grendel en wijzigingsmelding — naden liggen, features niet

Bewust buiten v1.58 gehouden. Wat er **wel** al ligt:

- `savePlanningSnapshot({ actor: { id, role }, ... })` — één deur voor elke
  planningswijziging, dus de autorisatiecheck wordt later één `if` op één plek
- `work_orders.planned_by_role` — geschreven, door niemand gelezen
- `planning_changed`-events in `workOrderEvents` — actor, rol, van/naar
- `planningVersion` als max — het getal waarop de melding zal steunen

Het ontwerp voor v1.59 staat in het spec, sectie 3.5. Kort:

- **Grendel:** staat `plannedByRole` op admin/planner/office, dan verdwijnt de
  sleepgreep bij de technieker én weigert de server het. Hij moet dan bellen.
- **Melding:** `DayMeta` krijgt `lastSeenPlanningVersion`. Serverversie hoger en
  niet zelf veroorzaakt → rode regel onder "Planning", met tijdstip en kruisje.
  Een nieuwe regel per wijziging; wijzigingen van terwijl je offline was
  samengevouwen tot één.
- **Bevestiging:** web-push geeft **geen** leesbevestiging. `201` = de pushdienst
  heeft het aanvaard, meer niet. Drie signalen zijn bouwbaar: *verzonden*
  (gratis, bewijst bijna niets), *afgeleverd* (service worker belt terug),
  *gezien* (technieker klikt het kruisje). Alleen de derde beantwoordt de vraag.
- **Aanwezigheid:** `lastSeenAt` bij elke sync → "laatst gezien 3 min geleden".

### 4. Push kan niet gericht sturen

`app/api/push/subscribe/route.ts` bewaart abonnementen in een **`Set` in het
geheugen**, zonder koppeling naar een gebruiker. `/api/push/send` stuurt dus naar
iedereen en verliest alles bij een herstart. Vereist een `push_subscriptions`-
tabel met `user_id` voor punt 3 kan.

### 5. `/api/route/daily` geeft 422 op staging

Zichtbaar bij elke paginalading. Komt uit `resolveEndpoint`: het geocoderen van
het startadres mislukt terwijl er geen terugvalcoördinaat meegestuurd is —
`startFallback` is `undefined` in het venster vlak na het wisselen van
startlocatie (`useRouteTimeline.ts:196`).

**Waarom het telt:** bij een 422 blijft `travelOverrides` op `null` en valt de
tijdlijn terug op `mockTravel`. De overloop-waarschuwing zou dan op verzonnen
rijtijden steunen. Voorlopig ondervangen: `travelIsEstimated` staat in
`useRouteTimeline`, en `DaySummary` zegt "ongeveer" in plaats van een hard getal.
De 422 zelf is nog niet opgelost.

### 6. Wat na een onderbroken job? — te beslissen

Technieker begint, wordt na een kwartier weggeroepen. Twee wegen:
1. bon heropenen en extra tijd bijzetten
2. admin maakt een gekoppelde `.01`-bon

De machinerie voor 2 bestaat al: `app/api/work-orders/[id]/follow-up/route.ts`.

### 7. Bestanden toevoegen aan een werkbon — niet begonnen

Mails en foto's aan de werkbon zelf hangen, los van de originele bon. Geen
ontwerp. Verdient een eigen brainstorm.

### 8. `lib/lessons.ts`

Lesitems voor v1.56, v1.57 en v1.58 staan open. Genoteerd in `STAGING-TODO.md`.

### 9. Testgat: offline samenvouwen

`enqueuePlanningWrite` vouwt de wachtrij samen tot één planningsschrijfactie.
Dat is **niet** met een test afgedekt: er is geen in-memory IndexedDB in de
testopstelling (geen jsdom, geen fake-indexeddb). Met de hand na te gaan, of
`fake-indexeddb` toevoegen.

---

## Migratie die al uitgevoerd is op staging

Reservekopie vóór de wijziging staat in de scratchpad van de sessie
(`bossuyt_staging_before_v158.sql`, 6,3 MB).

```sql
ALTER TABLE work_orders ALTER COLUMN planned_date DROP NOT NULL;
ALTER TABLE work_orders ADD COLUMN planned_by_role text;

-- 3 rijen: poolbonnen die nog niet ingepland waren
UPDATE work_orders SET planned_date = NULL
WHERE source = 'reactive' AND visible_in_pool AND status = 'aangemaakt';

-- 10 rijen: bonnen van vóór v1.57 telden voor nul mee in het dagtotaal
UPDATE work_orders SET estimated_minutes = 90 WHERE estimated_minutes IS NULL;
```

Dezelfde twee `ALTER`s zijn ook op `bossuyt_test` uitgevoerd.

**Let op:** dit is met de hand gedaan, niet via een drizzle-migratie — het
project heeft geen `drizzle/`-map, `db:push` is de weg. Een verse database komt
via `schema.ts` goed.

---

## Vondsten uit eerdere sessies

Nog steeds geldig, niet opnieuw uitzoeken.

- **docling voegt opschrift en waarde samen** in één blok, en zet de waarde soms
  vóór het opschrift. Daarom leest `lib/werkbon-zones.ts` voor het adres ook
  opschriftloze woorden.
- **Postcodes overleven OCR beter dan letters.** Daarom is de postcode de
  controleur bij straatcorrectie, niet omgekeerd.
- **Photon verdraagt typfouten waar Nominatim dat niet doet**, maar geeft
  bedrijven in naburige straten terug. Straat + huisnummer + postcode moeten alle
  drie kloppen (`lib/routing/StreetCorrector.ts`).
- **Tweetalige straatnamen**: OSM geeft `Rue de la Loi - Wetstraat` terug voor
  `WETSTRAAT`. Er zit een insluitingscontrole op.
- **De dagweergave bewaarde vijf minuten** in IndexedDB, waardoor een nieuwe bon
  niet in de pool verscheen. `invalidateDayCache()` in `lib/idb.ts`.
- **Waze**: `q` en `ll` worden gecombineerd, niet gerangschikt.
- **19 seconden uploaden is niet onze schuld**: docling 16,2 s, Photon 0,77 s.
- **`SettingsSheet` en `AvatarMenu` zijn twee kopieën** van dezelfde drie
  instellingen, allebei in gebruik (`SettingsSheet` op het dagoverzicht,
  `AvatarMenu` op /activiteiten, /magazijn en de interventiepagina). Ze delen
  `useSettings`, dus ze spreken elkaar niet tegen — maar elke wijziging moet op
  twee plaatsen. Nog niet samengevoegd.

---

## Valkuilen bij het uitrollen

- `make staging-up` roept `scripts/pre-staging.sh` aan, die **zelf** de versie
  bumpt en een lege placeholder in `lib/releases.ts` schuift. Volgorde dus:
  **eerst bumpen, dan de notes schrijven.** Omgekeerd botst de placeholder met je
  eigen blok en moet je het compose-commando rechtstreeks draaien.
- `npx vitest` pikt een verouderde kopie in `.next/standalone/tests/` op en lost
  de `@/`-alias niet op. Gebruik `npm test`.
- De DB-wachtwoorden bevatten `@` — in een URL door `encodeURIComponent`.
- Herbouwen tijdens het testen breekt de open tab van de gebruiker. Vraag het
  eerst.

---

## Werkafspraken

- Geen enkel veld mag verplicht zijn; elk veld moet manueel aanpasbaar blijven.
  (`planned_date` is hierdoor nu ook optioneel bij het aanmaken.)
- Later komt Keycloak erover — de container draait al op deze machine. Werkbonnen
  worden dan toegewezen aan een technieker, en enkel de toegewezen technieker
  ziet de bon. Verplaatsen wordt voorbehouden aan planner/beheerder.
- Een technieker mag zijn **eigen** bonnen vrij verplaatsen en krijgt daar geen
  melding van. Verplaatst een **andere rol** iets, dan wel.
- Werkstroom tot er koppeling met Navision is: alle bonnen naar de pool uploaden
  → van pool naar planning slepen → invullen → afgewerkte bon naar klant en
  planning sturen (dat laatste nog te automatiseren).
