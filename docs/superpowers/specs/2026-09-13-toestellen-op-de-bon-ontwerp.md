# Toestellen op de bon

**13 september 2026** — ontwerp, goedgekeurd in gesprek, nog niet gebouwd.

Een servicebon noemt in zijn UNIT-tabel de toestellen waar het bezoek over
gaat. De app leest er vandaag geen enkel van uit, en kan er ook maar één aan
een werkbon hangen. Dit ontwerp verandert allebei.

## Waarom

Op de Trianon-bon (TKT20/12781) staan drie toestellen:

| UNIT N° | OMSCHRIJVING | LEVERDATUM |
|---|---|---|
| U188231 | SALAMANDER TECNO QSET 60/0 MONO | 13/11/17 |
| U188217 | VUUR GICO 8CG7N040D 4BR/INB | 13/11/17 |
| U188238 | VUUR GICO 8CG7N020D 2BR/INB | 13/11/17 |

Na het uploaden stond er geen enkel toestel in de app. De technieker moest ze
met de hand bijmaken, met de papieren bon ernaast — precies het overtikwerk dat
het uploaden moest wegnemen.

Er hangt meer aan vast dan gemak. `device_documents` is gesleuteld op **merk +
model**: schema's, doorsneetekeningen en handleidingen vinden hun toestel via
die twee velden. Een toestel dat nooit is aangemaakt, heeft geen merk en model,
en dus vindt de technieker ter plaatse geen enkel document.

## Wat de gebruiker beslist heeft

Vastgelegd in gesprek, omdat het de vorm van het ontwerp bepaalt:

1. **Er mogen meerdere toestellen aan een bon hangen.** Met een uitdrukkelijk
   voorbehoud: *"ik ben hier geen voorstander van omdat als er onderdelen voor
   verschillende toestellen binnenkomen de opvolging en herstellingen complex
   worden, maar voorlopig is het wel zo."*
2. **Eén verslag per werkbon**, niet per toestel — *"maar rekening houdend dat
   ik later koppeling met toestel wil."*
3. **De bonregel wordt gesplitst in merk en model**, ook al is dat een gok.
   Reden van de gebruiker: *"zo staat er al iets en dit komt voorlopig ook zo
   uit het systeem van NAV, dus beter voorlopig houden."* Er komt later een
   lijstweergave om toestelgegevens na te kijken en te corrigeren.
4. **Typeplaatjes worden de hoofdweg** voor toestelgegevens. Dat is een eigen
   ronde en staat niet in dit ontwerp.

Punt 1 en 2 samen sturen het model: de koppeling moet meervoudig zijn, maar het
verslag blijft voorlopig enkelvoudig — en de bouw mag de latere splitsing niet
in de weg staan.

## Het datamodel

### Nieuw: `work_order_devices`

```
work_order_devices
  work_order_id   → work_orders.id    (cascade bij verwijderen)
  device_id       → devices.id        (restrict)
  position        integer             volgorde zoals op de bon
  primary key (work_order_id, device_id)
```

Dit is *de lijst toestellen waar dit bezoek over gaat*.

### `work_orders.device_id` blijft, met een scherpere betekenis

Niet verwijderd, en ook niet afgeleid: het wordt **het hoofdtoestel** — het
toestel waar het verslag en de onderdelen aan hangen. Dat is vandaag feitelijk
al zo, en de hele werkbon, de onderdelenbestelling en de toestelgeschiedenis
lezen dat veld.

Zo is er geen tweede waarheid: de koppeltabel zegt *welke* toestellen het
bezoek raakt, `device_id` zegt *welk ervan* het verslag draagt. Bij het
aanmaken uit een bon wordt het eerste toestel het hoofdtoestel.

**Waarom dit de latere splitsing niet blokkeert:** wanneer het verslag ooit per
toestel gaat, splitst het langs precies deze koppeltabel — de rijen bestaan dan
al, met hun volgorde, voor elke bon die sindsdien is binnengekomen. Zonder de
tabel zou die geschiedenis onherstelbaar zijn.

### Wat er níet verandert

`devices` hangt aan een **vestiging**, en een vestiging aan een klant. Die
keten blijft; er komt geen rechtstreekse kolom klant→toestel bij. Een toestel
staat fysiek ergens, en dat is de vestiging.

## De UNIT-tabel uitlezen

`lib/werkbon-zones.ts` leest per veld één zone en plakt alle tekstfragmenten
binnen die zone aan elkaar. Voor de drie toestelvelden levert dat één brei in
plaats van drie regels.

De fragmenten dragen hun plaats op de pagina (`x1, y1, x2, y2`, in
millimeters). De toestelrijen liggen op duidelijk gescheiden hoogtes, dus:

- groepeer de fragmenten binnen de toestelzones op **hoogte** — fragmenten
  waarvan het verticale midden binnen een paar millimeter van elkaar ligt,
  horen bij dezelfde rij;
- sorteer de rijen van boven naar onder, en binnen een rij van links naar
  rechts;
- lees per rij `unitNumber`, `deviceDescription`, `deliveryDate` en
  `warrantyUntil` uit hun eigen kolomzone.

Een rij zonder unitnummer én zonder omschrijving is een lege lijn op het
formulier en wordt overgeslagen. Het aantal rijen wordt begrensd (de bon heeft
er vier of vijf; een veel hoger getal betekent dat de groepering mislukt is en
niet dat er twintig toestellen staan).

`ExtractedWerkbon` krijgt er een lijst `devices` bij. De bestaande enkelvoudige
velden blijven staan zolang er code op leunt, gevuld met de eerste rij.

## Merk en model uit de omschrijving

De regels volgen een patroon: `SOORT MERK MODEL…`

```
VUUR       GICO   8CG7N040D 4BR/INB
SALAMANDER TECNO  QSET 60/0 MONO
```

De splitser:

1. herkent het merk uit een **lijst bekende merken** wanneer een van de eerste
   woorden daarin voorkomt — die lijst groeit mee met wat er binnenkomt;
2. valt anders terug op **het tweede woord** als merk en de rest als model;
3. bewaart **altijd de volledige regel** in een eigen veld
   (`devices.source_label`).

Dat derde punt is de kern. De splitsing is een gok — `SALAMANDER TECNO QSET
60/0 MONO` geeft merk `TECNO` en model `QSET 60/0 MONO`, maar het woord
`SALAMANDER` is een toestelsoort en geen deel van het model. Zolang de ruwe
regel bewaard blijft, kan de lijstweergave later corrigeren zonder dat iemand
de papieren bon opnieuw moet opzoeken.

**Gevolg dat de gebruiker moet kennen:** een verkeerd geraden merk betekent dat
`device_documents` niets vindt. Het toestel werkt, de documenten ontbreken. Dat
is het aanvaarde nadeel van "er staat alvast iets".

## Zoeken bij de klant

Vandaag toont de toestelkiezer op de werkbon de toestellen van de **vestiging**
(`GET /api/sites/[id]/devices`). Een klant met twee vestigingen ziet die van de
andere niet.

Nieuw: `GET /api/customers/[id]/devices` — alle toestellen van de klant, over
al zijn vestigingen, **gegroepeerd per vestiging** met de vestiging van deze
bon bovenaan. De kiezer gebruikt die lijst.

Gegroepeerd en niet als één lijst: een toestel staat ergens, en twee identieke
fornuizen op twee adressen zijn niet uitwisselbaar. De groepering maakt zichtbaar
welk toestel je kiest.

## Handleidingen per toesteltype

Hier is niets te bouwen. `device_documents` is uniek op `(brand, model)` — dat
ís het toesteltype. Elk toestel met datzelfde merk en model vindt dezelfde
schema's, doorsneetekeningen en handleidingen.

Wat dit ontwerp eraan toevoegt is dat toestellen voortaan mét merk en model
worden aangemaakt in plaats van helemaal niet.

## Buiten dit ontwerp

- **Typeplaatje fotograferen.** Eigen ronde, eigen uitleeswerk.
- **Onderdelen en verslag per toestel.** Uitdrukkelijk uitgesteld tot de
  gebruiker het in de praktijk gezien heeft. De koppeltabel houdt de deur open.
- **De lijstweergave om toestelgegevens te corrigeren.** Afgesproken als
  volgende ronde, niet deze.

## Testen

De twee stukken die echt fout kunnen gaan zijn pure functies en worden getest
met echte bonregels:

- **de merk/model-splitser** — de drie Trianon-regels, een regel met een
  onbekend merk, een regel van één woord, een lege regel;
- **het groeperen van zone-rijen op hoogte** — drie rijen uit de Trianon-bon,
  een bon met één toestel, een bon met een lege regel ertussen, en fragmenten
  die net buiten de zone vallen.

Voor het samenstellen van de werkbon: een bon met drie toestellen levert drie
rijen in `work_order_devices` met oplopende `position`, en `device_id` wijst
naar de eerste.

## Migratie

Twee handmatige migraties, op **beide** databases (`bossuyt_staging` en
`bossuyt_test`):

1. `work_order_devices` aanmaken.
2. `devices.source_label` toevoegen (`text`, nullable).

Bestaande werkbonnen met een `device_id` krijgen één rij in de koppeltabel, met
`position` 1. Zo leest de nieuwe code één waarheid, ook voor oude bonnen.
