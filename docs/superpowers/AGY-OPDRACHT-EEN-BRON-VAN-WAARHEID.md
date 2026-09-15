# Aan Agy — audit: één bron van waarheid

**Van:** Olivier · 15 september 2026
**Opdracht van:** de product owner
**Wat je oplevert:** een rapport. Geen code, geen migraties, geen wijzigingen.

---

## De vraag

Elk gegeven in deze app mag op **één** plaats wonen. De webapp is een
weergave, niet een tweede administratie. Wat de dagplanning toont en wat de
weekplanning toont moet uit dezelfde bron komen — en de kaartweergave die
eraan komt, met verschuifbare dagen, moet uit diezelfde bron lezen én ernaar
schrijven. Locatiegegevens net zo.

Zoek uit waar dat vandaag níét zo is.

## De maatstaf, en waarom ze streng is

Je vorige audit (`TECHNICIAN-AUDIT-LEDGER-ADVICE.md`) bevatte goede
bevindingen, maar vier ervan waren op het moment van schrijven al opgelost.
Eén voorbeeld, omdat het precies laat zien wat we willen vermijden: het
rapport meldde dat de ticketdatum in het unit-nummer terechtkwam. Dat klopte
letterlijk — die waarde stond in de database. Maar ze was ingelezen op
11 september om 06:23, en de fix was gecommit om 06:32. Negen minuten later.
Een opgeslagen extractie wordt nooit herberekend, dus wat je in de database
ziet is wat de code kon op de dag van de upload — niet wat ze vandaag doet.

**Daarom deze regel: elke bevinding draagt bewijs dat de twee bronnen het
vandaag oneens zijn.** Een query met een rij-id erbij, of een meting op de
draaiende app. "Dit kan uiteenlopen" is een hypothese; "dit ís uiteengelopen,
bij deze bon, met deze twee waarden" is een bevinding.

Vind je een dubbele bron die aantoonbaar nooit uiteenloopt, meld hem dan
gerust — maar zet er dan bij dat het om een risico gaat en niet om een fout.

## Het onderscheid dat het rapport bruikbaar maakt

Niet elke herhaling is een tweede waarheid. Onderscheid drie soorten:

1. **Twee bronnen.** Twee plaatsen die allebei beweren wat waar is, allebei
   beschreven kunnen worden, en uit elkaar kunnen lopen. Dit is wat we zoeken.
2. **Een bron plus een afgeleide.** Eén plaats is de waarheid, de andere wordt
   eruit opnieuw opgebouwd en nooit los beschreven. Een cache is dit. Prima —
   tenzij je aantoont dat de afgeleide ook los beschreven wordt.
3. **Twee verschillende feiten die op elkaar lijken.** De geraamde duur en de
   werkelijk gewerkte duur zijn niet dezelfde vraag. Die mogen naast elkaar
   staan.

Een rapport dat die drie op één hoop gooit, kost meer tijd dan het oplevert.

## Waar je moet kijken

**De database.** Elke kolom die hetzelfde feit een tweede keer kan dragen.
Schrijf per geval de query die vraagt of ze het oneens zijn, en draai hem.

**De code.** Elke waarde die op meer dan één plaats berekend wordt. Dit is
geen theorie: op 15 september toonden de dag- en weekplanning een ander uur
voor dezelfde bon omdat twee bestanden dezelfde motor met andere invoer
voedden. Zoek naar dat patroon.

**De weergaven.** Dagplanning, weekplanning, en straks de kaart. Toon aan dat
ze door dezelfde functie gaan — niet dat ze toevallig hetzelfde tonen op de
gegevens van vandaag.

**Het schrijfpad.** Een gegeven met één bron maar twee schrijfwegen is even
erg. Kijk naar `/api/sync/write`, de wachtrij in IndexedDB (`lib/idb.ts`,
`lib/sync.ts`) en de losse API-routes.

## Sporen om na te trekken

Deze komen uit het werk van 13 tot 15 september. Ze zijn **niet** geverifieerd
als fout — behandel ze als vermoedens, en spreek ze gerust tegen.

| vermoeden | waar te kijken |
|---|---|
| De volgorde van een dag staat in `work_order_assignments.planned_order` én wordt uit de klok herberekend door `orderDayByClock` | database toonde 3, scherm toonde 2 op 15/09 |
| Wie de bon draagt: `werkbonnen.technician_id`, `werkbonnen.technician_ids`, en `work_order_assignments` | drie plaatsen voor dezelfde vraag |
| De onderdelen van een opvolgbon: `work_orders.prefill_parts` én de payload van de `pick_parts`/`load_parts`-taken | `follow-up/route.ts` |
| Het adres: op `customers` én op `sites` | welke wint bij verschil? |
| Wat de upload las (`work_order_intakes.extracted`) naast wat ervan in de werkbon terechtkwam | wordt nooit herberekend |
| De duur: `work_orders.estimated_minutes` naast aankomst/vertrek op de werkbon | mogelijk categorie 3 hierboven |
| De dagklok (`technician_days`) naast de uren op de werkbon | beide zeggen iets over wanneer er gewerkt is |

## Wat je oplevert

Eén document, per bevinding:

- **Het feit.** Wat is het gegeven, in gewone taal.
- **De plaatsen.** Elke kolom, elk bestand, elke route die het draagt.
- **Het bewijs.** De query of de meting die aantoont dat ze het oneens zijn,
  met de uitkomst en een rij-id. Of, als ze het eens zijn: dat je gezocht hebt
  en niets gevonden.
- **Wie schrijft.** Welke wegen deze waarde kunnen veranderen.
- **Het gevolg.** Wat een gebruiker merkt als ze uiteenlopen.
- **Voorstel.** Samenvoegen, of bewust dubbel houden met de reden erbij.

Rangschik op wat **vandaag aantoonbaar fout staat**, daarna op risico. Niet op
hoe interessant het is.

## Wat je niet doet

- **Geen wijzigingen.** Geen code, geen migraties, geen opruiming. Alleen het
  rapport.
- **Niet schrijven in `bossuyt_staging`.** Daar staat de echte planning van de
  zaak in. Lezen mag; schrijven niet.
- **Tests draaien tegen `bossuyt_test`.** Zie
  `docs/superpowers/AGY-BRIEF-TESTDATABANK.md`. De Playwright-config weigert
  sinds 15/09 uit zichzelf te starten tegen staging, dus dat kan niet meer per
  ongeluk — maar een handmatige `curl` of `psql` kan dat wel.
- **Geen oplossingen bouwen.** De product owner beslist eerst wat er
  samengevoegd wordt.

## Wat je nodig hebt

- **Code:** `/mnt/data/bossuyt_service_next_staging`, branch
  `feature/service-bon-v1.53`.
- **Draaiende app:** `https://staging.bossuyt.fixassistant.com` (v1.72).
- **Databases:** één PostgreSQL-container, twee databases — `bossuyt_staging`
  (lezen) en `bossuyt_test` (vrij). Host `172.20.0.3:5432`, gebruiker
  `bossuyt`. Het wachtwoord staat in `.env.staging.local`; vraag het aan
  Olivier.
- **Waar de waarheid nu verondersteld wordt te wonen:**
  `ARCHITECTURE.md`, en `OVERDRACHT.md` voor wat er onderweg geleerd is.
  Let op: `OVERDRACHT.md` loopt achter — hij beschrijft v1.59 terwijl v1.72
  draait.

## Eén waarschuwing over de bron van je bewijs

De database bevat sporen van tests, ook van de mijne. Bonnen `i1`–`i25` zijn
mockdata (`visible_in_pool = false`). Er staan twee afgewerkte werkbonnen met
een datum en nul toewijzingen, uit 8 september. En er staan veertien
verweesde uploads. Die zijn geen bewijs van een dubbele bron — ze zijn
rommel. Kijk naar `created_at` en `created_by` voor je iets als bewijs
gebruikt.
