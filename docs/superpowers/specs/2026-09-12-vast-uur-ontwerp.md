# Ontwerp — een bon op een uur zetten

Datum: 12 september 2026 · Status: **gebouwd in v1.61**

Uitgewerkt en met de hand getest in een wegwerp-prototype, in negen rondes.
Wat hier staat is wat na die rondes overeind bleef — inclusief drie varianten
die onderweg sneuvelden, zodat niemand ze opnieuw probeert.

---

## 1. De regel

**Slepen zet een uur. Waar je de bon neerzet, daar staat hij.**

Uit dat uur wordt alles teruggerekend: de vertrektijd (uur van de eerste job
min de rijtijd erheen) en de rijtijden tussen de klanten die zo naast elkaar
komen te staan.

Botst een bon met de vorige — dat wil zeggen: hij begint vóór het einde van de
vorige job plus de rit ernaartoe — dan komt er **rode arcering** over precies
dat onmogelijke stuk, met het label `kan niet`. Die blijft staan tot de
gebruiker het oplost. De app schuift **niets** vanzelf op.

Drie manieren om een conflict op te lossen, en de melding noemt ze alle drie:

1. de vorige job inkorten
2. de bon later zetten
3. het vaste uur weghalen

Let op: **inkorten helpt niet altijd.** Ligt het uur vóór het moment waarop je
er überhaupt kunt zijn, dan maakt de rijtijd alleen al het onmogelijk.

## 2. Het speldje

Het speldje bepaalt **niet** hoe de bon zich gedraagt bij het plaatsen. Beide
soorten laten zich even vrij verslepen en geven dezelfde arcering.

Het zegt alleen of het uur een **afspraak** is:

| | uurblokje | wat het betekent |
|---|---|---|
| zonder speldje | **groen** | mag verzet worden als het beter uitkomt |
| met speldje | **rood** + stippellijn | met de klant afgesproken |

Het uurblokje staat links op elk blok, altijd — ook bij een berekend uur.

**Verduidelijkt bij het bouwen (13 september).** De tabel verwees eerst naar
"kortste volgorde", een knop uit het prototype die de goedkoopste route
voorstelt. Dat gaf de indruk dat het speldje een grendel is die iets tegenhoudt.
Dat is het niet, en die knop bestaat ook niet in de app. Het speldje beschermt
niets: het **meldt** dat dit uur beloofd is. Dat is een bericht aan de volgende
persoon die deze planning openslaat, en niet aan een algoritme — de app beslist
niet welke afspraken er gemaakt worden, en grendelt ze dus ook niet.

## 3. Rijtijden hangen af van de klanten, niet van de positie

Elke rit wordt opgezocht tussen de twee klanten die op dat moment na elkaar
komen. Zonder dat valt efficiëntie niet te testen: de volgorde wijzigen kostte
anders altijd hetzelfde.

Een bevinding uit het prototype die tegen de intuïtie ingaat: bij een rondrit
telt alleen wélke twee ritten de verre klant raken. Lokeren **eerst** rijden was
het goedkoopst (2u10), laatst het duurst (2u16) — en de spreiding was maar zes
minuten. Bij drie stops maakt de volgorde minder uit dan het voelt.

## 4. Wat sneuvelde, en waarom

| variant | waarom niet |
|---|---|
| Een bon zonder speldje schuift vanzelf op tot hij past | Bedoeld als hulp; in de praktijk wordt elke bon naar de vorige toe gezogen en lijkt alles aan elkaar te hangen. Je zet iets neer en het glijdt weg onder je vinger. |
| Slepen verandert alleen de volgorde, niet het uur | Dan valt er niets te herrekenen: vertrektijd en rijtijden blijven staan. Voelt alsof slepen stuk is. |
| Wachttijd tonen als vak met een getal | Een getal op het scherm wordt een claim. *"Er stond 45 min wachten in mijn planning"* — en we kennen de echte duur van een job niet. Het gat blijft nu lege ruimte. |

## 5. Prestatie — niet vrijblijvend

De eerste versie bouwde bij elke vingerbeweging de hele kalender opnieuw op met
`innerHTML`. Op een telefoon liep dat meteen vast. De werkende aanpak:

- de kalender **één keer** opbouwen, daarna alleen bestaande knopen verplaatsen
- verplaatsen met `transform` op elementen met `top:0`, niet met `top`
- elke vingerbeweging samenvouwen in één `requestAnimationFrame`
- de hoogte van de kalender **één keer** meten bij het aanraken, niet per beweging

## 6. Wat dit kost in de echte app

**Een opgeslagen veld.** Dit is de eerste keer dat de app een uur *onthoudt* in
plaats van het te berekenen. Het ontwerp van de weekplanning voorzag dit al:
*"Het model laat dit later toe via één extra veld."*

Gevolgen om over na te denken vóór er iets gebouwd wordt:

- **Offline.** Een vastgezet uur is een schrijfbeweging zoals elke andere en
  moet door dezelfde wachtrij.
- **Rollen.** Mag een technieker zijn eigen uren vastzetten, of is dat planning?
  Dit raakt de rolgrendel die al in de naden ligt.
- **De Gantt.** Een vastgezet uur is per technieker; `computeDaySchedule` moet
  het als invoer krijgen, niet als toestand.
- **Uitrekken wijzigt `estimatedMinutes`** — dat veld bestaat al, dus daar is
  geen schemawijziging voor nodig.

---

## 7. Beslist bij het bouwen (12 september 2026)

| vraag | keuze |
|---|---|
| Is 15 minuten de juiste stap? | **15.** Op 54 px/uur is dat ~13 px — met een duim te raken. Vijf werd afgewogen en niet gekozen: nog geen 5 px per stap, dan wordt mikken trillen. `SNAP_MINUTES` in `lib/planning/pinnedHour.ts`. |
| Conflict weigeren of tonen? | **Alleen tonen.** Het uur wordt bewaard zoals elke andere schrijfactie. Weigeren zou een technieker zonder bereik pas uren later te horen krijgen dat zijn wijziging geweigerd is, en de wachtrij zou vastlopen achter een schrijfactie die nooit kan slagen. |
| Wat bij een dagwissel? | **Alles wist.** Naar een andere dag of naar de pool: het uur en het speldje gaan weg, het uur wordt weer berekend. Negen uur op dinsdag is niet negen uur op woensdag — de rit ernaartoe vertrekt van een andere plaats in een andere dag. Staat in `savePlanningSnapshot`, niet alleen in het scherm, zodat geen enkele weg eromheen loopt. |

### Wat er gebouwd is

- `work_orders.planned_start_minutes` + `start_is_appointment` — migratie in
  `scripts/migrations/2026-09-12-pinned-hour.sql`, met de hand toegepast op
  `bossuyt_staging` en `bossuyt_test`
- `computeDaySchedule` neemt een uur als invoer en geeft `conflicts` terug
- `lib/planning/pinnedHour.ts` — de stap, wat een geldig uur is, de volgorde
  die het uur volgt, en de tekst van de melding
- `resolveWeekDrop` kent een vierde uitkomst: `set_hour`
- Weekweergave: verticaal slepen, speldje, kruisje, arcering, melding

### Wat er bewust niet in zit

- **De dagweergave toont het uur, maar niet de botsing.** Ze rekent met
  dezelfde motor en dus met hetzelfde uur, maar heeft geen tijdas om arcering
  op te tekenen. Een onmogelijk uur is daar alleen te zien aan twee kaarten met
  overlappende uren. De melding staat in de weekweergave.
- **Rollen.** De vraag uit sectie 6 — mag een technieker zijn eigen uren
  vastzetten — is niet beantwoord en niet gegrendeld: vandaag mag iedereen het,
  net als bij elke andere planningswijziging. `plannedByRole` wordt geschreven,
  dus de grendel wordt later één `if` op één plek.
- **Uitrekken om `estimatedMinutes` te wijzigen.** Dat kan al via de duur op de
  kaart (`EstimateBadge`, v1.58). Een tweede gebaar op een blok van 62 px erbij
  is niet gebouwd.
