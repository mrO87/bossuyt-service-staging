export type LessonItem = {
  title: string
  summary: string
  outcomes: string[]
}

export type CourseModule = {
  id: string
  part: 1 | 2
  eyebrow: string
  title: string
  duration: string
  summary: string
  whyItMatters: string
  lessonCount: number
  focusFiles: string[]
  lessons: LessonItem[]
  exercises: string[]
}

export const COURSE_MODULES: CourseModule[] = [

  // ──────────────────────────────────────────────────────────────
  // DEEL 1 — ARCHITECTUUR & PRODUCT
  // ──────────────────────────────────────────────────────────────

  {
    id: 'product-and-surfaces',
    part: 1,
    eyebrow: 'Module 1',
    title: 'Begrijp de app, omgevingen en zichtbare routes',
    duration: '18 min',
    summary:
      'Je leert welke delen van de service-app al live gedrag voorstellen, welke routes intern blijven en hoe staging, demo en plan-site elk een andere rol hebben.',
    whyItMatters:
      'Zonder dit verschil zou je snel wijzigingen op de verkeerde plek bouwen of per ongeluk een interne route behandelen alsof die al productierijp is.',
    lessonCount: 3,
    focusFiles: [
      'ARCHITECTURE.md',
      'PLANNING.md',
      'app/page.tsx',
      'app/architecture/page.tsx',
      'docs/superpowers/specs/2026-04-10-staging-route-release-discipline-design.md',
    ],
    lessons: [
      {
        title: 'Welke omgeving doet wat?',
        summary:
          'De vaste demo blijft referentie, staging is de actieve werkplek en de plan-site legt enkel uit wat op staging zichtbaar is.',
        outcomes: [
          'Je kan uitleggen waarom demo en staging bewust gescheiden zijn.',
          'Je begrijpt waarom documentatie de staging-realiteit moet volgen.',
        ],
      },
      {
        title: 'Welke routes horen al bij de flow?',
        summary:
          'Het dagoverzicht en interventiedetail horen bij de actieve serviceflow. `/werkbon/nieuw` blijft voorlopig verborgen maar rechtstreeks bereikbaar.',
        outcomes: [
          'Je weet welke pagina\'s veilig zichtbaar mogen zijn.',
          'Je ziet waarom verborgen routes nog geen release-feature zijn.',
        ],
      },
      {
        title: 'Wat betekent release discipline hier?',
        summary:
          'Versiebadge, changenotes en plan-site moeten dezelfde zichtbare stagingversie weerspiegelen.',
        outcomes: [
          'Je begrijpt waarom releasebeslissingen menselijk blijven.',
          'Je weet wanneer een wijziging wel of niet een nieuwe versie is.',
        ],
      },
    ],
    exercises: [
      'Open `/architecture` en beschrijf in je eigen woorden het verschil tussen demo, staging en plan-site.',
      'Controleer of een route zichtbaar, verborgen of intern is en motiveer waarom.',
    ],
  },

  {
    id: 'domain-model',
    part: 1,
    eyebrow: 'Module 2',
    title: 'Lees het domeinmodel als een servicetechnieker-app',
    duration: '24 min',
    summary:
      'Deze module vertaalt de types en architectuur naar echte businessobjecten: klanten, sites, toestellen, interventies, werkbonnen en opvolgacties.',
    whyItMatters:
      'Als je het datamodel niet snapt, ga je UI en API snel bouwen rond verkeerde aannames, zoals data dupliceren die eigenlijk via relaties hoort te komen.',
    lessonCount: 3,
    focusFiles: ['ARCHITECTURE.md', 'types/index.ts', 'types/planning.ts'],
    lessons: [
      {
        title: 'Klant, site en toestel zijn niet hetzelfde',
        summary:
          'Een klant is de facturatie-entiteit, een site is de werkplek en een toestel hangt aan een site. Dat onderscheid is cruciaal voor servicewerk.',
        outcomes: [
          'Je kan zien waarom een klant meerdere sites kan hebben.',
          'Je begrijpt waarom toestellen niet rechtstreeks aan de klant hangen.',
        ],
      },
      {
        title: 'Interventie versus werkbon',
        summary:
          'Een interventie is de job of planning; een werkbon is het uitgevoerde verslag van wat er op locatie is gebeurd.',
        outcomes: [
          'Je kan beschrijven waarom meerdere werkbonnen bij servicewerk nodig kunnen zijn.',
          'Je ziet waarom planning-data en uitvoeringsdata anders evolueren.',
        ],
      },
      {
        title: 'Denormalized fields: handig nu, tijdelijk later',
        summary:
          'De huidige intervention-types bevatten nog displayvelden zoals klant- en sitenaam, maar het plan zegt expliciet dat dit later via joins moet komen.',
        outcomes: [
          'Je herkent tijdelijke mock-vriendelijke shortcuts.',
          'Je begrijpt waarom de DB-slice die duplicatie later moet terugdringen.',
        ],
      },
    ],
    exercises: [
      'Teken de relatie Customer → Site → Device → Intervention → Werkbon op papier.',
      'Vergelijk `types/index.ts` met `ARCHITECTURE.md` en noteer welke velden vandaag nog tijdelijk gedupliceerd zijn.',
    ],
  },

  {
    id: 'offline-first',
    part: 1,
    eyebrow: 'Module 3',
    title: 'Denk offline-first in plaats van API-first',
    duration: '22 min',
    summary:
      'De app is gemaakt voor techniekers op verplaatsing. Daarom moet elke schrijfactie eerst veilig lokaal landen voordat de server gevolgd wordt.',
    whyItMatters:
      'In het veld is connectiviteit onbetrouwbaar. Als de app data alleen server-side vertrouwt, verlies je net de info die het belangrijkst is: werkbonnen en statusupdates.',
    lessonCount: 3,
    focusFiles: ['ARCHITECTURE.md', 'lib/idb.ts', 'lib/sync.ts', 'app/api/sync/today/route.ts'],
    lessons: [
      {
        title: 'Morning sync als startpunt',
        summary:
          'Bij online opstart haalt de app de relevante data van vandaag binnen en bewaart die lokaal in IndexedDB.',
        outcomes: [
          'Je begrijpt waarom niet alle data tegelijk nodig is.',
          'Je kan uitleggen waarom "vandaag + open jobs" de juiste eerste cache-slice is.',
        ],
      },
      {
        title: 'Schrijven: eerst lokaal, dan server',
        summary:
          'De architectuur schrijft eerst naar IndexedDB en probeert daarna de API. Bij falen komt de actie in een wachtrij voor later.',
        outcomes: [
          'Je ziet waarom een queue betrouwbaarder is dan een directe POST-only flow.',
          'Je begrijpt hoe syncstatusen aan de gebruiker vertrouwen geven.',
        ],
      },
      {
        title: 'Waarom "10 volledige werkbonnen" belangrijk is',
        summary:
          'De eerste PostgreSQL-slice mikt niet op alles, maar op genoeg detail om de dagflow en detailpagina offline geloofwaardig te maken.',
        outcomes: [
          'Je kan scope afbakenen zonder de gebruikservaring te breken.',
          'Je leert waarom een goede eerste slice klein maar volledig moet zijn.',
        ],
      },
    ],
    exercises: [
      'Leg uit wat er met een werkbon moet gebeuren als de technieker een tunnel inrijdt tijdens opslaan.',
      'Zoek in `lib/idb.ts` welke stores er nu bestaan en welke flow daar al op steunt.',
    ],
  },

  {
    id: 'day-flow-and-routing',
    part: 1,
    eyebrow: 'Module 4',
    title: 'Volg de technieker-flow van dagoverzicht tot interventie',
    duration: '21 min',
    summary:
      'Deze module laat zien hoe planning, routevolgorde en interventiedetail samen de dagelijkse werkflow vormen.',
    whyItMatters:
      'Een service-app voelt pas logisch als de daglijst, de route, de detailpagina en de werkbon elkaar zonder naden aanvullen.',
    lessonCount: 3,
    focusFiles: [
      'components/DayView/DayView.tsx',
      'components/DayTimeline/DayTimeline.tsx',
      'components/DayTimeline/useRouteTimeline.ts',
      'app/interventions/[id]/page.tsx',
    ],
    lessons: [
      {
        title: 'Dagoverzicht als operationele cockpit',
        summary:
          'De homepagina is niet zomaar een lijst: ze combineert planning, open pool, routevolgorde en samenvatting in één technieker-scherm.',
        outcomes: [
          'Je begrijpt waarom mobiel-first hier zo belangrijk is.',
          'Je kan benoemen welke informatie onmiddellijk zichtbaar moet zijn in het veld.',
        ],
      },
      {
        title: 'Routeherberekening is businesslogica',
        summary:
          'Startadres, eindadres, pauze en jobvolgorde beïnvloeden rechtstreeks de realiteit van de dag. Daarom moet routeberekening reageren op meer dan alleen drag & drop.',
        outcomes: [
          'Je ziet waarom een ogenschijnlijk kleine bug grote impact heeft op de dagplanning.',
          'Je begrijpt waarom adreswijzigingen naar coördinaten vertaald moeten worden.',
        ],
      },
      {
        title: 'Interventiedetail groeit later uit tot echte werkbonflow',
        summary:
          'De detailroute is nu al zichtbaar in staging, maar moet later van mock-data naar echte DB/sync-data evolueren.',
        outcomes: [
          'Je weet waarom deze route een strategische plek is voor verdere bouw.',
          'Je begrijpt het verschil tussen "zichtbaar prototype" en "definitieve databron".',
        ],
      },
    ],
    exercises: [
      'Volg in code hoe een job uit het dagoverzicht naar `/interventions/[id]` leidt.',
      'Beschrijf welke stateveranderingen de route opnieuw moeten laten berekenen.',
    ],
  },

  {
    id: 'shared-postgres-slice',
    part: 1,
    eyebrow: 'Module 5',
    title: 'Bouw de eerste gedeelde PostgreSQL-slice',
    duration: '27 min',
    summary:
      'Hier leer je waarom de app nu wegbeweegt van pure mock-data en hoe een kleine gedeelde databasis de basis vormt voor verdere groei.',
    whyItMatters:
      'Deze module verbindt UI-werk met echte infrastructuur. Zo begrijp je waarom een minimale relationele fundering nuttiger is dan nog meer tijdelijke mock-uitbreidingen.',
    lessonCount: 3,
    focusFiles: [
      'docs/superpowers/specs/2026-04-10-plan-c-shared-postgres-design.md',
      'docs/superpowers/plans/2026-04-10-plan-c-shared-postgres.md',
      'lib/db/client.ts',
      'lib/db/schema.ts',
      'lib/db/seed.ts',
    ],
    lessons: [
      {
        title: 'Waarom Plan C gekozen is',
        summary:
          'Niet verder bouwen op mock-data, en ook geen losse app-specifieke database. De gekozen richting is een minimale gedeelde PostgreSQL-fundering.',
        outcomes: [
          'Je kan de trade-off tussen snelheid en toekomstvastheid uitleggen.',
          'Je begrijpt waarom seed data hier belangrijker is dan extra mocks.',
        ],
      },
      {
        title: 'Welke tabellen eerst nodig zijn',
        summary:
          'De eerste slice blijft bewust klein: techniekers, klanten, sites, toestellen en werkorders zijn genoeg om de service-app geloofwaardig te laten werken.',
        outcomes: [
          'Je leert een MVP-database afbakenen.',
          'Je weet waarom OCR, voorraad en andere concerns nog buiten scope blijven.',
        ],
      },
      {
        title: 'Van mock-array naar server-side leeslaag',
        summary:
          'De bedoeling is dat sync en UI niet langer rechtstreeks uit `lib/mock-data.ts` lezen, maar via een server-side laag boven PostgreSQL.',
        outcomes: [
          'Je begrijpt waarom datatoegang best centraal georganiseerd wordt.',
          'Je ziet hoe dit de overgang naar een latere Core API voorbereidt.',
        ],
      },
    ],
    exercises: [
      'Lees de Plan C design doc en vat samen welke problemen het meteen oplost.',
      'Zoek in de seedbestanden welke mock-entiteiten vandaag al naar relationele records vertaald worden.',
    ],
  },

  {
    id: 'build-order',
    part: 1,
    eyebrow: 'Module 6',
    title: 'Werk in de juiste volgorde',
    duration: '16 min',
    summary:
      'De planning file is geen losse takenlijst; ze vertelt in welke volgorde de app betrouwbaar kan groeien zonder zichzelf technisch vast te rijden.',
    whyItMatters:
      'Als je features buiten volgorde bouwt, moet je later dubbel werk doen of aannames terugdraaien. De build order beschermt je tegen dat soort verspilling.',
    lessonCount: 3,
    focusFiles: ['PLANNING.md', 'lib/releases.ts', 'app/changenotes/page.tsx'],
    lessons: [
      {
        title: 'Foundation eerst, extra\'s later',
        summary:
          'De planning vertrekt van basisflow, dan database/API, daarna offline, push en pas later adminschermen.',
        outcomes: [
          'Je begrijpt waarom sommige "leuke" features nog moeten wachten.',
          'Je kan prioriteit koppelen aan technische afhankelijkheden.',
        ],
      },
      {
        title: 'Tech debt bewust zichtbaar houden',
        summary:
          'De planning noemt expliciet zaken zoals auth-gating, data loss on refresh en denormalized intervention fields.',
        outcomes: [
          'Je leert dat een goede planning ook problemen documenteert, niet alleen features.',
          'Je kan onderscheid maken tussen blocker, schuld en latere verbetering.',
        ],
      },
      {
        title: 'Releasewerk is ook productwerk',
        summary:
          'Versies, changenotes en zichtbare staging-scope maken deel uit van het product, niet alleen van projectbeheer.',
        outcomes: [
          'Je begrijpt waarom release metadata in code hoort.',
          'Je weet waarom changenotes niet mogen ahead-of-staging lopen.',
        ],
      },
    ],
    exercises: [
      'Neem één open item uit `PLANNING.md` en leg uit van welke eerdere bouwstap het afhangt.',
      'Controleer of een zichtbare wijziging ook release metadata nodig heeft of niet.',
    ],
  },

  // ──────────────────────────────────────────────────────────────
  // DEEL 2 — CODE & TECHNIEK
  // ──────────────────────────────────────────────────────────────

  {
    id: 'nextjs-fundamentals',
    part: 2,
    eyebrow: 'Module 7',
    title: 'Next.js, React en TypeScript — de fundering',
    duration: '30 min',
    summary:
      'Je leert hoe de App Router van Next.js 16 werkt, hoe React-componenten met props en state zijn opgebouwd en waarom TypeScript de code veiliger maakt.',
    whyItMatters:
      'Bijna elk bestand in deze codebase is een React-component of een Next.js route. Zonder dit fundament begrijp je geen enkel ander onderdeel van de app.',
    lessonCount: 3,
    focusFiles: [
      'app/layout.tsx',
      'app/page.tsx',
      'components/VersionBadge.tsx',
      'components/DayTimeline/DaySummary.tsx',
      'types/index.ts',
    ],
    lessons: [
      {
        title: 'Hoe de App Router pagina\'s serveert',
        summary:
          'Elke map in `app/` met een `page.tsx` wordt een route. `layout.tsx` omsluit alle pagina\'s met gedeelde opmaak zoals de font-laag en de VersionBadge.',
        outcomes: [
          'Je kan uitleggen hoe `app/page.tsx` de homepagina wordt.',
          'Je begrijpt waarom `layout.tsx` maar één keer geladen wordt.',
        ],
      },
      {
        title: 'React-componenten met props',
        summary:
          'Een component is een herbruikbare UI-bouwsteen. Props zijn de parameters die je meegeeft — zoals `label` of `jobCount`. `DaySummary` is een goed voorbeeld: klein, één verantwoordelijkheid.',
        outcomes: [
          'Je kan een component schrijven die iets toont op basis van props.',
          'Je begrijpt waarom componenten klein en gericht moeten blijven.',
        ],
      },
      {
        title: 'TypeScript: types en interfaces',
        summary:
          '`types/index.ts` beschrijft alle kernobjecten: `Intervention`, `Werkbon`, `Site`. TypeScript waarschuwt je als je een veld vergeet of een verkeerd type gebruikt.',
        outcomes: [
          'Je weet wat een TypeScript `interface` en `type` zijn.',
          'Je kan de `Intervention`-type lezen en begrijpen wat elk veld betekent.',
        ],
      },
    ],
    exercises: [
      'Maak een nieuw component `GreetingCard` dat een `name`-prop ontvangt en "Hallo, [name]!" toont.',
      'Voeg een TypeScript-type toe aan de props van je component en kijk wat er gebeurt als je een verkeerd type doorgeeft.',
    ],
  },

  {
    id: 'tailwind-and-ui',
    part: 2,
    eyebrow: 'Module 8',
    title: 'Tailwind CSS v4 en mobile-first design',
    duration: '25 min',
    summary:
      'Je leert hoe Tailwind utility-classes direct op HTML/JSX stijlen toepast, hoe het thema van de app is opgebouwd en waarom mobile-first hier niet optioneel is.',
    whyItMatters:
      'De app wordt in het veld gebruikt met vuile handschoenen. Grote touch targets en hoog contrast zijn geen stijlkeuze maar een vereiste. Tailwind maakt dit snel en consistent.',
    lessonCount: 3,
    focusFiles: [
      'components/DayTimeline/BreakTimelineCard.tsx',
      'components/DayTimeline/DayTimeline.tsx',
      'components/WerkbonForm/index.tsx',
    ],
    lessons: [
      {
        title: 'Utility classes in plaats van CSS-bestanden',
        summary:
          'In plaats van `className="card"` schrijf je direct `className="rounded-xl border border-stroke bg-white p-4 shadow-sm"`. Elke class doet één ding. Geen verborgen CSS-regels.',
        outcomes: [
          'Je begrijpt waarom Tailwind geen apart `.css`-bestand nodig heeft.',
          'Je kan een eenvoudige kaart stylen met Tailwind-classes.',
        ],
      },
      {
        title: 'Het kleurthema van de app',
        summary:
          'De app gebruikt `brand-orange`, `brand-blue`, `brand-green`, `ink`, `ink-soft` en `surface`. Dit zijn geen standaard Tailwind-kleuren — ze staan in het thema gedefinieerd.',
        outcomes: [
          'Je weet hoe je een eigen kleur gebruikt in een component.',
          'Je begrijpt het verschil tussen een themakleur en een willekeurige hex-waarde.',
        ],
      },
      {
        title: 'Mobile-first: klein scherm eerst ontwerpen',
        summary:
          'Mobile-first betekent: schrijf eerst de stijl voor het kleinste scherm, voeg dan `md:` of `lg:` prefixes toe voor grotere schermen. De meeste components in deze app gebruiken alleen mobiele stijlen.',
        outcomes: [
          'Je kan een layout schrijven die op mobiel als kolom en op desktop als rij verschijnt.',
          'Je begrijpt waarom `py-3` groot genoeg is voor een vinger maar `py-1` dat niet is.',
        ],
      },
    ],
    exercises: [
      'Neem `DaySummary.tsx` en beschrijf in je eigen woorden wat elke Tailwind-class doet.',
      'Voeg een nieuw blok toe aan de werkbonpagina met de stijl van een bestaande `Section`-component.',
    ],
  },

  {
    id: 'react-hooks-and-state',
    part: 2,
    eyebrow: 'Module 9',
    title: 'React hooks: state, effects en callbacks',
    duration: '35 min',
    summary:
      'Je leert hoe `useState`, `useEffect`, `useCallback` en `useRef` werken aan de hand van echte voorbeelden uit de app: de pauzetimer, de GPS-locatie en de routeberekening.',
    whyItMatters:
      'Hooks zijn het hart van elke React-component. Zodra je snapt hoe state veranderingen de UI opnieuw laten renderen, begrijp je waarom de app reageert zoals ze doet.',
    lessonCount: 3,
    focusFiles: [
      'components/DayTimeline/BreakTimelineCard.tsx',
      'components/DayTimeline/useRouteTimeline.ts',
      'components/WerkbonForm/index.tsx',
    ],
    lessons: [
      {
        title: 'useState: onthoud een waarde tussen renders',
        summary:
          '`useState` bewaart een waarde (bv. `breakState`, `elapsed`, `location`) en triggert een herrender zodra die verandert. `BreakTimelineCard` heeft vijf state-variabelen naast elkaar.',
        outcomes: [
          'Je kan uitleggen wanneer een component opnieuw rendert.',
          'Je weet hoe je een knop maakt die een waarde togglet.',
        ],
      },
      {
        title: 'useEffect: reageer op veranderingen',
        summary:
          '`useEffect` voert code uit na een render. De pauzetimer gebruikt het om een `setInterval` te starten zodra `breakState === "active"`. De cleanup-functie ruimt de timer op.',
        outcomes: [
          'Je begrijpt de dependency array `[breakState]`.',
          'Je weet waarom cleanup-functies geheugen- en CPU-lekken voorkomen.',
        ],
      },
      {
        title: 'useRef en useCallback: stabiele referenties',
        summary:
          '`useRef` bewaart een waarde die niet herrendert (bv. `watchIdRef` voor de GPS-watcher). `useCallback` zorgt dat een functie niet elke render opnieuw aangemaakt wordt.',
        outcomes: [
          'Je kan het verschil uitleggen tussen `useRef` en `useState`.',
          'Je begrijpt waarom `useCallback` nuttig is bij event handlers.',
        ],
      },
    ],
    exercises: [
      'Voeg een `useEffect` toe die een bericht in de console logt elke keer dat `breakState` verandert.',
      'Bouw een minimalistische stopwatch-component met `useState` en `useEffect`.',
    ],
  },

  {
    id: 'nextjs-api-routes',
    part: 2,
    eyebrow: 'Module 10',
    title: 'Next.js API routes en server-logica',
    duration: '28 min',
    summary:
      'Je leert hoe de `app/api/`-routes werken, hoe een POST-request van de browser naar de server gaat en terug, en hoe de routerings-API de ORS-service aanroept.',
    whyItMatters:
      'API routes zijn de brug tussen de browser en externe services zoals OpenRouteService. Zonder dit kunnen we geen echte rijtijden berekenen of push-notificaties sturen.',
    lessonCount: 3,
    focusFiles: [
      'app/api/route/daily/route.ts',
      'app/api/push/send/route.ts',
      'lib/routing/OrsRoutingService.ts',
      'lib/routing/NominatimGeocoder.ts',
    ],
    lessons: [
      {
        title: 'Een API route is gewoon een bestand',
        summary:
          'In `app/api/route/daily/route.ts` exporteer je een `POST`-functie. Next.js registreert die automatisch als `/api/route/daily`. Geen aparte server nodig.',
        outcomes: [
          'Je kan een eenvoudige API route schrijven die JSON teruggeeft.',
          'Je begrijpt hoe `NextRequest` en `NextResponse` werken.',
        ],
      },
      {
        title: 'De browser stuurt data, de server verwerkt die',
        summary:
          '`useRouteTimeline.ts` stuurt een `fetch` POST met stops en adressen. De API-route geocodeert de adressen via Nominatim en berekent rijtijden via ORS.',
        outcomes: [
          'Je ziet hoe `fetch` aan de browserkant en een API route aan de serverkant samenwerken.',
          'Je begrijpt waarom geocoding op de server gebeurt en niet in de browser.',
        ],
      },
      {
        title: 'Externe services abstraheren met een interface',
        summary:
          '`IRoutingService` is een TypeScript interface. `OrsRoutingService` implementeert die. Morgen kan je een TomTom-implementatie toevoegen zonder de rest van de code te wijzigen.',
        outcomes: [
          'Je begrijpt wat een interface in TypeScript doet.',
          'Je ziet waarom abstractie de code flexibeler maakt.',
        ],
      },
    ],
    exercises: [
      'Maak een API route `/api/ping` die `{ status: "ok", time: new Date() }` teruggeeft.',
      'Lees `app/api/route/daily/route.ts` en beschrijf stap voor stap wat er gebeurt bij een POST-request.',
    ],
  },

  {
    id: 'drag-and-drop-and-dnd',
    part: 2,
    eyebrow: 'Module 11',
    title: 'Drag & drop met dnd-kit',
    duration: '26 min',
    summary:
      'Je leert hoe dnd-kit de volgorde van jobs en de pauze beheert, hoe sensoren het verschil maken tussen scrollen en slepen, en hoe de state bijgewerkt wordt na een drop.',
    whyItMatters:
      'Drag & drop op mobiel is technisch moeilijk. dnd-kit lost dit op met een bewuste architectuur: sensoren, sortable context en expliciete activatiegrenzen die scrollen niet blokkeren.',
    lessonCount: 3,
    focusFiles: [
      'components/DayTimeline/DayTimeline.tsx',
      'components/DayTimeline/useRouteTimeline.ts',
    ],
    lessons: [
      {
        title: 'DndContext en SortableContext',
        summary:
          '`DndContext` is de container die alle drag-events opvangt. `SortableContext` weet welke items verplaatsbaar zijn en in welke volgorde. Buiten die context zijn items niet sleepbaar.',
        outcomes: [
          'Je kan uitleggen wat `DndContext` doet.',
          'Je begrijpt waarom start- en eindknoop niet in de `SortableContext` zitten.',
        ],
      },
      {
        title: 'Sensoren: PointerSensor en TouchSensor',
        summary:
          '`PointerSensor` activeert na 5px beweging. `TouchSensor` wacht 250ms en tolereert 8px — zo kan je scrollen zonder per ongeluk een drag te starten.',
        outcomes: [
          'Je begrijpt waarom mobiel een andere sensor nodig heeft dan desktop.',
          'Je kan de activatiegrenzen aanpassen en uitleggen wat ze doen.',
        ],
      },
      {
        title: 'handleDragEnd en de reorder-functie',
        summary:
          'Na een drop vuurt `onDragEnd`. We halen `active.id` en `over.id` op, roepen `reorder()` aan in `useRouteTimeline` en de route herberekent automatisch.',
        outcomes: [
          'Je kan de flow van drag-end naar state-update naar herrender uitleggen.',
          'Je begrijpt waarom routeherberekening in de hook zit en niet in de component.',
        ],
      },
    ],
    exercises: [
      'Pas de `delay` van de TouchSensor aan naar 500ms en test het verschil op mobiel.',
      'Voeg een `console.log` toe in `handleDragEnd` en kijk welke id\'s je ziet bij een drag.',
    ],
  },

  {
    id: 'pdf-and-signatures',
    part: 2,
    eyebrow: 'Module 12',
    title: 'PDF-generatie en handtekening',
    duration: '22 min',
    summary:
      'Je leert hoe jsPDF een werkbon bouwt als PDF in de browser, hoe een canvas-element dienst doet als handtekeningpad en hoe beide samenkomen in het werkbonformulier.',
    whyItMatters:
      'De werkbon is het wettelijk document dat de technieker en klant ondertekenen. Die moet gegenereerd worden zonder server — alles in de browser, offline beschikbaar.',
    lessonCount: 3,
    focusFiles: [
      'lib/pdf.ts',
      'components/SignaturePad/index.tsx',
      'components/WerkbonForm/index.tsx',
    ],
    lessons: [
      {
        title: 'jsPDF: een document opbouwen met code',
        summary:
          'jsPDF werkt als een tekenbord: je zegt "zet tekst op positie x,y", "teken een rechthoek", "voeg een afbeelding in". `lib/pdf.ts` bouwt de volledige werkbon zo op.',
        outcomes: [
          'Je begrijpt waarom PDF-layout met x/y-coördinaten werkt.',
          'Je kan een nieuw tekstblok toevoegen aan de werkbon.',
        ],
      },
      {
        title: 'Canvas als handtekeningpad',
        summary:
          '`SignaturePad` gebruikt een `<canvas>`-element. Touch- en muisevents tekenen lijnen. `toDataURL()` converteert het resultaat naar een base64 PNG die in de PDF ingevoegd wordt.',
        outcomes: [
          'Je weet wat een canvas-element doet in de browser.',
          'Je begrijpt hoe `toDataURL()` een tekening naar een string converteert.',
        ],
      },
      {
        title: 'Formulier → state → PDF',
        summary:
          '`WerkbonForm` beheert alle gegevens in één `FormState`-object. Alle velden worden live bijgehouden. Bij "PDF Genereren" worden ze als één pakket naar `generateWerkbonPDF()` gestuurd.',
        outcomes: [
          'Je ziet hoe één state-object een heel formulier kan bevatten.',
          'Je begrijpt waarom alle data pas bij het genereren samengevoegd wordt.',
        ],
      },
    ],
    exercises: [
      'Voeg een nieuw informatieveld toe aan de PDF (bv. een ordernummer) en test of het correct verschijnt.',
      'Teken iets op het handtekeningpad, klik "wissen" en beschrijf wat er in de code gebeurt.',
    ],
  },

  {
    id: 'gps-and-geolocation',
    part: 2,
    eyebrow: 'Module 13',
    title: 'GPS, Geolocation API en geocoding',
    duration: '24 min',
    summary:
      'Je leert hoe de browser GPS-coördinaten ophaalt, waarom de eerste fix onnauwkeurig is, hoe `watchPosition` betere resultaten geeft en hoe Nominatim een adres omzet naar coördinaten.',
    whyItMatters:
      'Locatienauwkeurigheid is cruciaal voor een service-app in het veld. Een fout adres in de route of een verkeerde pauzelocatie zaaien verwarring bij klanten en dispatchers.',
    lessonCount: 3,
    focusFiles: [
      'components/DayTimeline/BreakTimelineCard.tsx',
      'lib/routing/NominatimGeocoder.ts',
      'app/api/route/daily/route.ts',
    ],
    lessons: [
      {
        title: 'Geolocation API: getCurrentPosition vs watchPosition',
        summary:
          '`getCurrentPosition` geeft de eerste beschikbare positie — vaak WiFi-gebaseerd en onnauwkeurig. `watchPosition` luistert continu en verbetert de fix naarmate de GPS-chip meer satellieten vangt.',
        outcomes: [
          'Je begrijpt waarom de eerste GPS-fix soms een naburige stad toont.',
          'Je weet wanneer je `watchPosition` stopt (accuraatheid < 50m of timeout).',
        ],
      },
      {
        title: 'Permissies en overlays',
        summary:
          'Chrome op mobiel blokkeert een permissie-prompt als er al een overlay zichtbaar is. Daarom vraagt de app locatietoegang bij component-mount — vóór de notificatiebanner verschijnt.',
        outcomes: [
          'Je begrijpt waarom volgorde van permissievragen belangrijk is.',
          'Je kan de `navigator.permissions.query` aanroep uitleggen.',
        ],
      },
      {
        title: 'Nominatim: adres ↔ coördinaten',
        summary:
          '`geocodeSearchQuery` stuurt een vrije tekst naar de Nominatim API van OpenStreetMap en krijgt lat/lon terug. `reverseGeocode` doet het omgekeerde: coördinaten → leesbaar adres.',
        outcomes: [
          'Je weet wat geocoding en reverse geocoding zijn.',
          'Je kan de Nominatim-aanroep lezen en de response verwerken.',
        ],
      },
    ],
    exercises: [
      'Open `BreakTimelineCard.tsx` en volg de volledige GPS-flow van mount tot het tonen van het adres.',
      'Pas `GOOD_ACCURACY_M` aan naar 100m en beschrijf hoe dat de gebruikservaring verandert.',
    ],
  },

  {
    id: 'docker-and-deployment',
    part: 2,
    eyebrow: 'Module 14',
    title: 'Docker, Traefik en deployment naar productie',
    duration: '32 min',
    summary:
      'Je leert hoe de app verpakt wordt in een Docker-container, hoe docker-compose de app en database samenvoegt, en hoe Traefik HTTPS en routering afhandelt op de Hetzner-server.',
    whyItMatters:
      'Van code naar live: dit is het laatste stuk van de puzzel. Zonder dit begrijp je niet waarom de app op `bossuyt-service.fixassistant.com` staat en hoe staging en productie gescheiden blijven.',
    lessonCount: 3,
    focusFiles: [
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.staging.yml',
    ],
    lessons: [
      {
        title: 'Dockerfile: van code naar container',
        summary:
          'De Dockerfile heeft vier stappen: `base` (Node.js image), `deps` (npm install), `builder` (next build) en `runner` (productie-image). Elke stap bouwt op de vorige — dit heet multi-stage build.',
        outcomes: [
          'Je begrijpt waarom een multi-stage build het productie-image kleiner maakt.',
          'Je kan uitleggen wat er in elke `FROM`-stap gebeurt.',
        ],
      },
      {
        title: 'docker-compose: app + database samen',
        summary:
          '`docker-compose.yml` definieert twee services: `app` (Next.js) en `db` (PostgreSQL). Ze zitten op een intern netwerk zodat de app de database kan bereiken maar de buitenwereld de DB niet.',
        outcomes: [
          'Je weet wat een Docker-netwerk doet.',
          'Je begrijpt waarom de DB niet rechtstreeks van buitenaf bereikbaar mag zijn.',
        ],
      },
      {
        title: 'Traefik: HTTPS en subdomain-routing',
        summary:
          'Traefik leest de labels op de Docker-container en registreert automatisch een HTTPS-route voor `staging.bossuyt.fixassistant.com`. Let\'s Encrypt zorgt voor het certificaat.',
        outcomes: [
          'Je begrijpt waarom `traefik.docker.network=traefik` verplicht is.',
          'Je kan de Traefik-labels op een container lezen en aanpassen.',
        ],
      },
    ],
    exercises: [
      'Lees `docker-compose.staging.yml` en vergelijk de Traefik-labels met `docker-compose.yml`. Wat is anders?',
      'Zoek uit wat er gebeurt als je `restart: "no"` verandert naar `restart: unless-stopped` in de staging-compose.',
    ],
  },
  {
    id: 'staging-operations',
    part: 2,
    eyebrow: 'Module 15',
    title: 'Staging beheren: omgevingen, volumes en de juiste buildvolgorde',
    duration: '20 min',
    summary:
      'Je leert waarom `docker compose restart` env-variabelen NIET herlaadt, wanneer je een volume moet wissen en welke drie commando\'s altijd nodig zijn daarna, en hoe je de veilige buildvolgorde voor staging uitvoert.',
    whyItMatters:
      'Fout omgevingsbeheer was verantwoordelijk voor drie opeenvolgende 500-fouten in één sessie: een verkeerde ORS-sleutel, een leeg datavolume en een ontbrekende migratie. Deze module zorgt dat je die fouten herkent en vermijdt.',
    lessonCount: 3,
    focusFiles: [
      '.env.staging.local.example',
      'docker-compose.staging.yml',
    ],
    lessons: [
      {
        title: '`restart` herlaadt geen omgevingsvariabelen — gebruik `down` + `up`',
        summary:
          '`docker compose restart` herstart het proces binnen de bestaande container. Alle environment-variabelen zijn al ingebakken bij het aanmaken van de container. Nieuwe waarden in `.env.staging.local` worden pas zichtbaar na een volledige `down` + `up`.',
        outcomes: [
          'Je weet wanneer `restart` volstaat (enkel code-crash herstellen) en wanneer `down + up` verplicht is (env-wijziging).',
          'Je kan controleren welke variabelen een draaiende container effectief ziet met `docker exec <naam> env | grep VARIABELE`.',
        ],
      },
      {
        title: 'Volume wissen (`down -v`) betekent database opnieuw opzetten',
        summary:
          'De PostgreSQL-data leeft in een Docker-volume. `docker compose down` bewaart het volume — `docker compose down -v` wist het volledig. Na een `-v` bestaat de database nog maar zijn alle tabellen en data weg. Je moet altijd drie commando\'s uitvoeren: `db:push` (tabellen aanmaken), `db:seed` (testdata laden) en `db:triggers` (audit-triggers instellen).',
        outcomes: [
          'Je begrijpt het verschil tussen `down` en `down -v`.',
          'Je kan de drie herstelopdrachten uitvoeren met het juiste `DATABASE_URL`-prefix voor de staging-poort.',
        ],
      },
      {
        title: 'De veilige buildvolgorde voor staging',
        summary:
          'Elke keer dat je de stagingomgeving opstart of env-variabelen wijzigt, is er één correcte volgorde: eerst `.env.staging.local` inladen met `set -a && source .env.staging.local && set +a`, dan pas `docker compose -f docker-compose.staging.yml up --build -d`. Zonder de source-stap krijgen de containers lege of placeholder-waarden.',
        outcomes: [
          'Je kent de exacte reeks commando\'s voor een schone stagingopstart.',
          'Je begrijpt waarom de `.env.staging.local.example` in de repo staat: zodat je nooit opnieuw hoeft te raden welke variabelen nodig zijn.',
        ],
      },
    ],
    exercises: [
      'Voer `docker exec bossuyt-staging env | grep ORS` uit voor en na een `restart` en na een `down + up`. Beschrijf wat je ziet.',
      'Wis het volume met `down -v`, start opnieuw op en herstel de database met de drie db-commando\'s. Controleer het resultaat met `SELECT count(*) FROM work_orders`.',
    ],
  },

  {
    id: 'task-system-and-warehouse',
    part: 2,
    eyebrow: 'Module 16',
    title: 'Taaksysteem, warehouse-flow en opvolgbonnen',
    duration: '34 min',
    summary:
      'Je leert hoe het taaksysteem werkt (types, rollen, statussen, transities), hoe de magazijnierspagina die taken verwerkt, en hoe een opvolgbon automatisch aangemaakt wordt vanuit een bestellingskaart.',
    whyItMatters:
      'Dit is het eerste echt multi-actor proces in de app: kantoor maakt taken aan, de magazijnier verwerkt ze, en de technicus plant een opvolgbezoek. Elk stuk communiceert via databasestatussen en tijdlijn-events — begrijpen hoe dat past is essentieel voor elk volgend feature.',
    lessonCount: 4,
    focusFiles: [
      'lib/db/schema.ts',
      'app/api/tasks/[id]/transition/route.ts',
      'app/api/warehouse/queue/route.ts',
      'app/magazijn/page.tsx',
      'app/api/work-orders/[id]/follow-up/route.ts',
      'components/WerkbonForm/PartsOrderCard.tsx',
    ],
    lessons: [
      {
        title: 'DbTaskType, TaskRole en DbTaskStatus',
        summary:
          'Een taak heeft drie orthogonale assen: type (wat doet de taak — bv. `order_part`), ' +
          'rol (wie voert uit — bv. `warehouse`) en status (waar staat het — bv. `ready`). ' +
          'Een `order_part`-taak met rol `warehouse` en status `ready` betekent: het magazijn moet dit onderdeel bestellen.',
        outcomes: [
          'Je kan een nieuwe taak correct aanmaken met het juiste type, rol en beginstatus.',
          'Je begrijpt waarom type en rol samen bepalen wie de taak te zien krijgt.',
        ],
      },
      {
        title: 'Statusmachine: pending → ready → in_progress → done',
        summary:
          'Taakstatussen zijn geen vrije tekst maar een bewuste toestandsmachine. ' +
          '`POST /api/tasks/[id]/transition` valideert of de gevraagde overgang geldig is, ' +
          'schrijft `completedAt` bij `done` en zet `completedBy` op `null` als er geen echte technicien-ID meegegeven wordt — ' +
          'want dat veld is een foreign key naar `technicians`, geen gewone string.',
        outcomes: [
          'Je kan uitleggen waarom je `completedBy` niet zomaar op `\'warehouse\'` kan zetten.',
          'Je weet wat een foreign key constraint is en hoe je die fout herkent in een database-error.',
        ],
      },
      {
        title: 'De magazijnierspagina als aparte actor',
        summary:
          '`/magazijn` is een aparte appscherm buiten de technicus-flow. Het haalt `order_part`-taken ' +
          'op via `GET /api/warehouse/queue`, groepeert ze per werkorder en toont klant/site/toestel context. ' +
          'De state-update na een actie is optimistisch: de UI past zich meteen aan zonder te wachten op een herlaad.',
        outcomes: [
          'Je begrijpt waarom de magazijnierspagina zijn eigen API-route heeft in plaats van de algemene takenlijst te hergebruiken.',
          'Je kan uitleggen wat optimistische UI-updates zijn en waarom ze de app sneller laten aanvoelen.',
        ],
      },
      {
        title: 'Opvolgbon als gelinkte werkbon met prefill',
        summary:
          '`POST /api/work-orders/[id]/follow-up` doet vier dingen in één transactie: ' +
          '(1) nieuwe werkbon aanmaken met dezelfde klant/site/toestel, ' +
          '(2) `prefillParts` vullen met de ontvangen onderdelen als JSON, ' +
          '(3) een `work_order_links`-record aanmaken van type `follow_up`, ' +
          '(4) tijdlijn-events op beide werkbonnen plaatsen. ' +
          'Alles of niets — `withAudit()` wikkelt de hele operatie in één database-transactie.',
        outcomes: [
          'Je begrijpt waarom vier afzonderlijke database-writes in één transactie moeten zitten.',
          'Je weet hoe `work_order_links` de relatie tussen origineel en opvolgbon bijhoudt voor KPI-rapportage.',
        ],
      },
    ],
    exercises: [
      'Lees `app/api/tasks/[id]/transition/route.ts` en teken de toegestane statusovergangen op papier.',
      'Open de database met `psql` en controleer welke `work_order_links` er staan na het aanmaken van een opvolgbon.',
      'Voeg een `console.log` toe in de follow-up route die toont hoeveel `prefillParts` er meegegeven worden.',
    ],
  },

]

// ──────────────────────────────────────────────────────────────
// Stats

const part1 = COURSE_MODULES.filter(m => m.part === 1)
const part2 = COURSE_MODULES.filter(m => m.part === 2)

export const COURSE_STATS = {
  moduleCount: COURSE_MODULES.length,
  lessonCount: COURSE_MODULES.reduce((sum, m) => sum + m.lessonCount, 0),
  part1Count: part1.length,
  part2Count: part2.length,
  audience: 'Olivier en andere meebouwers van de service-app',
  level: 'Beginner → intermediate',
}

export { part1 as PART1_MODULES, part2 as PART2_MODULES }
