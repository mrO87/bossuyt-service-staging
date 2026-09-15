# Bekende fouten in het inlezen van een geüploade bon

Bijgehouden sinds 15 september 2026. Aanleiding: op de bon van Jan Decan
(TKT20/12776) stonden vier velden verkeerd. Bij nameten bleken er drie van al
opgelost te zijn en bleef er één over.

De opgeslagen extractie van een intake wordt **nooit opnieuw berekend**. Wat er
in `work_order_intakes.extracted` staat, is wat de code kon op de dag van de
upload. Een fout die je daar ziet staan, hoeft vandaag niet meer te bestaan —
en dat was hier precies het geval.

## Open

### De klantnaam blijft leeg wanneer docling het vakje omdraait

**Wat er gebeurt.** `customerName` komt leeg terug op bonnen waar docling het
hele klantvakje tot één fragment smeert in omgekeerde leesvolgorde: eerst de
waarden, dan de opschriften.

Op de Decan-bon:

```
"K04233 Chef Jan Decan NAAM | NOM L KLANT N° CLIENT"
 └─ waarden ──────────┘ └─ opschriften ─────────────┘
```

**Waarom.** `zoneText` zoekt de tekst *ná* het eigen opschrift. Hier staat de
waarde ervóór, dus is er niets na en valt de functie door naar de regel voor
tekst zonder opschriften. Maar `customerName` wordt strikt gelezen
(`readZoneOnly` → `strict = true`), en die regel slaat toe vóór die terugval:

```ts
if (strict && hits.some(hit => hit.field !== field)) return ''
```

Er staat een ander opschrift in het vakje (`KLANT N° CLIENT`), dus geeft hij
niets terug. Het adres liep op 11 september tegen dezelfde muur aan en is toen
opgelost (`65f2662`); de naam is blijven liggen.

**Wat een oplossing zou moeten doen.** Wanneer er niets ná het eigen opschrift
staat maar er wél woorden vóór staan, die woorden nemen — en daaruit de tokens
weglaten die de vorm van een ander veld hebben, want `K04233` staat ernaast en
is een klantnummer, geen naam.

**Waarom nog niet gebouwd.** De gebruiker vult de naam met de hand aan op het
bevestigingsscherm, en dat scherm is er juist voor. Pas oppakken als het vaak
genoeg gebeurt om het handwerk duurder te maken dan de regel.

**Hoe vaak.** Op 15 september 2026: 10 van de 20 ingelezen bonnen hadden een
lege `customerName`. Niet allemaal om deze reden — een gefotografeerde bon
faalt anders dan een PDF uit het ERP.

## Opgelost

### Een datum in het unit-nummer — opgelost 11/09/2026

`unitNumber` nam de kale ticketdatum over die net onder het opschrift
`DATUM TICKET` staat. De zones van beide velden overlappen met opzet, maar
`unitNumber` had geen vorm om op te controleren.

Vier intakes dragen deze fout, allemaal van vóór de fix:

| intake | ingelezen | unit-veld |
|---|---|---|
| `9ceb415c` | 10/09 20:18 | `28/08/26` |
| `d55b284a` | 11/09 05:50 | `10/09/26` |
| `412e62e0` | 11/09 06:23 | `10/09/26` |
| `d3d3c601` | 11/09 06:28 | `10/09/26` |

Commit `65f2662` staat op 11/09 om 06:32 — negen minuten na de laatste foute
upload. Bewaakt door `tests/werkbon-zones.test.ts`, "keeps the visit date out
of the unit number".

### Het adres in het contactveld — opgelost 11/09/2026

`contact` hield de straat en `address` bleef leeg, omdat de straat op deze bon
voorbij het volgende opschrift staat. Zelfde commit, bewaakt door "finds the
street anyway".

## Blijven meten

Deze vraag telt hoeveel opgeslagen extracties een datum als unit-nummer dragen.
Blijft het antwoord vier, dan is er sinds de fix geen enkele bijgekomen:

```sql
select id, created_at::timestamp(0), extracted->>'unitNumber' as unit_veld
from work_order_intakes
where extracted->>'unitNumber' ~ '[0-9]{2}/[0-9]{2}/[0-9]{2}'
order by created_at;
```

En deze telt de lege namen, het punt dat nog open staat:

```sql
select count(*) filter (where coalesce(extracted->>'customerName','') = '') as zonder_naam,
       count(*) as totaal
from work_order_intakes where extracted is not null;
```

## Losse opmerking: testscripts schrijven in deze database

De aanleiding voor dit onderzoek was geen extractiefout maar een concept-werkbon
vol tekst uit `e2e/technician-journey.spec.ts`. Dat script vult het formulier
in om de app te testen; het formulier bewaart automatisch een concept op de
server; en dus bleef verzonnen testtekst staan op een echte bon van een echte
klant. Het concept is op 15/09 verwijderd.

Zolang de e2e-tests tegen `bossuyt_staging` lopen, blijft dit gebeuren. De
`playwright.config.ts` wijst standaard naar `http://localhost:3000` maar
gehoorzaamt `TEST_URL`, en een lokale dev-server tegen de staging-database
telt net zo goed mee.
