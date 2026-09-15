# Verlof en afwezigheid — ontwerp

**15 september 2026.** Besproken met de gebruiker, nog niet gebouwd.

---

## Afbakening, en waarom die zo smal is

Deze app wordt **geen verlofadministratie**. Techniekers vragen hun verlof aan
via Liantis, het sociaal secretariaat waar de zaak al mee werkt. Wat hier komt
te staan is wat er al beslist is, zodat de planning ermee kan rekenen.

Die knip is bewust gemaakt. Er is nagegaan of Liantis een koppeling aanbiedt:
die bestaat, maar er is geen self-service developersportaal — sleutels lopen
via Liantis Integration Services als onderdeel van een partnerschap, aan te
vragen door de klant zelf. En wat er via die weg te halen valt is mager: de
bekende connector kent alleen `employees`, in bèta, zonder verlof of
afwezigheden. De gebruiker heeft daarop beslist de koppeling te laten voor wat
ze is.

Het gevolg is de belangrijkste regel van dit ontwerp: **één bron per vraag.**
Hoeveel dagen iemand nog heeft, weet Liantis. Wanneer iemand er niet is, weet
deze app. Die twee vragen worden nooit door allebei beantwoord.

Met één uitzondering, en die is uitdrukkelijk door de gebruiker gemaakt: zie
"De overurenteller".

## Het model

Eén tabel, `technician_absences`:

| kolom | type | waarom |
|---|---|---|
| `id` | uuid | |
| `technician_id` | fk → `technicians` | |
| `day` | date | |
| `kind` | enum, acht waarden | wettelijke categorieën, geen vrije tekst |
| `minutes` | integer | zie hieronder |
| `note` | text, null | "doktersbriefje binnen", "halve dag vanaf 12u" |
| `created_by` | text | wie het zette |
| `created_at` | timestamptz | |

Sleutel op (`technician_id`, `day`, `kind`).

### Waarom minuten, en niet "hele of halve dag"

Twee redenen, en ze wegen allebei.

Recuperatie van overuren wordt vaak **in uren** genomen. Twee uur eerder weg is
ook recup. Een model dat alleen hele en halve dagen kent, kan dat niet
uitdrukken en dwingt tot afronden — precies op het getal dat straks van een
saldo afgaat.

En een hele dag is niet overal even lang. Het rooster in
`lib/planning/workSchedule.ts` is 07:00–16:00 van maandag tot en met donderdag
en 07:00–13:30 op vrijdag, telkens met 30 minuten onbetaalde pauze: **8u30 op
een lange dag, 6u00 op vrijdag**. Door minuten op te slaan blijft dat rooster
de enige plek die weet hoe lang een dag is — en dat is één bron te minder die
kan gaan afwijken.

Het scherm biedt gewoon "hele dag / halve dag / eigen aantal uren" en rekent
dat om via `dayCapacityMinutes(date)`.

### Waarom meerdere rijen per dag

Uit de bespreking, letterlijk: *"Halve dag verlof scheelt wel van halve dag
recup."* Die twee kunnen samen één dag vullen, en dan moet elk zijn eigen soort
houden — anders gaat de ene van het verkeerde saldo af. De afwezige tijd van
een dag is de som van zijn rijen.

## De acht soorten

Vastgelegd in de code, niet in de database als vrije tekst. Het zijn wettelijke
categorieën en geen etiketten die iemand mag verzinnen:

`ziekte` · `recuperatie_overuren` · `opleidingsverlof` · `vakantie` ·
`klein_verlet` · `sollicitatieverlof` · `toegestane_afwezigheid` ·
`economische_werkloosheid`

Functioneel verschillen ze in één opzicht: `recuperatie_overuren` gaat van de
overurenteller af. De rest blokkeert alleen tijd. Ze verschillen verder in naam
en kleur, want een planner die ziekte van vakantie moet onderscheiden, kijkt
naar een kolom en niet in een tabel.

## Wat de planning ermee doet

De afwezige minuten gaan van de dagcapaciteit af.

**Een hele dag** geeft capaciteit nul. De dagweergave toont de afwezigheid in
plaats van een route.

**Een deel van een dag** geeft een kortere dag. De tijd gaat er **achteraan**
af: de dag begint op het roosteruur en eindigt vroeger. Dat is een keuze, en ze
steunt op wat de gebruiker zei: *"of de technieker nu van 9 tot 13u of van 7u
tot 11u werkt maakt niet uit."* Achteraan is dan het eenvoudigst, en het is ook
hoe een halve dag meestal genomen wordt.

Op zo'n verkorte dag mag de middagpauze vervallen. De motor kan dat al —
`computeDaySchedule` neemt `breakBefore`, en `-1` betekent geen pauze.

## Een bon op een dag met verlof

**Hele dag: weigeren.** Die persoon is er niet; een bon erop zetten is geen
planning maar een fout. Wil je er toch werk op, haal dan eerst het verlof weg.

**Deel van een dag: toegestaan.** Dat is juist het punt van een halve dag — er
past nog werk op. De overloopwaarschuwing die er al is, rekent dan tegen de
verkorte capaciteit in plaats van tegen het volle rooster.

## Bonnen die er al stonden

Een afwezigheid op een dag die al bonnen draagt, geeft die bonnen vrij naar de
pool. De gebruiker koos dit boven weigeren, met de reden erbij: *"'afwezig' kan
ook ziek zijn"* — en ziekte komt onaangekondigd, soms halverwege de ochtend.

**Maar niet alle bonnen.** Een bon met een ingevuld aankomst- of vertrekuur
blijft staan. Dat is dezelfde regel die `releaseForgottenWorkOrders` al
hanteert, en om dezelfde reden: wat gedaan is, is gedaan, en dat hoort niet
weggetrokken te worden omdat de namiddag wegvalt.

Bij elke vrijgave wordt een gebeurtenis weggeschreven **met de technieker
erin**. Dat is geen boekhouding om de boekhouding: er staat een beslissing
open — gaan die bonnen naar de algemene pool zodat een collega ze kan
overnemen, of blijven ze bij deze technieker omdat de onderdelen in zijn bus
liggen of omdat hij het toestel kent? Die vraag wordt met admin besproken. Door
de technieker nu al vast te leggen, kan ze later beantwoord worden zonder dat
het spoor kwijt is.

## Ziekte op een dag die al loopt

Iemand belt om 07:30 ziek terwijl de dagklok tikt. Dan **stopt de klok op dat
moment en blijft de gewerkte tijd staan.** Wat er tot dan gewerkt is telt mee
voor de overuren; de rest van de dag is ziekte.

Dat is de enige plek waar het zetten van een afwezigheid aan de dagklok komt.
Overal elders laat het de klok met rust.

## Achteraf registreren

Een afwezigheid op een dag die al voorbij is mag, **zolang er die dag geen
bonnen uitgevoerd zijn.** De redenering van de gebruiker: als er gewerkt is,
wás het geen afwezigheid.

Eén plaats waar die regel geïnterpreteerd moet worden, en dit is de lezing die
gebouwd wordt tot iemand ze tegenspreekt:

> Iemand werkt de voormiddag en gaat 's middags ziek naar huis. Admin
> registreert dat pas de dag erna. Strikt gelezen is dat geblokkeerd — er zijn
> bonnen uitgevoerd.

De bedoeling van de regel is dat uitgevoerd werk niet uitgewist wordt, en een
**gedeeltelijke** afwezigheid wist niets uit: de bonnen blijven staan. Daarom:

- **Hele dag achteraf** — geweigerd zodra er die dag een werkbon met een
  aankomst- of vertrekuur bestaat.
- **Deel van een dag achteraf** — toegestaan, zolang de afwezige minuten plus
  de gewerkte minuten binnen de dagcapaciteit blijven.

## De overurenteller

`recuperatie_overuren` gaat van het saldo af. Alle andere soorten niet.

**Het saldo wordt berekend, niet opgeslagen.** Per dag: de gewerkte tijd uit de
dagklok (`technician_days`, via `workedToday`) min het rooster, en daar de
recupminuten van die dag af. Een opgeslagen saldo kan uit de pas lopen met de
dagen waar het uit volgt; een berekend saldo kan dat per definitie niet.

Hier wordt bewust van de afbakening bovenaan afgeweken, en dat is een
beslissing van de gebruiker. Het gevolg moet erbij gezegd worden: de app gaat
een getal beweren waar mensen naar handelen, en dat getal kan afwijken van wat
Liantis berekent — andere feestdagen, andere afrondingen, correcties die daar
wel en hier niet binnenkomen. **In beeld staat er daarom bij dat het de telling
van de app is**, niet die van het sociaal secretariaat.

## Rechten en zichtbaarheid

Iedereen ziet het staan, ook de technieker zelf: "Vakantie" op zijn eigen dag
is precies wat hij moet weten. Alleen admin en management zetten of halen weg.

**Dat laatste is vandaag niet afdwingbaar.** Deze app heeft geen aanmelding —
gemeten op 15 september 2026: `/api/sync/today`, `/api/technicians`,
`/api/customers` en alle klantfoto's antwoorden met 200 zonder cookie of
sleutel. "Alleen admin" is dus een knop die ergens anders staat, geen grens.
Dat is geen reden om dit niet te bouwen, maar het hoort hier te staan: de
echte grens komt pas met de aanmelding die nog op de lijst staat. Het
schrijfpad wordt zo gebouwd dat er later één controle vóór hoeft, niet tien.

## Wat het bewust niet doet

- Geen aanvraagstroom en geen goedkeuring. Dat is Liantis.
- Geen saldo's voor vakantie, ziekte of de andere zes soorten.
- Geen feestdagenkalender. Een feestdag is geen afwezigheid van één technieker.
- Geen koppeling met Liantis, in geen van beide richtingen.

## Waar het de code raakt

- **Nieuw:** migratie voor `technician_absences`, op `bossuyt_staging` én
  `bossuyt_test`.
- **Nieuw:** een route om afwezigheden te lezen en te schrijven, en een plaats
  in de wachtrij van `lib/sync.ts` zodat het offline werkt zoals de rest.
- **`lib/planning/workSchedule.ts`** — `dayCapacityMinutes` krijgt de
  afwezigheid van die dag mee.
- **`lib/planning/daySchedule.ts`** — niets. De motor kent al een kortere dag
  en een dag zonder pauze.
- **`lib/planning/workedTime.ts`** — recupminuten van het saldo af.
- **De dag- en weekweergave** — de afwezigheid tonen, en een hele dag weigeren
  als doelwit.
- **`releaseForgottenWorkOrders`** — het vrijgeven hergebruikt deze regel in
  plaats van er een tweede naast te zetten.

## Nog te beslissen

- **Waar de vrijgegeven bonnen heen gaan**: algemene pool of bij de technieker.
  Met admin te bespreken. Het gebeurtenissenspoor houdt beide open.
- **Het scherm zelf.** Nog niet ontworpen; dat is een visuele stap en krijgt
  zijn eigen routeringsvraag.
- **Meerdere dagen tegelijk zetten.** Een week vakantie of een periode
  economische werkloosheid dag per dag ingeven is werk. Waarschijnlijk nodig,
  maar het model verandert er niet door — het is een schermkwestie.
