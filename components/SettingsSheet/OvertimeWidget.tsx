'use client'

import { useState, useEffect } from 'react'

interface Props {
  startTime: string   // "HH:MM"
  saldo: number | null  // total overtime in minutes; null = not yet loaded from DB
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
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

const TARGET_MINUTES = 7 * 60 + 45  // 7u45

export default function OvertimeWidget({ startTime, saldo }: Props) {
  const [elapsed, setElapsed] = useState(0)  // minutes since startTime

  useEffect(() => {
    function update() {
      const now = new Date()
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      const startMinutes = parseMinutes(startTime)
      setElapsed(Math.max(0, nowMinutes - startMinutes))
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [startTime])

  const progress = Math.min(100, (elapsed / TARGET_MINUTES) * 100)
  const remaining = TARGET_MINUTES - elapsed

  return (
    <div className="rounded-xl border border-stroke bg-surface p-4">
      <div className="flex justify-between items-start mb-3">
        {/* Vandaag */}
        <div>
          <p className="text-[10px] font-semibold text-ink-soft uppercase tracking-wide mb-0.5">
            Vandaag
          </p>
          <p className="text-2xl font-bold text-brand-orange leading-none">
            {formatElapsed(elapsed)}
            <span className="text-sm font-normal text-ink-soft ml-1">/ 7u45</span>
          </p>
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
        {remaining > 0 ? (
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
