import Link from 'next/link'

type Pillar = {
  title: string
  summary: string
  bullets: string[]
}

const PILLARS: Pillar[] = [
  {
    title: 'Bevroren productie-demo',
    summary:
      'bossuyt-service.fixassistant.com blijft voorlopig een vaste referentie. We gebruiken die demo niet meer als ontwikkel- of testomgeving.',
    bullets: [
      'Functioneert als stabiele productie-achtige demo voor Bossuyt.',
      'Mag niet de plek worden waar we nog interne experimenten uitrollen.',
    ],
  },
  {
    title: 'Actieve staging-ontwikkeling',
    summary:
      'staging.bossuyt.fixassistant.com is de plek waar we de service-app verder bouwen, testen en verfijnen.',
    bullets: [
      'Nieuwe work in progress hoort hier, niet op de bevroren demo.',
      'Routes en dataflow worden hier stap voor stap naar de echte backend gebracht.',
    ],
  },
  {
    title: 'Plan-site als uitleglaag',
    summary:
      'plan.bossuyt.fixassistant.com legt uit wat zichtbaar en bruikbaar is op staging, niet wat we intern nog aan het uitwerken zijn.',
    bullets: [
      'Changenotes moeten staging weerspiegelen.',
      'De site is documentatie en uitleg, geen extra ontwikkelomgeving.',
    ],
  },
]

type FlowStep = {
  title: string
  body: string
  accent: string
}

const FLOW_STEPS: FlowStep[] = [
  {
    title: '1. Service-app',
    body:
      'De huidige app blijft het werkvlak voor het dagoverzicht, interventies en de offline-first gebruikersflow van de technieker.',
    accent: 'bg-brand-blue/10',
  },
  {
    title: '2. Eerste serverlaag op staging',
    body:
      'Staging krijgt de eerste echte serverlaag, zodat data en routegedrag niet langer alleen uit tijdelijke mock-data komen.',
    accent: 'bg-brand-orange/10',
  },
  {
    title: '3. Gedeelde PostgreSQL',
    body:
      'Een gedeelde PostgreSQL in Docker wordt de basis waarop deze service-app en latere Bossuyt-apps dezelfde kerngegevens delen.',
    accent: 'bg-brand-green/10',
  },
  {
    title: '4. Plan-site',
    body:
      'De plan-site blijft een beschrijvende laag die uitlegt wat op staging live staat en waarom die richting gekozen is.',
    accent: 'bg-brand-blue/10',
  },
]

function PillarCard({ pillar }: { pillar: Pillar }) {
  return (
    <article className="rounded-3xl border border-stroke bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-ink-soft">
        {pillar.title}
      </p>
      <p className="mt-3 text-sm leading-6 text-ink-soft">{pillar.summary}</p>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-ink">
        {pillar.bullets.map(item => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </article>
  )
}

function FlowBlock({
  title,
  body,
  accent,
}: {
  title: string
  body: string
  accent: string
}) {
  return (
    <div className={`rounded-2xl border border-stroke px-4 py-4 ${accent}`}>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-ink-soft">
        {title}
      </p>
      <p className="mt-2 text-sm font-medium leading-6 text-ink">{body}</p>
    </div>
  )
}

export default function ArchitectuurPage() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-brand-dark px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-ink-soft">
            ← Terug
          </Link>
          <p className="text-xs text-ink-soft">Interne architectuur</p>
        </div>
        <h1 className="mt-3 max-w-4xl text-3xl font-black leading-tight text-white">
          Demo vast, staging actief, plan-site verklarend, PostgreSQL als volgende basis
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-ink-soft">
          Dit is een interne werkpagina. Ze beschrijft de huidige afspraak: de
          productie-demo blijft bevroren, staging is de werkelijke ontwikkelomgeving,
          de plan-site licht toe wat daar live staat, en de volgende backendfundering
          is een gedeelde PostgreSQL voor deze service-app en de latere Bossuyt-flow.
        </p>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 pb-24">
        <section className="grid gap-5 md:grid-cols-3">
          {PILLARS.map(pillar => (
            <PillarCard key={pillar.title} pillar={pillar} />
          ))}
        </section>

        <section className="rounded-[28px] border border-stroke bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-ink-soft">
            Wat we nu bouwen
          </p>
          <h2 className="mt-2 text-2xl font-black text-ink">
            Eerst de stagingflow afbakenen, daarna de gedeelde databasis aansluiten
          </h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {FLOW_STEPS.map(step => (
              <FlowBlock
                key={step.title}
                title={step.title}
                body={step.body}
                accent={step.accent}
              />
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-stroke bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-ink-soft">
            Koppeling met de service-app
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-surface p-4">
              <p className="text-sm font-black uppercase tracking-wide text-brand-dark">
                Wat de app nodig heeft
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                De service-app moet dezelfde kerngegevens kunnen lezen die later in
                PostgreSQL leven: klanten, sites, toestellen, werkorders en de synclaag
                voor de dagflow. Dat maakt de offline cache en de staging-routes een
                gecontroleerde stap richting de echte backend.
              </p>
            </div>
            <div className="rounded-2xl bg-surface p-4">
              <p className="text-sm font-black uppercase tracking-wide text-brand-dark">
                Wat de plan-site uitlegt
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                De plan-site volgt de staging-realiteit. Daardoor kunnen changenotes,
                release notes en architectuurteksten verwijzen naar één gedeelde bron
                van waarheid in plaats van naar oude opties of losse experimenten.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-stroke bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-ink-soft">
            Interne leerlaag
          </p>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-black text-ink">Lessenroute voor deze codebase</h2>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Er is nu ook een interne cursuspagina die de bestaande architectuur,
                planning, release-afspraken en databaseplannen omzet naar concrete
                lessen voor deze service-app.
              </p>
            </div>
            <Link
              href="/lessons"
              className="inline-flex items-center justify-center rounded-full bg-brand-orange px-4 py-3 text-sm font-black text-white shadow-sm"
            >
              Open de cursus
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
