# Ontwerp — weekplanning

Datum: 12 september 2026 · Doelversie: **v1.60** · Volgt op v1.59

Mockup waarop dit gebaseerd is: indeling **A**, gekozen uit drie opties.
Prozateksten Nederlands, code en veldnamen Engels, conform `CLAUDE.md`.

---

## 1. Wat we bouwen

Een weekweergave die eruitziet als een agenda: zeven dagkolommen, 06:30 tot
18:00, blokken op schaal van hun duur. Dezelfde open pool eronder, en slepen
over de hele week heen.

Dit wordt gebouwd met de Gantt-weergave per technieker in het achterhoofd. Die
komt erna en draait op precies dezelfde tijdmotor.

### Beslissingen van de gebruiker

| vraag | keuze |
|---|---|
| Indeling | **A** — zeven kolommen van 62 px, zijwaarts vegen |
| Wanneer begint een job | Bij **aankomst**: vertrekuur + rijtijd |
| Waar begint de dag | Bij de **ingestelde** startlocatie, niet per technieker hard gezet |
| Scherm | Telefoon eerst, zoals de rest |
| Jobs tegen elkaar | Mag niet — er zit altijd rijtijd tussen |
| Starttijd bewaren | Nee — afgeleid, dus slepen naar de pool laat hem vanzelf verdwijnen |

---

## 2. De tijdmotor — het fundament

### 2.1 De regel

```
07:00              vertrek van de ingestelde startlocatie
07:00 → 08:22      rijden naar klant 1
08:22              AANKOMST = start job 1
08:22 → 09:52      job 1 (90 min)
09:52 → 09:52      geen rijtijd: klant 2 ligt op hetzelfde adres
09:52 → 10:52      job 2 (60 min)
...
16:12 → 17:03      rijden terug
17:03              thuis
```

Uren lopen van de startlocatie tot de startlocatie. De rit erheen en terug
tellen dus mee — wat al zo was in de dagtotalen (`werk + rijden`), maar nu ook
zichtbaar wordt als kloktijd.

### 2.2 Een nieuwe pure module

`lib/planning/daySchedule.ts`:

```ts
export interface ScheduleBlock {
  kind: 'anchor' | 'travel' | 'job' | 'break'
  id: string
  startMinutes: number   // minuten sinds middernacht, lokale tijd
  endMinutes: number
  interventionId?: string
}

export function computeDaySchedule(input: {
  departureMinutes: number          // settings.startTime
  origin: Coordinates | undefined   // settings.startLocation
  jobs: Array<{ id: string; estimatedMinutes?: number; at?: Coordinates }>
  travelBetween: (from?: Coordinates, to?: Coordinates) => number | null
  breakMinutes: number
}): {
  blocks: ScheduleBlock[]
  backAtOriginMinutes: number | null
  workMinutes: number
  travelMinutes: number
  unknownLegs: number
}
```

**Waarom een aparte pure functie en niet in de component:**

1. **De Gantt draait erop.** Techniekers als rijen, tijd als as — dat is deze
   functie, één keer per technieker. In een component gebouwd zou ze daar
   opnieuw geschreven moeten worden.
2. **De dagweergave kan haar meteen gebruiken.** Die toont nu alleen duren; met
   deze functie staat er een echt uur bij elke kaart.
3. **Uren die een minuut verschuiven zie je niet op een scherm.** Wel in een
   test.

`travelBetween` is een functie en geen tabel, zodat de bestaande lagen
(`travelCache` → `knownRoutes` → `estimateTravel`) er ongewijzigd in passen.
Geeft ze `null`, dan is de rijtijd onbekend: het blok wordt getekend met `?` en
`unknownLegs` telt op, net zoals nu in `DaySummary`.

### 2.3 Geen schemawijziging

Er wordt **geen** starttijd opgeslagen. Dat is de winst van de gekozen regel:

- niets kan uit de pas lopen met de werkelijkheid
- loopt een job uit, dan schuift alles erachter mee
- naar de pool slepen laat het uur verdwijnen zonder dat er iets gewist moet
  worden
- terugslepen berekent het opnieuw

`planned_date` blijft betekenen **welke dag**, niet welk uur.

**Op te ruimen:** 11 rijen dragen nu `10:11` als tijdstip — restanten van de
oude placeholder die `new Date()` gebruikte. In een agendaweergave zien die
eruit als afspraken. Ze worden op de dagstart gezet zodat ze meelopen in de
afgeleide volgorde. De gebruiker gaf aan dat dit mock-data is en dat ze gerust
wat verdeeld mogen worden over de week om een deels gevulde planning te tonen.

---

## 3. De weergave

### 3.1 Indeling A

- **Venster:** 06:30 – 18:00. Vast, niet instelbaar in v1.60.
- **Tijdgoot:** 34 px, plakt links bij zijwaarts scrollen.
- **Dagkolommen:** 62 px elk, zeven stuks, horizontaal scrollbaar.
- **Hoogte:** instelbaar per uur (34–96 px). Standaard 54 px ≈ 0,9 px/min.
- **Buiten het rooster** (voor 07:00, na 16:00 / vr 13:30) krijgt een vlakke
  grijstint, zodat de werkdag eruit springt zonder een harde grens te trekken —
  weekendwerk en overuren blijven gewoon tekenbaar.
- **Weekend:** geen rooster, hele kolom gedempt.

### 3.2 De blokken

| blok | behandeling |
|---|---|
| job | volle kleur naar type, wit op gekleurd; dringend = rood |
| rijtijd | gestreepte grijstint, smaller dan een job — het is verplaatsing, geen werk |
| pauze | vlakke `stroke`-kleur |
| start/einde | donker `brand-dark`, klein, niet versleepbaar |

Op 62 px past een klantnaam niet. Een blok toont het **uur** en, als het hoog
genoeg is, de eerste naam. Tikken opent de werkbon. Dat is bewust: de kleur
draagt het overzicht, de tik draagt het detail.

### 3.3 Navigatie

Nieuwe route `app/planning/week/page.tsx`. Vanaf het dagoverzicht een knop in
de datumbalk; terug via dezelfde weg. De dagweergave blijft het beginscherm —
die is waar een technieker in de bus naar kijkt.

---

## 4. Slepen

### 4.1 Waarom een smalle kolom volstaat

Omdat tijden afgeleid zijn, hoeft een drop **geen uur te raken**. Je laat los op
een **dag** en op een **plaats in de rij**. Het uur volgt uit de berekening. Een
kolom van 62 px is daarmee een prima doelwit — bij opgeslagen starttijden had je
op een telefoon naar 10:30 moeten mikken, en dat lukt niet met een duim.

### 4.2 Drie bewegingen

| van | naar | gevolg |
|---|---|---|
| pool | dag in de week | `schedule` op die dag, op de gevonden positie |
| dag | pool | `unschedule` — datum weg, technieker blijft |
| dag | andere dag | `unschedule` + `schedule` — één schrijfbeweging per dag |

De laatste is nieuw en de reden dat `savePlanningSnapshot` **per dag** werkt:
een verplaatsing tussen twee dagen is twee momentopnames, niet één. Ze worden na
elkaar weggeschreven; mislukt de tweede, dan staat de bon in de pool en niet op
twee dagen tegelijk. Dat is de veilige richting.

### 4.3 Hergebruik

`resolveDropIntent` blijft ongewijzigd bruikbaar: hij werkt op id's en lijsten,
niet op coördinaten of uren. Wat erbij komt is één laag erboven die de dag
bepaalt waarin gedropt wordt — de droppable per dagkolom.

De statusgrendel (`canLeaveTheDay`) geldt onveranderd: een bon waaraan gewerkt
wordt, verlaat zijn dag niet.

---

## 5. Wat dit voorbereidt voor de Gantt

De Gantt toont techniekers als rijen en tijd als horizontale as. Wat hij nodig
heeft en wat dit ontwerp al levert:

- `computeDaySchedule` per technieker — dezelfde functie, andere invoer
- `savePlanningSnapshot` neemt al een `technicianId`, dus werk naar een andere
  technieker slepen is een bestaande schrijfbeweging met een ander argument
- `plannedByRole` en de `planning_changed`-events liggen er al, en dát is wat de
  Gantt-gebruiker (planning, niet de technieker) straks moet kunnen zien

Wat er dan nog bij moet: het ophalen van meerdere techniekers tegelijk
(`getTodayInterventions` doet er nu één), en de rolgrendel uit v1.58's naden.

---

## 6. Buiten scope voor v1.60

- De Gantt zelf
- Een instelbaar tijdvenster
- Meerdere techniekers in één weekweergave
- Vaste afspraken op een uur vastpinnen ("klant vroeg 14u"). Het model laat dit
  later toe via één extra veld; er is nu geen vraag naar.

---

## 7. Testplan

| wat | hoe |
|---|---|
| `computeDaySchedule` — aankomst, opeenvolging, pauze, terugrit | unit |
| twee jobs op hetzelfde adres → 0 rijtijd ertussen | unit |
| onbekende rijtijd → blok met `?`, telt als onbekend | unit |
| lege dag → geen blokken, geen terugrit | unit |
| dag zonder rooster (weekend) → nog steeds tekenbaar | unit |
| verplaatsing tussen twee dagen → twee momentopnames, juiste volgorde | integratie |
| het slepen zelf op een telefoon | met de hand — de enige eerlijke test voor aanraking |

368 tests staan groen; dat is de ondergrens.

---

## 8. Risico's

| risico | ernst | beheersing |
|---|---|---|
| 62 px is te smal om te slepen met een duim | **hoog** | eerst met de hand testen op het echte toestel; indeling B (108 px) ligt klaar als terugval |
| verplaatsing tussen dagen faalt halverwege | middel | volgorde zo dat de bon hoogstens in de pool belandt, nooit op twee dagen |
| afgeleide uren lijken exacter dan ze zijn | middel | rijtijden zijn schattingen zolang ORS zwijgt; hetzelfde "ongeveer" als in `DaySummary` |
| de dagweergave en de weekweergave rekenen verschillend | laag | één gedeelde `computeDaySchedule`, en de dagweergave gaat er ook op |
