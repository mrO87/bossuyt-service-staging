# Overdracht — 11 september 2026

Vanwaar verder te gaan. Geschreven aan het eind van een lange sessie die vanuit
de verkeerde map draaide (`/mnt/data/winkelwijzer`), zodat niets verloren gaat
bij het herstarten in deze map.

Alles hieronder is nagekeken in de code, niet uit het hoofd opgeschreven.
Regelverwijzingen dateren van v1.57 en kunnen schuiven — de genoemde symbolen
niet.

---

## Stand van zaken

**v1.57 draait op https://staging.bossuyt.fixassistant.com** (sha `4ee178c`).
208 tests groen, typecheck schoon.

v1.56 en v1.57 zijn samen uitgerold: `CURRENT_RELEASE_VERSION` bleef op v1.55
hangen terwijl er al een v1.56-blok in `lib/releases.ts` stond. Beide staan nu
apart in `/changenotes`. Ze zijn bewust **niet** samengevoegd: v1.56 kondigde
verplichte velden aan, v1.57 draait die terug. Samengevoegd verdwijnt die
ommekeer uit de geschiedenis.

### Wat er in die twee releases zat

Adreslezing van gescande bonnen, straatcorrectie via Photon, klantnaam
voorstellen op adres, geocodering bij aanmaak in plaats van bij elke
routeberekening, de originele bon gekoppeld aan de werkbon, een Waze-knop,
geen verplichte velden meer, en een standaardduur van 1u30 per werkbon.
Volledige tekst in `lib/releases.ts`.

---

## Openstaande punten

### 1. Slepen tussen pool en planning — ontworpen, niet goedgekeurd, niet gebouwd

De gebruiker wil werkbonnen uit de open pool in de dagplanning slepen, **en
omgekeerd** terug naar de pool als de dag niet meer volstaat.

**Wat er al ligt.** `@dnd-kit` is geïnstalleerd. `DayTimeline.tsx` heeft een
werkende `DndContext` met aanraakondersteuning (250 ms ingedrukt houden, zodat
de lijst scrollbaar blijft). `POST /api/work-orders/[id]/assign` bestaat en
documenteert zijn eigen model.

**De sleutelvondst.** De open pool is niet "niet-toegewezen werk" — het is
*toegewezen werk zonder datum*. Uit `assign/route.ts`:

> Without plannedDate: work order stays 'aangemaakt' and remains visible in the
> open pool. With plannedDate: work order moves to 'gepland' and leaves the pool.

Terugslepen naar de pool is dus geen ongedaanmaking van de toewijzing maar
alleen het wissen van de datum. De technicus blijft eraan hangen — precies wat
gevraagd werd. Het gegevensmodel ondersteunt dit al; er is enkel geen endpoint
voor de omgekeerde richting.

**Het ontwerp.**

- De `DndContext` moet omhoog van `DayTimeline` naar `DayView`, want hij moet
  beide lijsten omspannen. Dat verschuift een componentgrens.
- Eén afhandelaar, drie takken:

  | van | naar | gevolg |
  |---|---|---|
  | planning | planning | herordenen (bestaat, ongewijzigd) |
  | pool | planning | `assign` met datum + positie → `gepland` |
  | planning | pool | datum wissen → `aangemaakt` |

- Trek de beslissing *"wat betekent deze drop"* uit de handler in een pure
  functie (`lib/planning/dropIntent.ts`). Dan is de taklogica testbaar zonder
  browser, en dat is precies waar een fout stil zou blijven.
- Neem de bestaande aanraaksensor ongewijzigd over voor de poolkaarten, anders
  sleep je bonnen weg terwijl je door de pool scrolt.

**Let op:** `handleDragEnd` in `DayTimeline.tsx` schrijft `technicianId: 'u1'`
hardgecodeerd. Laat het slepen toewijzen aan `currentUser.id` — dat bestaat al.
Dat is meteen de juiste naad voor Keycloak later: die vult `currentUser`, en er
verandert verder niets aan deze code.

**Nog te beslissen door de gebruiker:** wat er gebeurt als de dag overloopt.
Stil laten overlopen is het slechtste antwoord — dan liegt het scherm.

### 2. Rekbare tijdlijn — regel vastgelegd, kolommen bestaan, niets schrijft ze

De gevraagde regel, letterlijk:

- niet gestart → `estimatedMinutes`, zoals de originele planning
- gestart, binnen de schatting → `estimatedMinutes`; er gebeurt niets
- gestart, over de schatting → de verstreken tijd; de kaart rekt uit
- afgewerkt → de echte duur

Dus `max(schatting, verstreken)` zolang de job loopt. Alleen de lopende job
rekt; alles erna schuift mee met het verschil.

**Wat er al is.** `lib/db/schema.ts` heeft `statusOnderwegAt`,
`statusArrivedAt`, `workStart` en `workEnd`. Het schema is hiervoor ontworpen.

**Wat ontbreekt.** Er schrijft **niets** naar die kolommen.
`statusOnderwegAt` wordt alleen gelezen (`lib/server/interventions.ts`),
`statusArrivedAt` nergens. De pennen zijn nooit gebouwd.

**Twee gevolgen om te weten.** Dit is puur weergave — er wordt niets bewaard,
dus het kan de planning niet corrumperen; laag risico. Maar het vraagt een
tikkende klok: de weergave moet elke minuut hertekenen, anders verschijnt het
uitrekken pas wanneer je het scherm aanraakt.

Werktijd mag over de daguren lopen: er is geen begrenzing in
`useRouteTimeline.ts`, en die hoeft er ook niet te komen.

### 3. De schatting is nergens aanpasbaar

`DEFAULT_ESTIMATED_MINUTES = 90` in `lib/server/work-orders.ts` wordt toegepast
in `createWorkOrder`, de trechter waar elk aanmaakpad doorheen gaat. De waarde
verschijnt als badge op de dagplanning en de jobkaart, maar je kan ze nergens
wijzigen.

Dat botst met de uitdrukkelijke regel van de gebruiker dat elk veld altijd
manueel aanpasbaar moet zijn. Hoort bij punt 1 — bij het slepen heb je die knop
echt nodig.

### 4. Bestaande werkbonnen hebben geen schatting

Rijen van vóór v1.57 hebben `estimated_minutes = NULL` en tellen dus voor nul
mee in het dagtotaal. Bijvullen op 90 is één opdracht, maar het is een
gegevensbeslissing over echte data — niet iets om als bijwerking te doen.
Wacht op akkoord.

### 5. Bestanden toevoegen aan een werkbon — niet begonnen

Uitdrukkelijk gevraagd: mails en foto's bij de werkbon zelf kunnen hangen,
los van de originele bon. Nog geen ontwerp. Verdient een eigen brainstorm.

### 6. `lib/lessons.ts`

Lesitems voor v1.56 en v1.57 staan open. Genoteerd in `STAGING-TODO.md`.

---

## Vondsten die tijd gekost hebben

Niet opnieuw uitzoeken.

- **docling voegt opschrift en waarde samen** in één blok, en zet de waarde
  soms vóór het opschrift. Daarom leest `lib/werkbon-zones.ts` voor het adres
  ook opschriftloze woorden.
- **Postcodes overleven OCR beter dan letters.** Daarom is de postcode de
  controleur bij straatcorrectie, niet omgekeerd.
- **Photon verdraagt typfouten waar Nominatim dat niet doet**, maar geeft
  bedrijven in naburige straten terug. Straat + huisnummer + postcode moeten
  alle drie kloppen (`lib/routing/StreetCorrector.ts`).
- **Tweetalige straatnamen**: OSM geeft `Rue de la Loi - Wetstraat` terug voor
  `WETSTRAAT`. Dat is geen correctie. Er zit een insluitingscontrole op.
- **De dagweergave bewaarde vijf minuten** in IndexedDB, waardoor een nieuwe
  bon niet in de pool verscheen. `invalidateDayCache()` in `lib/idb.ts`.
- **Waze**: `q` en `ll` worden gecombineerd, niet gerangschikt. Een echte
  terugvalketen zou bij een mislukte naamzoekopdracht nergens landen.
  Geverifieerd tegen de officiële deep-link-documentatie.
- **19 seconden uploaden is niet onze schuld**: gemeten op docling 16,2 s en
  Photon 0,77 s.

---

## Valkuilen bij het uitrollen

- `make staging-up` roept `scripts/pre-staging.sh` aan, die **zelf** de versie
  bumpt en een lege placeholder in `lib/releases.ts` schuift. De bedoelde
  volgorde is dus: **eerst bumpen, dan de notes schrijven.** Doe je het
  omgekeerd, dan botst de placeholder met je eigen blok en moet je het
  compose-commando rechtstreeks draaien (zoals bij v1.57 gebeurd is).
- `npx vitest` pikt een verouderde kopie in `.next/standalone/tests/` op en
  lost de `@/`-alias niet op. Gebruik `npm test`.
- De DB-wachtwoorden bevatten `@` — in een URL moeten die door
  `encodeURIComponent`.
- Herbouwen tijdens het testen breekt de open tab van de gebruiker. Vraag het
  eerst.

---

## Werkafspraken uit deze sessie

- Geen enkel veld mag verplicht zijn; elk veld moet altijd manueel aanpasbaar
  blijven. Een half leesbare bon moet je toch kwijt kunnen.
- Later komt Keycloak erover. Werkbonnen worden dan toegewezen aan een
  technicus, of ze nu in de pool zitten of vastliggen, en enkel de toegewezen
  technicus ziet de bon. Verplaatsen is dan voorbehouden aan de
  planner/beheerder — een autorisatievraag op het endpoint, niet op het slepen.
- De voorziene werkstroom tot er koppeling met Navision is: alle bonnen naar de
  pool uploaden → van pool naar planning slepen → invullen → afgewerkte bon
  naar klant en planning sturen (dat laatste nog te automatiseren).
