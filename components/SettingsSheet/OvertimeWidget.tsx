'use client'

import { useState, useEffect } from 'react'
import { dayCapacityMinutes, UNPAID_BREAK_MINUTES } from '@/lib/planning/workSchedule'
import { todayInBelgium } from '@/lib/planning/pastDays'
import { useDayClock } from '@/lib/planning/useDayClock'
import { workedToday } from '@/lib/planning/workedTime'
import { useTasks } from '@/lib/task-store'

interface Props {
  /** Het totale overurensaldo in minuten; null zolang het niet geladen is. */
  saldo: number | null
}


function formatElapsed(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}u${m.toString().padStart(2, '0')}`
}

function formatRemaining(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}u${m}min`
  if (h > 0) return `${h}u`
  return `${m}min`
}

function formatSaldo(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.abs(minutes) % 60
  return `${sign}${h}u${m.toString().padStart(2, '0')}`
}

export default function OvertimeWidget({ saldo }: Props) {
  const { currentUser } = useTasks()
  const vandaag = todayInBelgium()
  const { clock } = useDayClock(currentUser?.id ?? '', vandaag)

  /**
   * Eén tik per minuut, alleen om de klok te laten lopen.
   *
   * De gewerkte tijd wordt hieronder uitgerekend en niet in de toestand
   * bewaard: er is maar één plek waar dat getal ontstaat, en dat is
   * `workedToday`.
   */
  const [tik, setTik] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTik(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // The day's target comes from the roster, so it is 8u30 Monday to Thursday
  // and 6u00 on Friday instead of a flat 7u45 that was right on no day at all.
  const target = dayCapacityMinutes(tik)

  /**
   * Gewerkte tijd volgens de dagklok.
   *
   * Hier stond `nu − het ingestelde startuur`. Dat telde geen enkel gewerkt uur
   * maar gewoon hoe laat het was: 's avonds om elf uur stond er zestien uur, en
   * één minuut na middernacht zeventien. Nu er een echte start- en eindtijd is,
   * telt alleen wat daartussen ligt.
   */
  const gewerkt = workedToday({
    startedAt: clock.startedAt,
    endedAt: clock.endedAt,
    now: tik,
    breakMinutes: UNPAID_BREAK_MINUTES,
  })
  const elapsed = gewerkt?.minutes ?? 0

  // A day with no roster — a weekend — has nothing to count down to.
  const progress = target ? Math.min(100, (elapsed / target) * 100) : 0
  const remaining = target ? target - elapsed : 0

  return (
    <div className="rounded-xl border border-stroke bg-surface p-4">
      <div className="flex justify-between items-start mb-3">
        {/* Vandaag */}
        <div>
          <p className="text-[10px] font-semibold text-ink-soft uppercase tracking-wide mb-0.5">
            Vandaag
          </p>
          {gewerkt === null ? (
            // Niet vertrokken is niet nul: nul zou suggereren dat er gemeten is.
            <p className="text-2xl font-bold text-ink-faint leading-none">--u--</p>
          ) : (
            <p className="text-2xl font-bold text-brand-orange leading-none">
              {formatElapsed(elapsed)}
              {target !== null && (
                <span className="text-sm font-normal text-ink-soft ml-1">
                  / {formatElapsed(target)}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Saldo */}
        <div className="text-right">
          <p className="text-[10px] font-semibold text-ink-soft uppercase tracking-wide mb-0.5">
            Saldo
          </p>
          {saldo === null ? (
            <p className="text-2xl font-bold text-ink-soft leading-none">--u--</p>
          ) : (
            <p className={`text-2xl font-bold leading-none ${saldo >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
              {formatSaldo(saldo)}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-stroke rounded-full mb-2">
        <div
          className="h-1.5 bg-brand-orange rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Status line */}
      <div className="mb-2">
        {gewerkt === null ? (
          <p className="text-xs text-ink-soft">
            Nog niet vertrokken — tik op ▶ in de dagplanning.
          </p>
        ) : target === null ? (
          <p className="text-xs text-ink-soft">Geen werkdag vandaag</p>
        ) : !gewerkt.running ? (
          <p className="text-xs text-ink-soft">Dag afgesloten</p>
        ) : remaining > 0 ? (
          <p className="text-xs text-ink-soft">
            Nog {formatRemaining(remaining)} tot einde dag
          </p>
        ) : (
          <p className="text-xs text-brand-orange font-medium">Dagdoel bereikt</p>
        )}
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-ink-soft italic">
        Berekende tijden — nog niet goedgekeurd
      </p>
    </div>
  )
}
