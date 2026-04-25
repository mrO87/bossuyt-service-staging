/**
 * /changenotes — versiegeschiedenis van de service-app.
 *
 * Elke entry beschrijft wat er veranderd is en waarom, zodat de technieker
 * (en Olivier) kan opvolgen wat er vandaag nieuw is tegenover gisteren.
 * De uitgebreide versie met code-voorbeelden staat op
 * https://plan.bossuyt.fixassistant.com/changenotes.
 */

import Link from 'next/link'
import { RELEASES } from '@/lib/releases'
import type { ChangeLabel } from '@/lib/releases'

function LabelPill({ label }: { label: ChangeLabel }) {
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
        {RELEASES.map(v => (
          <section key={v.version}>
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-2xl font-black text-brand-orange">{v.version}</h2>
              <p className="text-xs text-ink-soft">{v.date}</p>
            </div>
            <div className="flex flex-col gap-3">
              {v.changes.map(c => (
                <article
                  key={`${v.version}-${c.title}-${c.label}`}
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
