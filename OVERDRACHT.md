# Overdracht — 11 september 2026 (avond), bijgewerkt 12 september

Vervangt de vorige overdracht. Punt 1 (slepen tussen pool en planning) is
gebouwd; wat er nog open staat en waarom staat hieronder.

Alles hieronder is nagekeken in de code, niet uit het hoofd opgeschreven.

---

## Bijwerking 13 september — v1.67: geen werkbon meer kwijtraken

Twee regels, één doel. Ze staan samen in `lib/planning/pastDays.ts`, los van de
database, zodat server en scherm dezelfde grens gebruiken en die grens te
testen is zonder de klok te verzetten (`tests/past-days.test.ts`).

1. **Een vergeten bon keert terug naar de pool.**
   `releaseForgottenWorkOrders()` in `lib/server/interventions.ts`, aangeroepen
   vanuit `app/api/sync/today/route.ts` — dus in het leespad, niet als
   nachtelijke taak. Bewust: een taak kan stilvallen zonder dat iemand het
   merkt, en dan is het stil kwijtraken van bonnen precies terug. Dit herstelt
   zichzelf bij de eerstvolgende blik op de planning. Het versienummer gaat mee
   omhoog, zodat een telefoon die de oude dag nog vasthoudt botst in plaats van
   de bon terug te schrijven.
2. **Niets landt in het verleden.** Vier deuren, alle vier dicht:
   `resolveWeekDrop` (slepen, weekrand én uur zetten — als één buitenlaag over
   `decideWeekDrop`, want de grens slaat op vier van de zes uitkomsten
   tegelijk), `updatePlacement`, `savePlanningSnapshot`, en het datumveld op de
   werkbon. De route geeft 409 met `WORK_ORDER_PAST`; `lib/sync.ts` gooit zo'n
   schrijfactie weg met een melding in plaats van eeuwig opnieuw te proberen.

**Vandaag telt niet als verleden.** Een dag die nog bezig is blijft bruikbaar.

**De tijdzone is uitdrukkelijk gezet.** `todayInBelgium()` gebruikt
`Europe/Brussels` en niet de klok van de container (UTC). Zonder dat zou de
server tussen middernacht en twee uur nog gisteren zeggen, en dan gold een bon
van vandaag 's nachts als verleden.

**Let op bij het lezen van oude tests:** `tests/week-drop-intent.test.ts` geeft
nu een vaste `today` mee. Zonder dat hing de uitkomst af van de dag waarop de
tests draaien — één test ging meteen rood omdat een week terugschuiven in het
verleden landde.

**Gevolg voor de staging-data:** de opkuis heeft 13 bonnen uit april en
september naar de pool gehaald, want die stonden in het verleden zonder werk.
De pool ging van 1 naar 14. Dat is het bedoelde gedrag, geen ongeluk.

## Bijwerking 13 september — v1.66: drie deuren naar buiten, en een stille 409

v1.64 zette het venster vast tijdens het slepen. Dat loste het springen op en
sloot tegelijk de pool af: die staat bóven het rooster, en met een blok in je
hand kon je er niet meer naartoe scrollen. Er was ook geen manier om een bon
naar een andere week te krijgen. De gebruiker koos drie wegen tegelijk, met de
bedoeling op de telefoon te ontdekken welke hij echt gebruikt.

1. **`components/WeekView/PoolBar.tsx`** — `fixed inset-x-0 bottom-0 z-40`, dus
   altijd in beeld zonder te scrollen (nagemeten op 400×800: y=756). Is zelf een
   droppable; tikken schuift een paneel open met de wachtende bonnen, elk
   draggable. Tijdens het slepen verandert de tekst in wat loslaten doet.
2. **`components/WeekView/WeekEdges.tsx`** — twee stroken van 32 px links en
   rechts, `opacity-0` tenzij er gesleept wordt. Loslaten verschuift de bon een
   week, naar dezelfde weekdag (`shiftDateStr`, op 12:00 gerekend zodat de
   zomertijd hem niet een dag verzet). Dit is het goedkoopste van de drie om
   later weer weg te halen als het niet gebruikt wordt.
3. **`components/planning/PlanningCard.tsx`** — datum, uur en de afspraakknop in
   de werkbon zelf. Haalt de doeldag op en draait `computeDaySchedule`, zodat de
   botsingsmelding wóórdelijk dezelfde is als op het rooster; er is één
   tijdmotor, geen tweede waarheid. Gestart = vergrendeld
   (`canLeaveTheDay`), uitdrukkelijk zo gevraagd.

Het datamodel is niet gewijzigd: `planned_date` was altijd al een echte datum.
Alleen de weekweergave dacht in kolommen.

### De tweede schrijfweg

`updatePlacement` in `lib/server/interventions.ts` schrijft één bon: datum, uur,
afspraak. Naast `savePlanningSnapshot`, die een hele dag beschrijft. Route:
`update_placement` in `app/api/sync/write/route.ts`, 409 met
`WORK_ORDER_LOCKED` / `WORK_ORDER_MISSING`. `lib/sync.ts` laat een geweigerde
`update_placement` vallen met een melding in plaats van eeuwig opnieuw te
proberen — anders blokkeert één vergrendelde bon de hele wachtrij.

### De bug die dat blootlegde — kost tijd om terug te vinden

Slepen naar de pool gaf een **409**: op het scherm stond de bon in de pool, in
de database op zijn dag. Stil verlies, geen foutmelding.

Bij het vrijgeven stuurt het scherm de dag **zonder** de vertrekkende bon, en
het versienummer werd uit diezelfde lijst gehaald. De server vergelijkt met het
hoogste van de dag, **inclusief** de vertrekker. Droeg die het hoogste nummer,
dan stuurde de client een lager getal en kreeg hij een conflict dat niet bestond.

Het lag er al lang, onzichtbaar, omdat `savePlanningSnapshot` alle bonnen van
een dag tegelijk ophoogt: die nummers waren altijd gelijk. `updatePlacement`
hoogt er één op, en daarmee werd het meteen raak.

`buildPlanningWrite` neemt nu `serverDay` apart van `day`
(`lib/planning/planningWrite.ts`). Vastgelegd in `tests/planning-write.test.ts`.
**Let op bij elke nieuwe schrijfweg die één bon ophoogt:** dezelfde val staat
open zodra client en server een andere lijst als "de dag" lezen.

## Bijwerking 13 september — v1.65: twee dingen die v1.64 blootlegde

1. **De oude dag bewoog mee bij een verhuizing.** Zodra een sleep begint klikt
   het uur in op het kwartier, en dat telde in het voorbeeld als een vastgezet
   uur — dus herschikte de héle oude dag zich voor een bon die net aan het
   vertrekken was. Bij het aanraken is nog niet te weten of het een uur wordt of
   een verhuizing; dat blijkt pas uit waar de vinger uitkomt. `overOwnDay` op
   `DragPreview` volgt dat nu via `onDragOver`: boven de eigen dag rekent die
   dag mee, erbuiten blijft hij staan.
2. **De vertrekmelding leek over de verkeerde dag te gaan.** Geen rekenfout —
   nagegaan: zonder vaste uren vertrekt elke dag op het ingestelde uur en staat
   er nul melding. Maar de tekst begon met een uur terwijl deze meldingen over
   de hele zichtbare week gaan, dus eentje over dinsdag verscheen even goed
   terwijl je aan woensdag werkte. Beide meldingen beginnen nu met de dag in het
   vet; de vertrekmelding noemt de klant en zet het vertrekuur naast het
   ingestelde startuur.

## Bijwerking 13 september — v1.64: drie dingen uit de telefoontest

De gebruiker heeft v1.63 op een echte telefoon gebruikt. Drie punten:

1. **Het venster sprong weg tijdens het slepen.** Twee oorzaken, allebei
   gevolgen van het meerekenen uit v1.63. `layoutShiftCompensation` van dnd-kit
   scrollt de pagina wanneer de inhoud verschuift — bedacht voor lijsten die
   stilstaan, en bij ons verschuift de dag met opzet. En de botsingsmelding
   staat bóven het rooster, dus eentje die tijdens het slepen verscheen duwde
   het rooster zo'n 90 px omlaag. Nu: `autoScroll.canScroll` laat alleen nog de
   horizontale strook scrollen (die moet blijven werken, anders is een dag
   buiten beeld onbereikbaar), en de meldingen blijven bevroren zolang er
   gesleept wordt. Bevriezen en niet verbergen — verbergen zou het rooster
   laten springen zodra je een bon aanraakt waar al een melding bij stond.
2. **De weekweergave begon altijd bij vandaag.** De wisselaar ging naar
   `/planning/week` zonder datum. Nu geven beide weergaven `?date=` mee
   (`dateFromSearch` / `withDate` in `ViewSwitcher.tsx`). **Let op:** de week
   waarin vandaag valt tonen blijft het gedrag — op een zondag is dat dus een
   week die al voorbij is. Uitdrukkelijk zo gelaten op vraag van de gebruiker.
3. **Een afgesproken uur is nu ook rood in de dagplanning** (`JobTimelineCard`).
   Dat sluit het gat dat in het v1.61-ontwerp als "bewust niet in zit" stond:
   de dagweergave toonde het uur wel, maar niet dat het vastlag.

## Bijwerking 13 september (later) — v1.63: meerekenen tijdens het slepen

De weekweergave rekende alleen bij het loslaten. Nu volgt de hele dag de vinger:
rijtijden, vertrektijd, volgorde, arcering. `DragPreview` in `WeekView.tsx`.

**Twee dingen die dat mogelijk maken, en die je niet mag weghalen:**

1. **Alleen bijwerken als het ingeklikte kwartier verandert** (~13 px). Anders
   tekent het scherm bij elke pixel opnieuw — de fout waar het prototype in
   sectie 5 voor waarschuwt.
2. **Alles afmeten tegen een momentopname van bij het begin van de sleep**, nooit
   tegen wat er nú staat. Dat laatste beweegt mee, en dan telt een blok zijn
   eigen verplaatsing er telkens opnieuw bij op en rent het weg onder je hand.

De dnd-kit-transform wordt nog maar **zijwaarts** toegepast: de herberekende dag
zet het blok verticaal al op zijn plaats, en allebei doen laat het twee keer zo
ver bewegen als je vinger.

### De fout die het voorbeeld blootlegde

Bij het loslaten kwam er `over: null` en `activeRect: null` — dnd-kit had het
blok nooit opgemeten. **Het arceringsblok draagt de `interventionId` van de bon
waar het overheen ligt**, en registreerde zich dus als tweede sleepbaar ding
onder hetzelfde id. dnd-kit houdt de laatste registratie, en dat was de
arcering: een blok dat `return` doet vóór `setNodeRef` ergens op staat.

Gevolg: **een bon met een botsing was helemaal niet te verslepen** — precies de
bon die de melding je vraagt te verzetten. Zat sinds v1.61 op staging.

De regel staat nu in `draggableIdFor` (`lib/planning/daySchedule.ts`) met drie
tests. Twee dingen onder één naam is de fout die geen test ziet zolang beide
kanten op zich kloppen — dezelfde vorm als de `source`/`plannedDate`-splitsing
uit v1.59.

## Bijwerking 13 september — v1.62

**v1.61 én v1.62 zijn uitgerold** (`curl .../api/version` zegt v1.62, sha
72d60a8). 464 tests groen, typecheck/lint/build schoon.

v1.62 vult aan wat v1.61 van het ontwerp liet liggen: het label `kan niet` op de
arcering, en uitrekken met een handvat onderaan het blok (schrijft naar
`estimatedMinutes`, via dezelfde wachtrij als het duurbolletje).

**Twee dingen die pas zichtbaar werden door het blok uit te vergroten:**

1. **Het uurblokje liep over de speldjesknop.** Met een aparte knop van 16 px
   bleef er zo'n 21 px over voor tekst, en "08:39" past daar niet in. Afkappen
   maakte er "0..." van. Opgelost door het uur zélf de knop te maken — dat
   bespaart de hele kolom en leest directer. Het kruisje om een uur weg te halen
   staat nu rechtsboven, want de onderrand is het rekhandvat.
2. **Markeren als afspraak sprong naar het kwartier.** 08:39 werd 08:45.
   Slepen klikt in omdat dat helpt mikken; markeren bevestigt wat er staat, en
   dan mag er niets verschuiven. `togglePin` rondt nu af op de minuut.

**Een misverstand dat rechtgezet is** (en dat in de code, de release-notities én
het spec stond): het speldje werd beschreven als iets dat "kortste volgorde"
tegenhoudt. Die knop bestaat niet in deze app, en het speldje is ook geen
grendel. Het **meldt** dat een uur met de klant afgesproken is — een bericht aan
de volgende persoon die de planning openslaat. Niets in de code vertakt erop, en
dat is het ontwerp en niet een gat erin.

## v1.61 — een bon op een uur zetten

Ontwerp en de drie beslissingen die eronder lagen:
`docs/superpowers/specs/2026-09-12-vast-uur-ontwerp.md`.

Dit is de eerste keer dat de app een uur **onthoudt**. Tot nu toe werd elk uur
berekend uit het vertrekuur; nu mag een bon zijn eigen uur meebrengen. Twee
kolommen in `work_orders`: `planned_start_minutes` (waar hij staat) en
`start_is_appointment` (het speldje — of dat een afspraak is). De migratie staat
in `scripts/migrations/2026-09-12-pinned-hour.sql` en is met de hand toegepast op
**allebei** de databases (`bossuyt_staging` en `bossuyt_test`).

### Twee dingen die alleen de draaiende site liet zien

Geen van beide is uit redeneren gekomen; allebei uit slepen in een echte
browser. Ze staan hier omdat ze elkaar verbergen.

1. **De weekweergave stuurde haar wachtrij nooit weg.** De dagweergave leegt hem
   bij het openen (`useDayData`), dus vroeg of laat vertrok alles — maar de
   weekweergave *leest* van de server. Wie daar iets versleept en herlaadt
   zonder ooit de dagweergave te openen, zag zijn wijziging terugspringen naar
   wat de server nog dacht. Opgelost met `flushQueue` in `WeekView.tsx`.

2. **Twee handelingen na elkaar gaven een 409.** Na een geslaagde schrijfactie
   verhoogt de server het versienummer van de dag; dit scherm hield het oude
   vast. Het uur zetten lukte, het speldje erna werd geweigerd en weggegooid,
   en niets zei waarom. `flushQueue` neemt nu alleen het versienummer over —
   niet de hele dag, want dat zou een sleep die ondertussen begonnen is ongedaan
   maken.

Punt 2 was onzichtbaar zolang punt 1 bestond: zonder synchronisatie verhoogde de
server nooit iets tijdens het slepen.

### Wat met de hand nagemeten is

Lokale dev-server op poort 3005 tegen `bossuyt_staging`, Playwright met een
muis. Slepen zet een uur (08:39 → 09:45, ingeklikt op het kwartier), het
overleeft een herlaadbeurt, het speldje komt in de database, de arcering loopt
van 09:00 tot 10:22 bij een bon die op 09:00 staat en er ten vroegste om 10:22
kan zijn, en de knop "Vast uur weghalen" laat de melding verdwijnen. De
testuren zijn daarna weer uit de database gehaald.

**Nog niet met een echte vinger op een echt scherm** — hetzelfde gat als bij
v1.60. Verticaal slepen over 62 px is met een muis gemeten, niet met een duim.

### Let op bij het verder bouwen

- De **dagweergave toont het uur maar niet de botsing**: ze rekent met dezelfde
  motor en dus met hetzelfde uur, maar heeft geen tijdas om arcering op te
  tekenen. Twee kaarten met overlappende uren is daar het enige teken.
- `savePlanningSnapshot` leest een **ontbrekend** `startTimes`-veld als "deze
  client weet niets van uren" en laat de uren met rust. Een telefoon die een
  week offline stond, herspeelt schrijfacties van vóór v1.61; die mogen niets
  wissen. Een **lege lijst** is iets anders: een dag waarop niets vaststaat.
- De kolom `planned_order` en de volgorde die `getTodayInterventions`
  teruggeeft, lopen niet altijd gelijk — bij het testen kwam een bon met
  `planned_order = 2` als eerste uit de API. Dat is niet onderzocht en heeft
  niets met dit werk te maken, maar het bepaalt wél welke bon "de eerste job"
  is, en de eerste job kan per definitie niet botsen.

---

## Stand van zaken

**v1.59 draait op https://staging.bossuyt.fixassistant.com** en is nagemeten in
een echte browser: slepen werkt beide richtingen en overleeft een herlaadbeurt,
en schuiven kost geen enkele netwerkaanroep meer.

- 368 tests groen (was 208), typecheck schoon, lint schoon, `npm run build` ok
- Gepusht naar `feature/service-bon-v1.53`. `main` staat nog op v1.53.1 en is
  bewust niet aangeraakt; staging bouwt met `context: .` uit de werkmap, niet
  uit een branch — daarom draaide v1.57 al terwijl `main` achterbleef.
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

### 0. Opgelost sinds de vorige overdracht

- **Laatste bon kon niet uit de planning.** De bewaking las
  `if (!nextSignature) return`, en een lege dag geeft een lege vingerafdruk —
  dus leegmaken zag eruit als "nog niets binnen". `null` = nog niets, `''` = een
  lege dag. 10 tests in `tests/external-job-signature.test.ts`.
- **Overloop-melding verborgen** op vraag van de gebruiker. Vlag
  `SHOW_OVERRUN_WARNING` bovenaan `DaySummary.tsx`; de berekening en haar tests
  blijven staan. Op `true` zetten brengt hem terug.

### 1. De dagplanning toont mock-data zodra de dag leeg is — het ergste punt

`app/api/sync/today/route.ts` heeft een terugvalpad: staan er geen geplande
bonnen in de database, dan vult hij de planning met bonnen uit `lib/mock-data.ts`
en geeft die de datum van **nu** mee. Op het scherm zie je dan drie jobs die er
niet zijn, en elke poging ze te verplaatsen eindigt in een 409 — de server kent
ze niet als werk van die dag.

Dit bestond al vóór v1.58 (herordenen van een mock-dag werd net zo goed
geweigerd), maar het valt nu pas op omdat er iets te slepen valt. Het is
gevonden doordat u1 geen enkele bon op vandaag had: zijn 17 bonnen liggen tussen
15/09/2025 en 18/04/2026.

**Voorlopig ondervangen** door twee echte bonnen op vandaag te zetten, zodat de
terugval niet aanslaat. Dat is een pleister. De vraag die beantwoord moet worden:
moet dat terugvalpad weg, of alleen op een demo-vlag draaien?

### 1b. Nog met de hand te testen op de telefoon

Het slepen met een echte vinger. Alles is met een muis nagemeten in Chromium;
de aanraakgreep (250 ms ingedrukt houden, `touch-none` op de greep) is ongewijzigd
overgenomen van de bestaande code, maar een echte vinger op een echt scherm is
er nog niet overheen gegaan.

Ook nog niet nagemeten: of het **terugslepen** naar de pool de herlaadbeurt
overleeft. Het scherm doet het goed en de serverkant is met integratietests
afgedekt, maar de schrijfactie vertrekt pas bij de volgende synchronisatie en de
testbrowser sloot daarvoor af.

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

### 5. Rijtijden — opgelost in v1.59, met één gat

**Wat er fout was.** `mockTravel` berekende rijtijden uit een hash van de twee
werkbon-id's, niet uit adressen. Twee bonnen bij dezelfde klant kregen daardoor
10 tot 44 minuten rijden — de gemelde "Ennea naar Ennea, 12 min". Nul was per
constructie onbereikbaar. Elk dagtotaal stond op verzonnen getallen.

**Wat er nu staat.** Vier lagen, goedkoopste eerst:

1. `lib/routing/travelCache.ts` — wat de routedienst al verteld heeft, 7 dagen
   geldig. Sleutel is het coördinatenpaar op 5 decimalen (~1 m).
2. `lib/routing/knownRoutes.ts` — met de hand vastgezette ritten. Nu alleen
   atelier ⇄ thuis op 1u30; de berekening zei 1u41.
3. `lib/routing/estimateTravel.ts` — hemelsbrede afstand × 1,3 omwegfactor,
   gedeeld door een snelheid die met de afstand meeschaalt (25/40/55/70 km/u).
4. niets — `? min · adres ontbreekt`, eerlijk.

**De quotumbesparing.** Een matrix-aanroep beantwoordt alle N×N paren; er werden
er N−1 bewaard en de rest weggegooid. Elke herordening vroeg dus opnieuw. Nu
worden alle paren bewaard, en de aanroep gebeurt alleen nog als de **verzameling**
stops verandert, niet de volgorde. Nagemeten op staging: 1 aanroep bij het laden,
**0 extra na twee keer schuiven**.

Er staat ook een cache op de server (procesbreed), zodat één technieker die zijn
dag opent hem opwarmt voor de volgende.

**Wat nog open staat:** de rijtijdcache leeft alleen in het geheugen van de tab
en van het servercontainer-proces. Hij overleeft geen herstart. Hem in IndexedDB
zetten vraagt een schemaversie-bump; de winst is klein omdat de servercache de
ORS-aanroep toch al tegenhoudt.

**ORS-quotum.** De sleutel gaf 403 "Quota exceeded" tijdens het testen. Reset is
een **voortschrijdend venster van 24 uur** vanaf je eerste aanvraag, niet om
middernacht. Het exacte aantal per endpoint staat alleen in het dashboard op
account.heigit.org. `getRouteMatrix` controleert nu `res.ok`, dus een quotumfout
is een nette logregel in plaats van een stack trace.

### 5b. Vestigingen zonder coördinaten — bijgevuld

Drie van de 21 vestigingen hadden geen `lat`/`lon`, waardoor hun ritten
`? min · adres ontbreekt` toonden. Twee echte klanten zijn bijgevuld met
`scripts/backfill-site-coordinates.ts`:

| klant | gevonden via | coördinaten |
|---|---|---|
| Molenhoeve group bvba | adres zoals opgeslagen | 51.172459, 4.563706 |
| Jan decan | **straat gecorrigeerd** | 51.180544, 4.423295 |
| Test Customer | niet gevonden — testrecord, met rust gelaten | — |

**Wat Jan decan leerde.** Het adres stond als
`Prinsbouwdewijnlaan 20, 2600 BERCHEM (ANTWERPEN)`. Twee fouten in één regel:

1. De gemeente draagt een postcode én een provincie tussen haakjes mee.
   Nominatim leest die hele string als plaatsnaam en vindt niets.
   `splitCity()` in `lib/routing/addressParts.ts` haalt ze uit elkaar.
2. De straat is fout gescand: het is **Prins Boudewijnlaan**. `correctStreet()`
   (Photon) vond dat wel; Nominatim niet, want die verdraagt geen typfouten.

**Het adres is rechtgezet** (goedgekeurd door de gebruiker), onder drie
voorwaarden die alle drie moeten gelden:

1. **zelfde gemeente** — `correctStreet` weigert al een match met een andere
   postcode; dat is wat een Kapelstraat in 2000 belet een Kapelstraat in 2070 te
   worden
2. **minstens 90% gelijk** — `lib/routing/similarity.ts`. Onder die drempel is
   het eerder een ándere straat dan een verkeerd gelezen straat. Berchem haalde
   95%.
3. **het opgeslagen adres was niet vindbaar** — anders komt de code er niet eens

Spaties tellen niet mee bij het vergelijken: OCR plakt woorden even makkelijk aan
elkaar als het letters weglaat.

Het gescande origineel gaat naar **`sites.address_scanned`** vóór het
overschreven wordt. `Prinsbouwdewijnlaan 20` staat daar nu. De papieren bon
blijft het dossier; wie de twee naast elkaar legt moet kunnen zien wat er
gewijzigd is en het kunnen terugdraaien.

Het script draait standaard als proefdraai en is herbruikbaar: nieuwe
vestigingen kunnen opnieuw ongelokaliseerd binnenkomen wanneer Nominatim traag
of weg is (`locateSite` zwijgt dan bewust).

### 5c. Concepten van werkbonnen — opgelost

**Gemeten wat er fout was:** typen in een bon, wegnavigeren en terug → bewaard.
Herladen → bewaard. **Ander toestel of gewiste opslag → weg.** Het opslaan werkte
dus wel, maar bereikte de server nooit. Een half ingevulde bon leefde op precies
één telefoon, en niets zei dat, want er was niets verstuurd.

Dat is dezelfde opslag die dingen weggooit als ze volloopt met bonfoto's — zie
de instellingen-bug. Het was geen theoretisch risico.

**Nu:** concepten gaan naar `work_order_drafts` via dezelfde offline-wachtrij als
de rest. Er staat altijd maar één concept per werkbon in de rij.

- **Nieuwste wint**, op het tijdstip dat het bewerkende toestel meegeeft
  (`lib/werkbon/draftMerge.ts`, 12 tests).
- Zet de serverversie iets opzij dat hier getypt was, dan **verschijnt er een
  melding** met wie. Stil werk laten verdwijnen mag niet.
- Onder de header staat een bolletje: *Bewaard* of *Bewaard op dit toestel —
  wacht op verbinding*.
- Bij het afsluiten van de bon wordt het concept aan beide kanten gewist.

Nagemeten op staging: alle drie de proeven slagen nu, inclusief het verse
toestel.

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

### 9. De splitsing stond op twee plaatsen — opgelost, maar let op

Bij het nameten op staging bleek: de server splitste de twee lijsten op
`plannedDate` (zoals bedoeld), maar de browsercache deed het nog op `source`,
via de IndexedDB-index `by-source`. Een gesleepte bon werd correct bewaard,
kwam correct terug van de server, stond correct in IndexedDB — en het scherm
zette hem terug in de pool.

**Geen enkele unittest ving dit**, omdat beide kanten op zich consistent waren.
Alleen slepen op de draaiende site en herladen maakte het zichtbaar.

De regel staat nu in `lib/planning/listPlacement.ts` (`isOnADay` / `isInThePool`)
met tests. De SQL in `getTodayInterventions` moet daarmee blijven overeenstemmen
— een index is nu eenmaal niet via een TypeScript-functie te bevragen, dus die
twee kopieën blijven bestaan en horen samen gelezen te worden.

### 10. Testgat: offline samenvouwen

`enqueuePlanningWrite` vouwt de wachtrij samen tot één planningsschrijfactie.
Dat is **niet** met een test afgedekt: er is geen in-memory IndexedDB in de
testopstelling (geen jsdom, geen fake-indexeddb). Met de hand na te gaan, of
`fake-indexeddb` toevoegen.

### 11. Weekplanning (v1.60) — gebouwd, nog niet uitgerold

Zestien commits, `7fb746b..762d131`. 415 tests groen, typecheck/lint/build schoon.
Nog **niets** uitgerold en de versie is **niet** verhoogd.

Wat er staat: `lib/planning/daySchedule.ts` (`computeDaySchedule` — vertrekuur +
rijtijd = aankomst = start eerste job, en zo verder; niets wordt opgeslagen),
`lib/planning/weekDays.ts`, `lib/planning/weekDropIntent.ts`,
`components/WeekView/` en de route `app/planning/week/`. De dagweergave toont nu
hetzelfde uur op haar kaarten, uit dezelfde functie.

**Drie dingen die nog met de hand op een echte telefoon moeten:**

1. **Is 62 px breed genoeg om met een duim te slepen?** Dit stond al in het
   ontwerp als het hoogste risico. Zo niet: indeling B is de terugval — `62px`
   → `108px` in `WeekGrid` en meer tekst per blok.
2. **Scrollt een veeg over een gevulde weekkolom?** `touch-none` wordt nu pas
   aangezet zodra het slepen echt begonnen is (na de 250 ms van de
   `TouchSensor`). Dat is op redenering gebouwd — er is hier geen harnas dat
   echte aanraakgebeurtenissen kan afvuren.
3. De 11 bonnen met `10:11` als tijdstip over de week verdelen, zodat de
   weergave met een deels gevulde planning te beoordelen is.

**Twee open beslissingen voor de gebruiker:**

- **De weekweergave leest niet offline.** Ze haalt elke dag op met een gewone
  `fetch`; zonder netwerk staan er zeven lege kolommen die niet te
  onderscheiden zijn van een lege week, en terugkomen op het scherm kan een nog
  niet verzonden sleep ongedaan lijken maken. Schrijven gaat wél eerst naar
  IndexedDB, dus er gaat niets verloren. `lib/useDayData.ts` doet het wel goed
  en is het voorbeeld. Het ontwerp vroeg dit nooit — het is nieuw werk.
- **Waar komt de knop die van weergave wisselt?** Vier opties zijn in mockup
  gezet (schakelbalk onder de kop / de titel als knop / één icoon / tabbalk
  onderaan). Er is nog niets vastgelegd; vandaag staat er nog "Week" in de
  datumbalk en "← Dag" in de kop.

**Eén gat dat bewust blijft staan:** `isOnDate` (`lib/planning/listPlacement.ts`)
bucket op **UTC**-kalenderdag, net als `getDayBounds` op de server, terwijl
`toLocalDateStr` uit **lokale** delen bouwt. Een bon die tussen lokale
middernacht en de UTC-offset (1–2 uur in België) ingepland wordt, valt daardoor
in de vorige bucket en kan uit de geplande lijst vallen tot de volgende
serververversing. De server heeft precies dezelfde bucketing, dus alleen de
client rechtzetten laat de twee juist uit elkaar lopen — dit moet in één keer
aan beide kanten beslist worden. Praktisch smal: de werkdag begint om 06:30.
Alle tests draaien in `Etc/UTC`, waar lokaal en UTC gelijk zijn, dus CI ziet dit
nooit.

De schrijfplek om te beginnen als je dit aanpakt: `components/DayView/PlanningBoard.tsx`
zet `plannedDate: selectedDate.toISOString()` — een echt lokaal moment, niet op
middernacht genormaliseerd. De weekweergave doet het anders en veiliger
(`${dateStr}T00:00:00.000Z`, waar dezelfde string er weer uit komt). Eén van de
twee vormen moet winnen, aan beide kanten van de lijn.

**Kleinere dingen die bewust bleven liggen:** twee blokken die allebei volledig
voorbij 18:00 lopen tekenen over elkaar heen op dezelfde 9 px; een blokje dat
korter is dan de minimumhoogte loopt enkele pixels voorbij zijn echte einde; de
`schedules`-memo van de weekweergave kan niet afhangen van de gedeelde
rijtijdencache, dus een al geopende weekweergave pikt een net opgehaalde rit pas
op als haar memo opnieuw draait; `sticky top-0` op de dagkoppen doet niets; de
echte uren en de reden "Rijtijd onbekend" zitten alleen in `title`, wat een
aanraakgebruiker nooit ziet; en de niet-job-blokken registreren dezelfde
sleep-id in elke kolom (nu onschadelijk, maar een Gantt vermenigvuldigt dat).

**De Gantt kan erop gebouwd worden.** `computeDaySchedule` leest niets uit
modulescope en noemt nergens een technieker — één aanroep per technieker is
precies waar ze voor gevormd is. Wat er nog voor moet gebeuren:
`getTodayInterventions` haalt één technieker op, en de sleep-id's hierboven
moeten uniek per kolom worden.

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
