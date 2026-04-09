/**
 * /changenotes — versiegeschiedenis van de service-app.
 *
 * Elke entry beschrijft wat er veranderd is en waarom, zodat de technieker
 * (en Olivier) kan opvolgen wat er vandaag nieuw is tegenover gisteren.
 * De uitgebreide versie met code-voorbeelden staat op
 * https://plan.bossuyt.fixassistant.com/changenotes.
 */

import Link from 'next/link'

type Change = { label: 'Nieuw' | 'Verbeterd' | 'Fix'; title: string; body: string }
type Version = { version: string; date: string; changes: Change[] }

const VERSIONS: Version[] = [
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

function LabelPill({ label }: { label: Change['label'] }) {
  const color =
    label === 'Nieuw'
      ? 'bg-brand-green text-white'
      : label === 'Verbeterd'
        ? 'bg-brand-blue text-white'
        : 'bg-brand-red text-white'
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${color}`}>
      {label}
    </span>
  )
}

export default function ChangenotesPage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-brand-dark px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-ink-soft text-sm">← Terug</Link>
          <p className="text-xs text-ink-soft">Changelog</p>
        </div>
        <h1 className="mt-2 text-xl font-bold text-white">Wat is er nieuw?</h1>
        <p className="text-xs text-ink-soft mt-1">
          Uitgebreide versie met code-voorbeelden op{' '}
          <a
            href="https://plan.bossuyt.fixassistant.com/changenotes"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            plan.bossuyt.fixassistant.com/changenotes
          </a>
        </p>
      </header>

      <main className="px-4 py-6 pb-20 flex flex-col gap-8">
        {VERSIONS.map(v => (
          <section key={v.version}>
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-2xl font-black text-brand-orange">{v.version}</h2>
              <p className="text-xs text-ink-soft">{v.date}</p>
            </div>
            <div className="flex flex-col gap-3">
              {v.changes.map((c, i) => (
                <article
                  key={i}
                  className="bg-white rounded-xl border border-stroke shadow-sm p-4"
                >
                  <div className="flex items-start gap-3 mb-2">
                    <LabelPill label={c.label} />
                    <h3 className="font-bold text-base text-ink leading-tight">{c.title}</h3>
                  </div>
                  <p className="text-sm text-ink-soft leading-relaxed">{c.body}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
