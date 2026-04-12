export type ChangeLabel = 'Nieuw' | 'Verbeterd' | 'Fix'

export type ReleaseChange = {
  label: ChangeLabel
  title: string
  body: string
}

export type ReleaseEntry = {
  version: string
  date: string
  changes: ReleaseChange[]
}

// Maintainers: every visible staging release must update this file; the badge and /changenotes are expected to stay aligned with it.
export const RELEASES: ReleaseEntry[] = [
  {
    version: 'v1.12',
    date: '12 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Volledige auditlog op de database',
        body:
          'Elke INSERT, UPDATE en DELETE op alle tabellen (werkorders, klanten, sites, ' +
          'toestellen, techniekers, toewijzingen, documenten) wordt automatisch gelogd ' +
          'via PostgreSQL-triggers. De auditlog bevat de volledige oude en nieuwe rij ' +
          'als JSON, tijdstip en wie de wijziging maakte.',
      },
      {
        label: 'Nieuw',
        title: 'Werkbon slaat start- en eindtijd op in de database',
        body:
          'Naast de omschrijving en onderdelen worden nu ook werkStart en werkEinde ' +
          'als tijdstempel opgeslagen bij het afwerken van een werkbon. ' +
          'Zo is de volledige tijdregistratie traceerbaar per job.',
      },
      {
        label: 'Verbeterd',
        title: 'Auditlog weet wie een wijziging maakte',
        body:
          'De API-routes stellen een sessievariabele in (app.current_user) voor elke ' +
          'databasetransactie. De trigger leest deze variabele en slaat het technician-id ' +
          'of "admin" op in de log — zonder dat de logtabel zelf aangepast hoeft te worden.',
      },
    ],
  },
  {
    version: 'v1.11',
    date: '12 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Toestelkaart met documenten en historiek op de werkbon',
        body:
          'Op elke werkbon staat nu een inklapbare toestelkaart met merk, model, serienummer ' +
          'en installatiedatum. Daaronder staan vier iconen: elektrisch schema, onderdelenlijst, ' +
          'servicehandleiding en historiek. De drie documenten zijn gekoppeld aan het toesteltype ' +
          '(brand + model), de historiek aan het serienummer.',
      },
      {
        label: 'Nieuw',
        title: 'Interventiegeschiedenis per toestel',
        body:
          'Het historiekicoon toont een badge met het aantal eerdere afgewerkte jobs voor dat ' +
          'specifieke toestel. Klik erop om de lijst uit te klappen met datum, type en melding ' +
          'van elke vorige interventie. De huidige job wordt automatisch uitgesloten.',
      },
      {
        label: 'Nieuw',
        title: 'API voor toesteldocumenten en toestelhistoriek',
        body:
          'Twee nieuwe API-routes: GET /api/devices/documents haalt de 3 bestandspaden op per ' +
          'brand+model, POST /api/devices/documents uploadt een PDF. GET /api/devices/[id]/history ' +
          'geeft de afgewerkte werkorders terug voor een specifiek toestel.',
      },
      {
        label: 'Verbeterd',
        title: 'Rijkere stagingdata met historisch toestel en extra open-pooljobs',
        body:
          'Winterhalter PT-L (Rustoord Ennea) heeft nu 3 historische jobs en staat vandaag ' +
          'opnieuw ingepland als dringende storing. De open pool bevat 2 extra jobs: ' +
          'Electrolux SkyLine Pro 20GN (WZC Helianthus) en Rational iCombi Pro 6-1/1 ' +
          '(Hotel Scheldezicht).',
      },
    ],
  },
  {
    version: 'v1.10',
    date: '11 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Rijkere staging-database met ongeveer 15 klanten',
        body:
          'De staging database bevat nu een veel grotere en realistischer dataset, ' +
          'met extra klanten, sites en toestellen. Daardoor kunnen we de volgende ' +
          'versies testen op meerdere toestellen per klant zonder eerst opnieuw ' +
          'basisdata te moeten uitvinden.',
      },
      {
        label: 'Verbeterd',
        title: 'Bestaande planningsklanten kregen veel meer toestellen',
        body:
          'De klanten die vandaag al in de planning zitten zijn bewust het sterkst ' +
          'uitgebreid. Dat maakt het mogelijk om in de volgende versie extra ' +
          'opdrachten op dezelfde site voor een ander toestel te simuleren.',
      },
      {
        label: 'Verbeterd',
        title: 'Historische dummy werkorders in de database',
        body:
          'Voor de belangrijkste bestaande klanten en toestellen zijn oudere ' +
          'afgewerkte werkorders toegevoegd in de database. Die zijn nog niet in ' +
          'de huidige UI zichtbaar, maar vormen wel het fundament voor de ' +
          'toestelgeschiedenis die we in de volgende versie willen tonen.',
      },
    ],
  },
  {
    version: 'v1.9',
    date: '11 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Eerste gedeelde PostgreSQL-dataslice',
        body:
          'De service-app heeft nu een echte serverdatalaag met PostgreSQL + Drizzle ' +
          'voor techniekers, klanten, sites, toestellen, werkorders en toewijzingen. ' +
          'De mock-structuur is vertaald naar relationele tabellen zodat staging niet ' +
          'meer alleen op losse demo-arrays hoeft te draaien.',
      },
      {
        label: 'Nieuw',
        title: 'Ochtendsync leest echte dagplanning via API',
        body:
          'De ontbrekende route `GET /api/sync/today` is toegevoegd. Die levert nu ' +
          'geplande jobs en open pool-items uit de serverlaag, met dezelfde cap van ' +
          'max. 6 geplande en 4 open interventies voor offline gebruik.',
      },
      {
        label: 'Verbeterd',
        title: 'Dagoverzicht leest uit cache en sync in plaats van directe mock-data',
        body:
          'Het homescreen haalt de planning nu eerst uit IndexedDB en synchroniseert ' +
          'vervolgens met de server als de dag nog niet vers is. Daardoor krijgt de ' +
          'offline flow eindelijk een echte read-path in plaats van vaste mock imports.',
      },
      {
        label: 'Verbeterd',
        title: 'Interventiedetail heeft serverfallback',
        body:
          'De werkbonpagina zoekt een interventie eerst lokaal in de offline cache ' +
          'en valt daarna terug op een echte API-route per interventie. Rechtstreekse ' +
          'navigatie naar een job hangt daardoor niet meer af van `lib/mock-data.ts`.',
      },
      {
        label: 'Verbeterd',
        title: 'DB tooling splitst host- en Docker-verbindingen',
        body:
          'De Docker-envs zijn opgesplitst zodat de app-container `db` gebruikt en ' +
          'host-tools zoals Drizzle/seed lokaal via `localhost` kunnen werken. Dat ' +
          'maakt `db:push` en `db:seed` voorspelbaar zodra de target Postgres draait.',
      },
    ],
  },
  {
    version: 'v1.8',
    date: '11 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Adres typen als vertrek- of eindpunt',
        body:
          'Je kan nu een vrij adres intypen als start- of eindlocatie van je route. ' +
          'Het systeem zoekt automatisch de GPS-coördinaten op via Nominatim ' +
          '(OpenStreetMap) — geen vaste lijst meer nodig.',
      },
      {
        label: 'Verbeterd',
        title: 'Route herberekent automatisch',
        body:
          'Bij elke wijziging (ander adres, volgorde, pauze verplaatst) wordt de ' +
          'route automatisch opnieuw berekend. Een debounce van 350 ms zorgt dat ' +
          'het niet bij elke toetsaanslag vuurt.',
      },
      {
        label: 'Verbeterd',
        title: 'Nauwkeurigere GPS-locatie bij pauze',
        body:
          'De app wacht nu op een nauwkeurige GPS-fix (< 50 m) in plaats van de ' +
          'eerste beschikbare schatting. Je ziet de nauwkeurigheid live aftellen ' +
          '(bv. "±120 m → ±18 m") terwijl de GPS verbeert. Na 20 seconden toont ' +
          'de app de best beschikbare positie.',
      },
      {
        label: 'Verbeterd',
        title: 'Tijdregistratie vereenvoudigd',
        body:
          '"Aankomst" is verwijderd. De eerste knop heet nu "Start werk" en zet ' +
          'de status meteen op Bezig. Na registratie kan je de tijd nog aanpassen ' +
          'door erop te tikken — de native tijd-picker opent.',
      },
      {
        label: 'Verbeterd',
        title: 'Opvolgacties overzichtelijker',
        body:
          '3 prioriteitsniveaus in plaats van 4: Laag, Gemiddeld en Hoog. ' +
          'De knoppen staan als een segmented control boven het datumveld, ' +
          'dat kleiner en rechts uitlijnt voor een nettere look.',
      },
    ],
  },
  {
    version: 'v1.7',
    date: '10 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Echte rijtijden via OpenRouteService',
        body:
          'De route-timeline toont nu echte rijtijden en afstanden berekend ' +
          'via OpenRouteService. De dag wordt live herberekend na elke ' +
          'drag & drop. Zonder API key valt het systeem terug op mock-waarden.',
      },
      {
        label: 'Nieuw',
        title: 'GPS-coördinaten op alle locaties',
        body:
          'Elke site heeft nu lat/lon coördinaten (via Nominatim/OpenStreetMap). ' +
          'Het depot, klanten en nieuwe locaties zijn correct gepositioneerd ' +
          'in Oost-Vlaanderen.',
      },
      {
        label: 'Nieuw',
        title: 'Nominatim geocoder voor adres → coördinaten',
        body:
          'Nieuwe adressen kunnen automatisch omgezet worden naar GPS-coördinaten ' +
          'via de gratis Nominatim API (OpenStreetMap). Geen API key nodig.',
      },
      {
        label: 'Nieuw',
        title: 'Meer realistische demo-klanten',
        body:
          "Twee nieuwe klanten toegevoegd: Frituur 't Pleintje (Lokeren) en " +
          'Brasserie De Klok (Dendermonde). De dag bevat nu 6 geplande jobs ' +
          'met een route van ~148 km door Oost-Vlaanderen.',
      },
      {
        label: 'Verbeterd',
        title: 'Pauze geeft 0 reistijd',
        body:
          'De middagpauze wordt niet meer als verplaatsing geteld. Reistijd ' +
          'gaat van de job vóór de pauze naar de job erna — je blijft ter plaatse.',
      },
    ],
  },
  {
    version: 'v1.6',
    date: '9 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Route-timeline op het dagoverzicht',
        body:
          'De Planning-sectie is geen lijst meer maar een verticale route: ' +
          'Start → rijtijd → job → rijtijd → job → pauze → rijtijd → job → einde. ' +
          'Elke rijtijd wordt apart getoond, zodat je meteen ziet hoe je dag eruitziet.',
      },
      {
        label: 'Nieuw',
        title: 'Instelbare start- en eind-adres',
        body:
          'Bovenaan de timeline kan je je vertrekpunt kiezen. Met één vinkje ' +
          'zeg je "einde = start" als je terug naar het depot rijdt, of je ' +
          'kiest een ander eindadres (bv. je thuis).',
      },
      {
        label: 'Nieuw',
        title: 'Middagpauze als verplaatsbaar blok',
        body:
          'Er staat automatisch een pauze van 30 minuten middenin de dag. ' +
          'Sleep hem naar boven of beneden om hem op een andere plaats in je ' +
          'route te zetten.',
      },
      {
        label: 'Nieuw',
        title: 'Dagsamenvatting bovenaan',
        body:
          'Je ziet in één oogopslag hoeveel jobs je hebt, hoeveel werkuren er ' +
          'staan en hoeveel je in totaal zal moeten rijden. De cijfers worden ' +
          'live herberekend bij elke drag & drop.',
      },
      {
        label: 'Verbeterd',
        title: 'Scrollen + slepen samen',
        body:
          'Scrollen op mobiel werkt weer vlot. Slepen start alleen vanaf de ' +
          '⋮⋮ handle aan de linkerkant van een kaart, met een korte hold van ' +
          '250 ms zodat een snelle scroll nooit per ongeluk een drag wordt.',
      },
    ],
  },
  {
    version: 'v1.5',
    date: '9 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Planning / Open pool op het dagoverzicht',
        body:
          'De dag is nu opgesplitst in twee lijsten: "Planning" (door de dispatcher ' +
          'ingepland, in volgorde) en "Open pool" (flexibele jobs die je zelf kan ' +
          'oppikken als je tijd over hebt).',
      },
      {
        label: 'Nieuw',
        title: 'Drag & drop op je planning',
        body:
          'Sleep een geplande job via de handle links om de volgorde aan te passen ' +
          'aan je route. De nieuwe volgorde wordt later ook naar de server ' +
          'gesynchroniseerd zodat de dispatcher ziet hoe je de dag afwerkt.',
      },
      {
        label: 'Nieuw',
        title: 'Versie-badge rechtsonder',
        body:
          'Onderaan rechts zie je nu welke versie actief is. Op staging staat er ' +
          '"STAGING · v1.5" in oranje, op productie enkel het versienummer. Zo weet ' +
          'je altijd op welke omgeving je zit.',
      },
      {
        label: 'Verbeterd',
        title: 'Meer demo-jobs',
        body:
          'Het dagoverzicht toont nu 4 geplande jobs + 2 jobs in de open pool, ' +
          'zodat je de nieuwe layout en drag & drop kan testen.',
      },
    ],
  },
  {
    version: 'v1.4',
    date: '8 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Offline-cache voor interventies',
        body:
          'Interventies worden nu in IndexedDB bewaard (4 stores: interventions, ' +
          'werkbonnen, pendingWrites, dayMeta). Acties die je offline doet worden ' +
          'in een pending-queue gezet en automatisch verstuurd zodra je terug ' +
          'online bent.',
      },
      {
        label: 'Nieuw',
        title: 'Rijtijden via routing-service',
        body:
          'Een provider-agnostische routing-laag (IRoutingService) haalt rijtijden ' +
          'en afstanden op. Fase 1 gebruikt OpenRouteService (gratis); fase 2 zal ' +
          'TomTom gebruiken voor file-bewuste rijtijden — de business-logic ' +
          'verandert niet mee.',
      },
    ],
  },
]

const CURRENT_RELEASE_VERSION = 'v1.12'

const currentRelease = RELEASES.find(release => release.version === CURRENT_RELEASE_VERSION)

if (!currentRelease) {
  throw new Error(`Missing release entry for ${CURRENT_RELEASE_VERSION}`)
}

export const CURRENT_RELEASE = currentRelease
export const CURRENT_VERSION = CURRENT_RELEASE.version
