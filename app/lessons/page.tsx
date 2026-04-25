import Link from 'next/link'
import { COURSE_STATS, PART1_MODULES, PART2_MODULES, type CourseModule } from '@/lib/lessons'

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-2xl border border-stroke bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-ink-soft">{label}</p>
      <p className="mt-3 text-2xl font-black text-ink">{value}</p>
    </article>
  )
}

function ModuleCard({ module }: { module: CourseModule }) {
  return (
    <article className="rounded-[28px] border border-stroke bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-brand-orange">
            {module.eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-black text-ink">{module.title}</h2>
        </div>
        <div className="rounded-full border border-stroke bg-surface px-3 py-1 text-xs font-bold text-ink-soft">
          {module.duration}
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-ink-soft">{module.summary}</p>

      <div className="mt-4 rounded-2xl bg-brand-blue/10 p-4">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-blue">
          Waarom deze module telt
        </p>
        <p className="mt-2 text-sm leading-6 text-ink">{module.whyItMatters}</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
        <div className="space-y-3">
          {module.lessons.map(lesson => (
            <section key={lesson.title} className="rounded-2xl border border-stroke bg-surface p-4">
              <h3 className="text-base font-black text-ink">{lesson.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{lesson.summary}</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-ink">
                {lesson.outcomes.map(outcome => (
                  <li key={outcome}>• {outcome}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-stroke bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-green">
              Focusbestanden
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {module.focusFiles.map(file => (
                <span
                  key={file}
                  className="rounded-full bg-brand-dark px-3 py-1 text-xs font-semibold text-white"
                >
                  {file}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-stroke bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-orange">
              Oefeningen
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-ink">
              {module.exercises.map(exercise => (
                <li key={exercise}>• {exercise}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </article>
  )
}

function PartHeader({
  part,
  title,
  subtitle,
  moduleCount,
  color,
}: {
  part: string
  title: string
  subtitle: string
  moduleCount: number
  color: 'orange' | 'blue'
}) {
  const colorClass = color === 'orange'
    ? 'bg-brand-orange/10 border-brand-orange/30 text-brand-orange'
    : 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue'
  const badgeClass = color === 'orange' ? 'bg-brand-orange' : 'bg-brand-blue'

  return (
    <div className={`rounded-[28px] border p-6 ${colorClass}`}>
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-black text-white uppercase tracking-widest ${badgeClass}`}>
          {part}
        </span>
        <span className="text-xs font-bold opacity-60">{moduleCount} modules</span>
      </div>
      <h2 className="mt-3 text-2xl font-black text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{subtitle}</p>
    </div>
  )
}

export default function LessonsPage() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-brand-dark px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <Link href="/architecture" className="text-sm text-ink-soft">
            ← Terug naar architectuur
          </Link>
          <p className="text-xs text-ink-soft">Interne cursus</p>
        </div>

        <div className="mt-4 max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-ink-soft">
            Bossuyt Service Academy
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-white md:text-4xl">
            Leer deze codebase bouwen — van architectuur tot deployment
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-ink-soft">
            Twee delen: eerst begrijp je het product en de architectuur, dan leer je
            elke technologie die in de code gebruikt wordt aan de hand van echte
            voorbeelden uit dit project.
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 pb-24">

        {/* Stats */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Modules totaal" value={COURSE_STATS.moduleCount} />
          <StatCard label="Lessen" value={COURSE_STATS.lessonCount} />
          <StatCard label="Deel 1 — Architectuur" value={`${COURSE_STATS.part1Count} modules`} />
          <StatCard label="Deel 2 — Code & Techniek" value={`${COURSE_STATS.part2Count} modules`} />
        </section>

        {/* How to use */}
        <section className="rounded-[28px] border border-stroke bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-ink-soft">
            Hoe je deze cursus gebruikt
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-brand-orange/10 p-4">
              <p className="text-sm font-black uppercase tracking-wide text-brand-orange">1. Lees</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Start met de module-uitleg zodat je eerst het <em>waarom</em> begrijpt.
              </p>
            </div>
            <div className="rounded-2xl bg-brand-blue/10 p-4">
              <p className="text-sm font-black uppercase tracking-wide text-brand-blue">2. Open de code</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Gebruik de focusbestanden om meteen naar de relevante delen van de repo te gaan.
              </p>
            </div>
            <div className="rounded-2xl bg-brand-green/10 p-4">
              <p className="text-sm font-black uppercase tracking-wide text-brand-green">3. Oefen</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Rond elke module af met een kleine oefening zodat de logica blijft hangen.
              </p>
            </div>
          </div>
        </section>

        {/* Deel 1 */}
        <section className="space-y-5">
          <PartHeader
            part="Deel 1"
            title="Architectuur & Product"
            subtitle="Begrijp het domeinmodel, de omgevingen, de offline-first aanpak en de build-volgorde voordat je een regel code aanraakt."
            moduleCount={COURSE_STATS.part1Count}
            color="orange"
          />
          {PART1_MODULES.map(module => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </section>

        {/* Deel 2 */}
        <section className="space-y-5">
          <PartHeader
            part="Deel 2"
            title="Code & Techniek"
            subtitle="Leer elke technologie stap voor stap aan de hand van echte code uit dit project: Next.js, React hooks, Tailwind, API routes, drag & drop, PDF, GPS en Docker."
            moduleCount={COURSE_STATS.part2Count}
            color="blue"
          />
          {PART2_MODULES.map(module => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </section>

      </main>
    </div>
  )
}
