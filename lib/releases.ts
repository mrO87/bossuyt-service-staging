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
    version: 'v1.24',
    date: '24 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.23',
    date: '24 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.22',
    date: '23 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Magazijnierspagina voor het opvolgen van onderdelenbestellingen',
        body:
          'De nieuwe pagina `/magazijn` toont alle openstaande `order_part`-taken gegroepeerd per werkorder. ' +
          'De magazijnier ziet klant, site, toestel en elk afzonderlijk onderdeel met artikelcode en aantal. ' +
          'Twee acties: "Besteld ✓" zet een onderdeel van "Te bestellen" naar "Besteld", ' +
          '"Ontvangen ✓" sluit het af als ontvangen. Ontvangen onderdelen verdwijnen niet maar ' +
          'verschuiven naar een inklapbare "Vandaag ontvangen"-sectie onderaan.',
      },
      {
        label: 'Nieuw',
        title: 'Nieuwe opvolgbon aanmaken vanuit de werkbon',
        body:
          'Zodra alle onderdelen van een bestelling ontvangen zijn (status "Alle ontvangen"), ' +
          'activeert de knop "Nieuwe Opvolgbon" in de bestellingskaart. ' +
          'Eén klik maakt automatisch een nieuwe werkbon aan voor dezelfde klant, site en toestel — ' +
          'met de bestelde onderdelen al ingevuld als verbruikte onderdelen. ' +
          'Beide werkbonnen krijgen een tijdlijn-event: de originele toont "opvolgbon aangemaakt", ' +
          'de nieuwe toont "aangemaakt als opvolging van…".',
      },
      {
        label: 'Nieuw',
        title: 'Bestellingskaart op de werkbon met PDF-afdruk en actiebalk',
        body:
          'De inklapbare bestellingskaart op de werkbon toont alle `order_part`-taken gegroepeerd per type ' +
          '(stock aanvullen vs. bestellen bij leverancier). In de uitgevouwen actiebalk staan twee knoppen: ' +
          '"Print PDF" genereert meteen een bestelblad met artikelcodes, beschrijvingen, merk en leverancier. ' +
          '"Nieuwe Opvolgbon" wordt actief zodra alle onderdelen ontvangen zijn.',
      },
      {
        label: 'Nieuw',
        title: 'Makefile voorkomt staging-heropbouw zonder omgevingsvariabelen',
        body:
          'Een Makefile bundelt de veelgebruikte stagingcommando\'s. `make staging-up` zorgt altijd dat ' +
          '`--env-file .env.staging.local` meegegeven wordt. Zo is het niet meer mogelijk om de app te bouwen ' +
          'met lege databasewachtwoorden of ontbrekende API-sleutels.',
      },
      {
        label: 'Fix',
        title: 'Magazijnovergangen werkten niet door foreign key-fout',
        body:
          'De "Ontvangen ✓"-knop gaf een databasefout omdat het veld `completedBy` een foreign key is naar ' +
          'de `technicians`-tabel. Strings zoals `\'warehouse\'` of `\'erp\'` zijn geen geldige technicien-IDs. ' +
          'Opgelost door `completedBy` op `null` te zetten wanneer er geen echte technicien-ID beschikbaar is.',
      },
    ],
  },
  {
    version: 'v1.21',
    date: '16 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Foto’s toevoegen aan de werkbon',
        body:
          'Op de werkbon staat nu een aparte fotozone waar de technieker een foto kan nemen ' +
          'met de camera of een bestaande foto uit de galerij kan kiezen.',
      },
      {
        label: 'Verbeterd',
        title: 'Foto’s blijven lokaal bewaard tot er verbinding is',
        body:
          'Nieuwe werkbonfoto’s worden eerst lokaal opgeslagen in IndexedDB. Daardoor gaan ' +
          'ze niet verloren als de technieker offline werkt of tijdelijk geen bereik heeft.',
      },
      {
        label: 'Verbeterd',
        title: 'Duidelijke sync-status per foto',
        body:
          'Elke foto toont nu een kleine statusbadge: wacht op upload, mislukt of succesvol ' +
          'geupload. Zo ziet de technieker meteen wat al veilig op de server staat.',
      },
    ],
  },
  {
    version: 'v1.20',
    date: '14 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Activiteiten direct op de werkbon',
        body:
          'Open activiteiten staan nu in het avatar- en instellingenmenu met een teller, ' +
          'en linken rechtstreeks naar de juiste werkbon. In de activiteitenlog kan je ' +
          'activiteiten compacter bekijken, aanmaken en beheren.',
      },
      {
        label: 'Verbeterd',
        title: 'Planning en instellingen lopen nu consistenter samen',
        body:
          'Startuur, startlocatie en thuisadres gebruiken nu gedeelde settings in plaats ' +
          'van losse lokale staten. Daardoor blijven avatar, planning en routeberekening ' +
          'beter op elkaar afgestemd.',
      },
      {
        label: 'Fix',
        title: 'Adressen met natuurlijke schrijfwijze werken beter',
        body:
          'Adresinvoer zoals "Lintsesteenweg 25 in Kontich" wordt nu robuuster genormaliseerd ' +
          'voor zowel de zoekbalk als de route-geocoder. Daardoor blijven zoekresultaten en ' +
          'dynamische reistijden beter werken bij vrije invoer.',
      },
    ],
  },
  {
    version: 'v1.13',
    date: '12 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Werkbonnen tabel — elke opslag maakt een nieuw record',
        body:
          'Elke keer dat je op "PDF Genereren & Opslaan" klikt, wordt een nieuw werkbon-record ' +
          'aangemaakt in de database. Zo wordt niets meer overschreven en is de volledige ' +
          'geschiedenis van alle ingevulde werkbonnen per toestel bewaard.',
      },
      {
        label: 'Nieuw',
        title: 'PDF bekijken via historiek',
        body:
          'De PDF-link in de historiek werkt nu correct. De bestanden worden bewaard op de server ' +
          'en opgediend via een beveiligde API-route — ook in de standalone Docker-build.',
      },
      {
        label: 'Verbeterd',
        title: 'Opvolgacties worden ook opgeslagen bij de werkbon',
        body:
          'Naast omschrijving, onderdelen, start- en eindtijd worden nu ook de opvolgacties ' +
          'bewaard als onderdeel van de werkbon in de database.',
      },
    ],
  },
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

const CURRENT_RELEASE_VERSION = 'v1.20'

const currentRelease = RELEASES.find(release => release.version === CURRENT_RELEASE_VERSION)

if (!currentRelease) {
  throw new Error(`Missing release entry for ${CURRENT_RELEASE_VERSION}`)
}

export const CURRENT_RELEASE = currentRelease
export const CURRENT_VERSION = CURRENT_RELEASE.version
