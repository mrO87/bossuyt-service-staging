# Volgende sessie — werkbon uploaden (foto of PDF) naar de open pool

Plak dit als eerste bericht in een verse sessie. Alles wat je nodig hebt staat
hieronder; je hoeft de vorige sessie niet te kennen.

---

## Waar we staan

**Repo:** `/mnt/data/bossuyt_service_next_staging`, branch
`feature/service-bon-v1.53`, laatste commit `7a27647`, gepusht naar
`mrO87/bossuyt-service-staging`.

**Live:** v1.53.2 op https://staging.bossuyt.fixassistant.com. Dat is de enige
deploy-target. Raak de `production` branch nooit aan, en deploy nooit naar
`bossuyt-service.fixassistant.com` of `service.bossuyt.fixassistant.com` — dat
zijn oude demo's.

**Net af, nog niet gedeployed:** commit `e486dc6` geeft stock-aanvullingen een
eigen taaktype (`replenish_stock`), zodat een onderdeel dat de technieker uit
de bus haalt niet meer als bestelling naar de ERP gaat. 102 tests groen, `npx
tsc --noEmit` en `npm run lint` schoon. Dit moet nog mee in de volgende deploy.

**Loopt parallel:** `docs/superpowers/AGY-BRIEF-LOGIC-v1.53.2.md` is een
review-opdracht voor Agy die zoekt naar logische fouten (code die klopt maar
verkeerd is over het vak). Zijn bevindingen komen later terug; hou daar
rekening mee bij grote refactors in dezelfde bestanden.

---

## De opdracht

Een werkorder kan vandaag alleen met de hand aangemaakt worden via de wizard op
`/werkbon/nieuw`. Bossuyt krijgt echter regelmatig een werkbon binnen op papier
of als PDF — bijvoorbeeld die van Molenhoeve. Die moet je kunnen **uploaden als
foto of PDF**, waarna de velden eruit gelezen worden en de werkorder in de
**open pool** komt te staan, zodat een technieker hem kan oppakken.

### Beslissingen die al genomen zijn

**Extractie gebeurt met OCR, zonder AI-model.** Geen vision-LLM, geen externe
AI-API.

**De velden staan op vergelijkbare plaatsen** op de bonnen die binnenkomen.
Bouw de extractie daarom **zone-gebaseerd**: leg per veld een vak vast op de
genormaliseerde pagina, knip dat vak uit en laat OCR alleen daarop los. Dat is
betrouwbaarder dan de hele pagina lezen en achteraf labels zoeken, want je
hoeft niet te raden welk herkend woord bij welk veld hoort, en een fout in het
ene vak kan het andere niet vervuilen.

De vakposities kun je afleiden uit `lib/pdf.ts`. Daar staat de Service Bon al
uitgemeten in millimeters op A4, met constanten als `ML`, `MR`, `SPLIT`,
`HB_TOP` en `HB_BOTTOM`. Dat is dezelfde layout als het papier, dus dat is je
vertrekpunt voor de zones. Meet niet opnieuw wat daar al staat.

**Wat je wél moet oplossen: een foto is geen scan.** Zones werken pas als de
pagina eerst genormaliseerd is. Verwacht scheve hoeken, perspectief omdat de
telefoon niet loodrecht boven het blad hangt, schaduw en een randje bureau in
beeld. Er moet dus een stap vóór de OCR die de bon in de foto vindt, rechttrekt
en bijsnijdt tot de vier hoeken van het blad. Voor een PDF valt die stap weg.
Als die stap faalt, moet dat gemeld worden in plaats van dat de zones op de
verkeerde plek gaan lezen.

**Per veld één zone, plus een terugvaloptie.** Komt een vak leeg terug, zoek
dan in de rest van de herkende tekst naar het bijbehorende label ("klant",
"ticket", "datum", "toestel", "serienummer") en neem wat erachter staat. Zo
levert een bon met een iets afwijkende indeling nog steeds iets op in plaats
van niets.

**Er blijft een bevestigingsstap.** OCR haalt cijfers en letters door elkaar,
en juist bij een klantnummer als `K04647` is dat stil en duur. Een mens ziet de
voorgestelde velden naast de geüploade afbeelding en corrigeert voordat de
werkorder de pool in gaat.

---

## Wat er al is en hergebruikt moet worden

**De pool bestaat al.** `work_orders.visible_in_pool` (boolean, default true)
plus `source = 'reactive'` bepaalt wat er in de pool verschijnt. Zie
`lib/server/interventions.ts` rond regel 300 en
`app/api/work-orders/[id]/pool-visibility/route.ts`. Je hoeft geen nieuwe pool
te bouwen — een geüploade werkorder moet gewoon een gewone werkorder worden.

**Aanmaken van een werkorder bestaat al.** `lib/server/work-orders.ts` bevat
`parseCreateWorkOrderBody`, `createWorkOrder` en `handleCreateWorkOrderRequest`.
Die doen klant/site/toestel opzoeken of aanmaken, dubbele ticketnummers
afvangen (409), en zetten `visibleInPool: true`. De upload-flow moet daar
naartoe leiden, niet ernaast.

Let op twee regels die daar hard in zitten:
- Een meegestuurde `id` is leidend — die heeft iemand uit een lijst gekozen.
- Een ontbrekend veld betekent "niet wijzigen", niet "leegmaken".

**De wizard bestaat al.** `app/werkbon/nieuw/page.tsx` met de formulieren in
`components/NewWorkOrder/`. De bevestigingsstap na de OCR hoort waarschijnlijk
dezelfde velden en dezelfde validatie te gebruiken.

**Fotos uploaden bestaat al.** Er is een `work_order_photos`-mechanisme met
IndexedDB-drafts (`WorkOrderPhotoDraft` in `types/index.ts`). Kijk of de
opslag van het geüploade bestand daarop kan meeliften.

**De bonlayout is al uitgemeten.** `lib/pdf.ts` tekent de Service Bon op A4 in
millimeters, met de kaders en kolommen als constanten bovenaan het bestand.
Daar haal je de zones uit.

**Er draait een docling-container op de host**, `127.0.0.1:5001`
(`ghcr.io/docling-project/docling-serve-cpu`). Dat is een lokale
documentconversie-service die PDF en afbeeldingen naar gestructureerde tekst
omzet, zonder externe API. Nuttig voor de terugvaloptie en voor PDF's die al
tekst bevatten, waar helemaal geen OCR bij komt kijken. Voor de zones zelf heb
je iets nodig dat een uitgeknipt vak leest. Let op: de Next-app draait zelf in
Docker, dus de netwerkroute naar poort 5001 moet je nakijken voor je erop
bouwt.

---

## Projectregels die gelden

- **UI-taal Nederlands (nl-BE). Code, commentaar en variabelen in het Engels.**
- **Mobile-first.** De technieker gebruikt dit op een telefoon, in een
  machinekamer, soms met handschoenen aan. Grote knoppen, veel contrast.
- **Offline-first.** Elke schrijfactie gaat eerst naar IndexedDB, dan naar de
  API. Herhaalde verzending mag niets dubbel aanmaken — gebruik `client_id`.
- **Leermodus staat altijd aan.** De gebruiker leert programmeren. Leg vóór
  elke functie uit wat ze gaat doen, en erna wat elke regel doet en waarom.
  Bij een functie die op een vorige lijkt: zeg wat het verschil is, herhaal de
  hele uitleg niet.
- **Versies verhoog je nooit zelf.** Vraag bij zichtbare wijzigingen op staging
  eerst of het een nieuwe versie is of een verfijning van de huidige.
- **Tests draaien met `npm test`** tegen een echte Postgres. `.env.test` moet
  naar `bossuyt_test` wijzen, **nooit** naar `bossuyt_staging` — de
  opruimroutine doet ongekwalificeerde DELETEs.

**Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4,
Drizzle ORM op PostgreSQL 16 (`drizzle-kit push`, geen migratiebestanden), idb
voor IndexedDB, jsPDF voor de bon, vitest. Docker + Traefik op Hetzner.

---

## Hoe ik wil dat je begint

1. Lees `ARCHITECTURE.md` en `CLAUDE.md`.
2. Bekijk `lib/server/work-orders.ts`, `app/werkbon/nieuw/page.tsx`,
   `lib/server/interventions.ts` en `lib/idb.ts` voor je iets voorstelt.
3. Lees de layoutconstanten bovenaan `lib/pdf.ts` en bepaal welke velden je uit
   welk vak gaat halen. Vraag mij om de bon van Molenhoeve en leg jouw zones
   daar naast, zodat we zien of ze inderdaad op vergelijkbare plaatsen staan.
4. Zoek uit welke OCR je gebruikt en of docling op `127.0.0.1:5001` bereikbaar
   is vanuit de app-container.
5. Kom dan met een ontwerp in secties: waar het bestand landt, hoe een foto
   rechtgetrokken wordt, welke zones er zijn, hoe de bevestigingsstap eruitziet,
   en wat er gebeurt als het rechttrekken of een zone faalt.
6. Wacht op akkoord voor je code schrijft.

Het voorbeeld om tegen te testen is de werkbon van Molenhoeve. Vraag mij om dat
bestand als je het nodig hebt.
