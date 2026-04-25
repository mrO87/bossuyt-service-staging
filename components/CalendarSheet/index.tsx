'use client'

import { useEffect, useState } from 'react'

function ChevronLeft({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRight({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

interface CalendarSheetProps {
  open: boolean
  onClose: () => void
  selected: Date
  onSelect: (date: Date) => void
  technicianId: string
}

const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return toLocalDateStr(a) === toLocalDateStr(b)
}

function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat('nl-BE', { month: 'long', year: 'numeric' }).format(date)
}

export default function CalendarSheet({
  open,
  onClose,
  selected,
  onSelect,
  technicianId,
}: CalendarSheetProps) {
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = new Date(selected)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [busyDays, setBusyDays] = useState<Set<string>>(new Set())

  // Keep viewMonth in sync when selected jumps to a different month
  useEffect(() => {
    const selMonth = new Date(selected)
    selMonth.setDate(1)
    selMonth.setHours(0, 0, 0, 0)
    if (
      selMonth.getFullYear() !== viewMonth.getFullYear() ||
      selMonth.getMonth() !== viewMonth.getMonth()
    ) {
      setViewMonth(selMonth)
    }
  }, [selected])

  // Fetch busy days whenever the viewed month changes (or sheet opens)
  useEffect(() => {
    if (!open) return
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth() + 1
    fetch(`/api/sync/month?technicianId=${technicianId}&year=${year}&month=${month}`)
      .then(r => (r.ok ? r.json() : { days: [] }))
      .then((data: { days: string[] }) => setBusyDays(new Set(data.days)))
      .catch(() => setBusyDays(new Set()))
  }, [open, viewMonth, technicianId])

  if (!open) return null

  const today = new Date()
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()

  // Monday-based calendar grid
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() {
    setViewMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function nextMonth() {
    setViewMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }
  function selectDay(day: number) {
    onSelect(new Date(year, month, day, 12, 0, 0))
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-brand-dark rounded-t-2xl">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-brand-mid" />
        </div>

        {/* Month header */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={prevMonth}
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-brand-mid/40 transition-colors"
            aria-label="Vorige maand"
          >
            <ChevronLeft size={22} className="text-white" />
          </button>
          <p className="text-white font-bold text-base capitalize">
            {formatMonthYear(viewMonth)}
          </p>
          <button
            onClick={nextMonth}
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-brand-mid/40 transition-colors"
            aria-label="Volgende maand"
          >
            <ChevronRight size={22} className="text-white" />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 px-2">
          {WEEKDAYS.map(d => (
            <p
              key={d}
              className="text-center text-[11px] font-semibold text-ink-soft uppercase tracking-wide py-1"
            >
              {d}
            </p>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 px-2 pb-8">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`e-${i}`} className="h-12" />
            }

            const cellDate = new Date(year, month, day, 12, 0, 0)
            const dateStr = toLocalDateStr(cellDate)
            const isSelected = isSameLocalDay(cellDate, selected)
            const isDayToday = isSameLocalDay(cellDate, today)
            const isBusy = busyDays.has(dateStr)

            return (
              <button
                key={day}
                onClick={() => selectDay(day)}
                className="h-12 flex flex-col items-center justify-center rounded-xl active:bg-brand-mid/40 transition-colors"
              >
                <span
                  className={[
                    'w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold',
                    isSelected
                      ? 'bg-brand-orange text-white'
                      : isDayToday
                      ? 'ring-2 ring-brand-orange text-brand-orange'
                      : 'text-white',
                  ].join(' ')}
                >
                  {day}
                </span>
                {isBusy && (
                  <span
                    className={[
                      'w-1.5 h-1.5 rounded-full -mt-1',
                      isSelected ? 'bg-white/70' : 'bg-brand-orange',
                    ].join(' ')}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
