# Ontwerp — slepen tussen open pool en dagplanning

Datum: 11 september 2026 · Doelversie: **v1.58** · Basis: `OVERDRACHT.md` punt 1

Prozateksten in het Nederlands, alle code/kolom/veldnamen in het Engels, conform
`CLAUDE.md`.

---

## 1. Wat we bouwen

Werkbonnen uit de open pool in de dagplanning kunnen slepen, **en omgekeerd**
terug naar de pool als de dag niet meer volstaat. De technieker blijft bij het
terugleggen aan de bon hangen — terugslepen wist alleen de datum, het maakt de
toewijzing niet ongedaan.

Daarbij hoort een waarschuwing wanneer de dag overloopt, en een knop om de
geschatte duur aan te passen — zonder die knop is de waarschuwing gebaseerd op
een getal dat je niet kan corrigeren.

### Beslissingen van de gebruiker

| vraag | keuze |
|---|---|
| Dag loopt over | Toelaten + waarschuwen. Nooit blokkeren. |
| Waartegen meten | Uurrooster, onbetaalde pauze gaat van de span af |
| Duur-knop | Mee in v1.58 |
| Bonnen met `estimated_minutes = NULL` | Bijvullen op 90, na aftelling |
| Terugslepen vergrendelt bij | **start van het werk**, niet bij `onderweg` |
| Rollen + wijzigingsmelding | Niet in v1.58 — wel de naden leggen |
| Versie | Nieuwe versie v1.58 |

### Uurrooster

| dag | span | − onbetaalde pauze | capaciteit werk + rijden |
|---|---|---|---|
| ma–do | 07:00–16:00 (9u00) | 30 min | **8u30** (510 min) |
| vr | 07:00–13:30 (6u30) | 30 min | **6u00** (360 min) |
| za/zo | — | — | geen rooster |

Weektotaal 40u00. De onbetaalde pauze wordt niet betaald maar de klok loopt
door, dus hij gaat van de span af om de capaciteit te krijgen.

---

## 2. Vondsten in de code die dit ontwerp sturen

Alle vier nagekeken in de code van v1.57, niet uit het hoofd.

### 2.1 De twee lijsten splitsen op `source`, niet op datum — blokkade

`getTodayInterventions()` in `lib/server/interventions.ts:335-342`:

```ts
const planned = sortPlanned(
  interventions.filter(i => assignedIds.includes(i.id) && i.source === 'planned'),
)
const open = interventions
  .filter(i => i.source === 'reactive' && i.visibleInPool)
```

`source` is het herkomstveld (`'planned'` = ingeplande onderhoudsbeurt,
`'reactive'` = binnengekomen oproep). Het wordt gezet in `createWorkOrder`
(`lib/server/work-orders.ts:562`) en **daarna nergens meer gewijzigd** — het
hele project doorzocht.

`OVERDRACHT.md` baseerde zich op de commentaar van `assign/route.ts`, die
beschrijft wat die route *schrijft*. De leeskant kijkt nooit naar `status` of
`plannedDate` om te beslissen in welk lijstje een bon hoort.

Gevolg voor slepen: een poolbon (`reactive`) die een datum krijgt verschijnt
**niet** in de planning (verkeerde `source`) en **blijft** in de pool
(`visibleInPool` staat nog op true). Het scherm doet alsof er niets gebeurd is.

### 2.2 De reorder-schrijfweg weigert elke verandering van de verzameling

`saveTechnicianPlanningOrder()` in `lib/server/interventions.ts:423-436`:

```ts
const plannedIds   = latest.planned.map(i => i.id).sort()
const requestedIds = [...input.orderedWorkOrderIds].sort()

if (plannedIds.length !== requestedIds.length || plannedIds.some(...)) {
  return { ok: false, ... }   // → 409
}
```

Precies wat slepen doet. `assign` + reorder als twee opdrachten geeft dus een
foutmelding na een geslaagde handeling.

### 2.3 `planningVersion` wordt verkeerd afgeleid aan clientzijde

`DayTimeline.tsx:89` stuurt `reorderedJobs[0]?.planningVersion` — die van de
**eerste** job. De server vergelijkt met `max(planningVersion)` over de dag
(`getPlanningVersion`, `interventions.ts:387`). Vandaag gelijk omdat alle bonnen
van een dag altijd samen op dezelfde versie gezet worden. Een bon die net uit de
pool komt staat echter nog op versie 1 terwijl de dag bv. op 7 staat → vals
conflict zodra hij vooraan valt.

### 2.4 `estimatedMinutes` heeft geen schrijfweg

Gezet in `createWorkOrder` (`work-orders.ts:565`, `DEFAULT_ESTIMATED_MINUTES = 90`)
en in `seed.ts`. Er is **geen** PATCH die het aanraakt. De duur-knop vraagt dus
een nieuw endpoint, niet alleen UI.

### 2.5 Push kan niet gericht sturen (context, buiten scope)

`app/api/push/subscribe/route.ts` bewaart abonnementen in een **`Set` in het
geheugen**, zonder koppeling naar een gebruiker. `/api/push/send` stuurt dus naar
iedereen en verliest alles bij een herstart. Gericht pushen vraagt eerst een
`push_subscriptions`-tabel met `user_id`. Staat los van slepen; apart punt.

---

## 3. Ontwerp

### 3.1 Datamodel — splitsen op `plannedDate`

```ts
// planning: aan mij toegewezen én op deze dag geprikt
const planned = assignedIds.includes(i.id) && i.plannedDate != null
// pool: nog geen dag geprikt, en niet handmatig verborgen
const open = i.plannedDate == null && i.visibleInPool
```

Eén veld beslist in welke lijst een bon staat. `source` blijft herkomst,
`visibleInPool` blijft de handmatige verbergschakelaar.

Verworpen alternatieven: `source` omschakelen bij het slepen (vernielt
herkomst, die later nodig is voor rapportering) · `visibleInPool` als
schakelaar (twee velden die samen één toestand coderen → lopen uit de pas).

**Risico:** dit verandert wat bestaande bonnen doen. Een bon met
`source = 'planned'` zonder datum staat nu nergens en duikt daarna op in de
pool. Waarschijnlijk correcter — hij *is* ongepland werk — maar het is een
zichtbare verandering op staging die los staat van slepen.
**Aftellen op de staging-database vóór uitrol.**

### 3.2 Componentgrens — `PlanningBoard`

De `DndContext` moet beide lijsten omspannen, en de sleep-afhandelaar heeft de
huidige volgorde nodig — die woont in `useRouteTimeline` binnen `DayTimeline`.
Alleen de context omhoog verplaatsen zet de handler los van zijn state.

```
DayView              datum, header, instellingen, data ophalen
  └── PlanningBoard     NIEUW — bezit DndContext + useRouteTimeline + drop-afhandeling
        ├── DayTimeline   wordt presentatie: krijgt fullSequence/totals als props
        └── OpenPool      NIEUW — poolkaarten, nu nog los in DayView geplakt
```

Lost drie dingen tegelijk op: context en state wonen samen · `DayView` krimpt
(368 regels, met ~60 regels poolkaart-JSX en een tweede kopie van
`typeClass`/`statusLabel`/`formatMinutes` die al in `JobTimelineCard` staan) ·
`DayTimeline` wordt wat hij heet.

dnd-kit-onderdelen: `DndContext` (buitenste schil — twee losse contexts kunnen
niet naar elkaar slepen) · `SortableContext` per lijst · `useSortable` per kaart
(bestaat al) · **`useDroppable` per lijstcontainer** — nodig om in een *lege*
pool of lege dag te kunnen droppen.

De bestaande aanraaksensor gaat ongewijzigd mee: `TouchSensor` met 250 ms delay
plus een aparte sleepgreep (`touch-none`), zodat de lijst scrollbaar blijft.

### 3.3 `lib/planning/dropIntent.ts` — de beslissing als pure functie

Kent dnd-kit niet, alleen strings. Daardoor testbaar zonder browser.

```ts
export type DropIntent =
  | { kind: 'reorder';    orderedIds: string[] }
  | { kind: 'schedule';   workOrderId: string; position: number }
  | { kind: 'unschedule'; workOrderId: string }
  | { kind: 'none';       reason: string }

export function resolveDropIntent(input: {
  activeId:   string
  overId:     string | null
  plannedIds: string[]   // volgorde van de dag, inclusief 'break'
  poolIds:    string[]
  statusById: Record<string, InterventionStatus>
}): DropIntent
```

| van | naar | uitkomst |
|---|---|---|
| planning | planning | `reorder` |
| pool | planning | `schedule` op de drop-positie |
| planning | pool | `unschedule` |
| pool | pool | `none` — poolvolgorde wordt niet bewaard (server sorteert op dringend) |
| pauze | pool | `none` — de middagpauze is geen werkbon |
| vergrendelde status | pool | `none` |
| ergens | nergens | `none` — losgelaten naast de lijst |

**Vergrendeling — allowlist, geen blocklist.** Terugslepen mag bij
`aangemaakt`, `gepland` en `onderweg`. Bij al de rest (`bezig`,
`wacht_onderdelen`, `afgewerkt`, `geannuleerd`) verdwijnt de sleepgreep.
Een status die er later bijkomt is dan standaard *vast* — de veilige kant.

Grens bewust bij de start van het werk, niet bij `onderweg`: onderweg is nog
geen klantcontact, dus omdraaien moet kunnen.

### 3.4 Eén schrijfbeweging die de hele dag beschrijft

In plaats van twee opdrachten ("zet datum" + "herorden") één momentopname:

```ts
type UpdatePlanningPayload = {
  technicianId:        string
  date:                string    // YYYY-MM-DD
  planningVersion:     number    // max over de dag (zie 2.3)
  orderedWorkOrderIds: string[]  // de volledige dag, op volgorde
}
```

De server leidt de rest af:

- staat in de lijst, nog niet op de dag → toewijzen + `plannedDate` zetten
  (`aangemaakt` → `gepland`)
- staat niet meer in de lijst, wel op de dag → `plannedDate = null`
  (`gepland`/`onderweg` → `aangemaakt`). **De toewijzingsrij blijft staan** —
  de technieker blijft aan de bon hangen.
- daarna volgorde wegschrijven en `planningVersion` ophogen, in één transactie

De payload beschrijft een **toestand**, geen verandering. Daardoor idempotent:
twee keer uitvoeren geeft hetzelfde resultaat als één keer.

**Aanname (zeg het als het anders moet):** een bon op `onderweg` die terug naar
de pool gaat, krijgt status `aangemaakt`. Anders staat er een bon in de pool die
beweert dat er iemand naartoe rijdt.

#### Offline

Dít is waarom het één beweging moet zijn. De bestaande reorder vouwt de rij al
samen (`DayTimeline.tsx:83-93`):

```ts
await removePendingWritesByType('update_sequence')
await enqueuePendingWrite({ type: 'update_sequence', ... })
```

Er staat altijd maar **één** wachtende planningsopdracht. Twintig sleepbewegingen
offline → één opdracht met het eindresultaat bij het online komen.

Met twee losse opdrachten breekt dat: niet samen te vouwen, ze stapelen op, en
elke opdracht draagt een versienummer dat verouderd is zodra de vorige
uitgevoerd is → drie conflicten op rij na drie sleepbewegingen offline.

#### Wat er concreet verandert

| bestand | wijziging |
|---|---|
| `lib/server/interventions.ts` | `saveTechnicianPlanningOrder` → `savePlanningSnapshot`; set-gelijkheidscheck eruit, toevoegen/vrijgeven erin |
| `app/api/sync/write/route.ts` | payload-validatie meegroeien; blijft dezelfde deur |
| `lib/idb.ts` | `PendingWrite['type']`: `'update_sequence'` → `'update_planning'` |
| `lib/sync.ts` | 409-afhandeling meebenoemen |

#### De veiligheidscheck die verdwijnt, wordt vervangen

De set-gelijkheidscheck ving een client die met verouderde data schrijft. Die
rol wordt overgenomen door:

1. de `planningVersion`-check, die blijft — dát is de echte conflictbewaker — en
   die nu gevoed wordt met de **max** over de dag in plaats van de eerste job;
2. een serverregel: een bon met vergrendelde status wordt **nooit** vrijgegeven,
   ook niet als de client hem uit de lijst laat. De sleepgreep verbergen is
   comfort, deze regel is de grendel.

### 3.5 Naden voor rollen en meldingen (features zelf in v1.59)

Vier kleine ingrepen die later een herschrijving voorkomen:

1. **Eén serverdeur** — `savePlanningSnapshot({ actor, technicianId, date, ... })`
   met `actor: { id, role }` er vanaf het begin in. Zolang álle
   planningswijzigingen hierdoor gaan, is de autorisatiecheck later één `if` op
   één plek. Gaat slepen rechtstreeks naar `assign`, dan bestaat die deur nooit.
2. **`plannedByRole`** op de werkbon — één kolom, geschreven bij elke
   planningswijziging, door niemand gelezen in v1.58. Zonder dit is een
   verplaatsing achteraf niet toe te wijzen.
3. **`planning_changed`-event** in `workOrderEvents` (actor, rol, van/naar). De
   tabel en het patroon bestaan al — één `insert`. Later de bron voor de tekst
   van de melding én voor het planbord.
4. **`planningVersion` als `max`** — sowieso de bug uit 2.3, en meteen het getal
   waarop de latere melding steunt.

`types/index.ts:181` heeft `User.role` al:
`'technician' | 'office' | 'admin' | 'hr' | 'warehouse' | 'planner'`.

#### Ontwerp voor v1.59 — vastgelegd zodat het niet opnieuw uitgedacht moet

- **Grendel:** staat `plannedByRole` op `admin`/`planner`/`office`, dan verdwijnt
  de sleepgreep bij de technieker én weigert de server het (403). De technieker
  moet bellen. Eigen verplaatsingen zijn vrij.
- **Melding in de app:** `DayMeta` krijgt `lastSeenPlanningVersion`. Is de
  serverversie hoger en heb je hem niet zelf opgehoogd, dan heeft iemand anders
  aan je dag gezeten → rode regel onder "Planning". Eigen sleepbewegingen geven
  de nieuwe versie meteen terug en triggeren hem dus nooit.
- **Vorm:** tijdstip + korte tekst + kruisje. Een nieuwe regel per wijziging.
  Wijzigingen van terwijl je offline was worden samengevouwen tot **één** regel
  bij het terugkomen.
- **Beide kanalen:** in de app én via push.
- **Bevestiging:** web-push geeft géén leesbevestiging. De pushdienst antwoordt
  `201` (aanvaard — bewijst niet dat het toestel het kreeg) of `410 Gone`
  (abonnement bestaat niet meer). Drie oplopende signalen zijn wel bouwbaar:
  *verzonden* (antwoord pushdienst, gratis, bewijst bijna niets) · *afgeleverd*
  (service worker belt bij ontvangst terug) · **gezien** (technieker klikt het
  kruisje → dat meldt terug). Alleen de derde beantwoordt "weet de technieker
  het?", en die komt uit de app, niet uit push.
- **Aanwezigheid:** `lastSeenAt` bijwerken bij elke synchronisatie geeft
  "laatst gezien 3 min geleden". Geen echte aanwezigheid, wel eerlijk en goedkoop.
- Vereist eerst een `push_subscriptions`-tabel met `user_id` (zie 2.5).

### 3.6 Rooster en overloop-waarschuwing

```ts
// lib/planning/workSchedule.ts — één tabel, alle lezers halen hier hun getal
export const UNPAID_BREAK_MINUTES = 30

export const WORK_SCHEDULE = {
  1: { start: '07:00', end: '16:00' },  // maandag
  2: { start: '07:00', end: '16:00' },
  3: { start: '07:00', end: '16:00' },
  4: { start: '07:00', end: '16:00' },  // donderdag
  5: { start: '07:00', end: '13:30' },  // vrijdag
  6: null,                              // zaterdag
  0: null,                              // zondag
} as const

// capaciteit = (einde − start) − UNPAID_BREAK_MINUTES
```

- `useRouteTimeline` krijgt er één afgeleid getal bij:
  `overloop = werkminuten + rijminuten − capaciteit(dag)`.
- `DaySummary` krijgt een vierde toestand: bij `overloop > 0` rood, met
  *"loopt 45 min over"*. Blokkeert niets.
- `settings.startTime` standaard **07:30 → 07:00**, overeenkomstig het rooster.
- `OvertimeWidget` leest `capaciteit(vandaag)` in plaats van
  `TARGET_MINUTES = 7u45`. Op vrijdag zegt hij dan 6u00.
- Weekend: geen rooster → geen capaciteit → geen waarschuwing, wel planbaar.

Dit is **puur weergave** — er wordt niets bewaard, dus een rekenfout kan de
planning niet beschadigen. Wel laag risico, geen nul risico: een verkeerde
waarschuwing stuurt wél beslissingen.

**Het weekpotje van 40u is bewust géén werkende teller in v1.58.** Een week
optellen vraagt gewerkte tijd, en niets schrijft naar `workStart` / `workEnd` /
`statusArrivedAt` (`OVERDRACHT.md` punt 2) — `OvertimeWidget` krijgt vandaag
`saldo={null}` hardgecodeerd. De roostertabel wordt wel zo gebouwd dat de
weekcapaciteit (40u00) eruit af te leiden is, zodat de teller later alleen nog
een bron van gewerkte uren nodig heeft.

### 3.7 Duur-knop

- `PATCH /api/work-orders/[id]/estimate` met `{ estimatedMinutes }`, in lijn met
  de bestaande `pool-visibility`-subroute.
- Tikbare duur-badge op `JobTimelineCard` en op de poolkaart → klein invulveld,
  vrije minuten, **ook leeg mogen laten** (regel: geen enkel veld verplicht).
- Offline via `enqueuePendingWrite` met eigen type `update_estimate`. Niet
  samen te vouwen per type — wel per werkbon-id: laatste waarde wint.

### 3.8 Bijvullen van `estimated_minutes = NULL`

Eén `UPDATE` op de staging-database:
`SET estimated_minutes = 90 WHERE estimated_minutes IS NULL`.
**Eerst tellen en het aantal tonen**, dan pas uitvoeren — het is echte data.

### 3.9 Instellingen worden niet bewaard — taak 1

Gemeld: startlocatie en startuur blijven niet staan. De gebruiker gebruikt
daarbij de oranje initialen-knop op het dagoverzicht (`SettingsSheet`). **Nog
niet zelf gereproduceerd** — dat is de eerste stap.

Stand van het onderzoek: `updateSetting` schrijft door naar `localStorage` onder
`bossuyt.settings` (`useSettings.ts:155-158`), en **niets in het project wist die
sleutel** — gezocht op `localStorage.clear` en `removeItem`; de enige treffers
zijn de oude takenlijst onder een andere sleutel. De fout zit dus elders dan waar
hij lijkt te zitten: waarschijnlijk wél bewaard, maar bij het heropenen
overschreven of niet teruggelezen. Serverweergave die de standaardwaarden rendert
en daarna niet wijkt voor wat in de browser staat is het sterkste vermoeden —
maar het blijft een vermoeden.

**Eerst reproduceren, dan pas wijzigen.** Hij hoort in v1.58 omdat de
overloop-berekening op `startTime` steunt.

Meegenomen: `SettingsSheet` (dagoverzicht) en `AvatarMenu` (`/activiteiten`,
`/magazijn`, interventiepagina) zijn **twee kopieën van dezelfde drie controls**,
allebei in gebruik. Ze delen `useSettings`, dus ze spreken elkaar niet tegen,
maar elke wijziging moet nu op twee plaatsen. De drie controls gaan naar één
gedeelde component — anders is de bug half gerepareerd.

---

## 4. Buiten scope voor v1.58

- Rolgrendel en wijzigingsmelding als werkende features (naden wel, zie 3.5)
- `push_subscriptions`-tabel met `user_id`, en gericht pushen
- Weekteller richting het 40-urenpotje
- Rekbare tijdlijn (`OVERDRACHT.md` punt 2)
- Bestanden toevoegen aan een werkbon (`OVERDRACHT.md` punt 5)
- Wat er na een onderbroken job gebeurt: bon heropenen + tijd bijzetten, versus
  een gekoppelde `.01`-bon. De machinerie voor het tweede bestaat al
  (`app/api/work-orders/[id]/follow-up/route.ts`). Eigen ontwerp.

---

## 5. Testplan

Het zwaartepunt ligt bij de pure functies — die dekken de takken waar een fout
stil blijft.

| wat | hoe |
|---|---|
| `resolveDropIntent` — alle 7 takken + vergrendelde statussen | unit, geen browser |
| capaciteit per weekdag + overloopberekening | unit, tabel invoer/uitvoer |
| `savePlanningSnapshot` — toevoegen, vrijgeven, herordenen, versieconflict, weigering bij `bezig` | integratie tegen de testdatabase |
| offline: drie sleepbewegingen → één wachtende schrijfopdracht | unit tegen de IDB-laag |
| instellingen blijven bewaard na heropenen | regressietest bij de bugfix |
| het slepen zelf | met de hand op de telefoon — de enige eerlijke test voor aanraking |

208 tests staan groen bij v1.57; dat is de ondergrens.

`npm test` gebruiken, **niet** `npx vitest` — die pikt een verouderde kopie in
`.next/standalone/tests/` op en lost de `@/`-alias niet op.

---

## 6. Risico's

| risico | ernst | beheersing |
|---|---|---|
| 3.1 verandert waar bestaande bonnen verschijnen | middel | aftellen op staging vóór uitrol |
| set-gelijkheidscheck verdwijnt | middel | vervangen door versiecheck + statusgrendel serverzijde (3.4) |
| `PlanningBoard` verschuift een componentgrens | laag | gedrag ongewijzigd; bestaande reorder-tests blijven de vangnet |
| NULL-bijvulling raakt echte data | middel | eerst tellen, tonen, akkoord vragen |
| overloop-waarschuwing rekent verkeerd | laag | puur weergave, niets bewaard — maar stuurt wél beslissingen |

---

## 7. Valkuilen bij het uitrollen

Overgenomen uit `OVERDRACHT.md`, nog steeds geldig:

- `make staging-up` roept `scripts/pre-staging.sh` aan, die **zelf** de versie
  bumpt en een lege placeholder in `lib/releases.ts` schuift. Volgorde dus:
  **eerst bumpen, dan de notes schrijven.**
- De DB-wachtwoorden bevatten `@` — in een URL door `encodeURIComponent`.
- Herbouwen tijdens het testen breekt de open tab van de gebruiker. Eerst vragen.
