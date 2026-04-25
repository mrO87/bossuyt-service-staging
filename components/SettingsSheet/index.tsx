'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ATELIER_ADDRESS, useSettings } from '@/lib/hooks/useSettings'
import { getInterventionById } from '@/lib/mock-data'
import { isTaskAssignedToUser, isTaskOpen } from '@/lib/task-meta'
import { useTasks } from '@/lib/task-store'
import AddressSearch from './AddressSearch'
import OvertimeWidget from './OvertimeWidget'

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsSheet({ open, onClose }: Props) {
  const router = useRouter()
  const { settings, updateSetting } = useSettings()
  const { currentUser, tasks, getOpenTaskCountForUser } = useTasks()
  const [tasksOpen, setTasksOpen] = useState(false)
  const openTasks = tasks.filter(task => isTaskAssignedToUser(task, currentUser) && isTaskOpen(task.status))
  const openTaskCount = getOpenTaskCountForUser(currentUser.id)

  // Lock body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={[
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />

      {/* Sheet */}
      <div
        className={[
          'fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl',
          'transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stroke" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stroke">
          <h2 className="text-base font-bold text-ink">Instellingen</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-surface text-ink-soft text-lg leading-none"
            aria-label="Sluiten"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 space-y-5 pb-10 max-h-[80vh] overflow-y-auto">

          {/* — Startlocatie — */}
          <div>
            <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Startlocatie
            </p>
            <div className="flex rounded-xl overflow-hidden border border-stroke">
              <button
                type="button"
                onClick={() => updateSetting('startLocation', 'atelier')}
                className={[
                  'flex-1 py-2.5 text-sm font-semibold transition-colors',
                  settings.startLocation === 'atelier'
                    ? 'bg-brand-orange text-white'
                    : 'bg-white text-ink',
                ].join(' ')}
              >
                Atelier
              </button>
              <button
                type="button"
                onClick={() => updateSetting('startLocation', 'thuis')}
                className={[
                  'flex-1 py-2.5 text-sm font-semibold transition-colors',
                  settings.startLocation === 'thuis'
                    ? 'bg-brand-orange text-white'
                    : 'bg-white text-ink',
                ].join(' ')}
              >
                Thuis
              </button>
            </div>

            {settings.startLocation === 'atelier' && (
              <p className="mt-2 text-xs text-ink-soft">
                {ATELIER_ADDRESS}
              </p>
            )}

            {settings.startLocation === 'thuis' && (
              <div className="mt-2">
                <AddressSearch
                  value={settings.homeAddress}
                  onChange={(addr) => updateSetting('homeAddress', addr)}
                />
              </div>
            )}
          </div>

          {/* — Gewenst startuur — */}
          <div>
            <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Gewenst startuur
            </p>
            <input
              type="time"
              value={settings.startTime}
              onChange={(e) => {
                if (/^\d{2}:\d{2}$/.test(e.target.value)) {
                  updateSetting('startTime', e.target.value)
                }
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-stroke bg-surface text-ink text-base font-semibold"
            />
          </div>

          {/* — Overuren — */}
          <div>
            <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Overuren
            </p>
            <OvertimeWidget startTime={settings.startTime} saldo={null} />
          </div>

          {/* — Open activiteiten — */}
          <div>
            <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Open activiteiten
            </p>

            <button
              type="button"
              onClick={() => setTasksOpen(prev => !prev)}
              className="w-full rounded-xl border border-stroke bg-surface px-3 py-3 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-sm text-ink">Open activiteiten</span>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-brand-orange px-2 py-0.5 text-xs font-bold text-white">
                    {openTaskCount}
                  </span>
                  <span className="text-sm text-ink-soft">{tasksOpen ? '▾' : '▸'}</span>
                </div>
              </div>
            </button>

            {tasksOpen && (
              <div className="mt-2 space-y-2">
                {openTasks.length === 0 && (
                  <p className="rounded-xl border border-stroke bg-white px-3 py-2 text-xs text-ink-soft">
                    Geen open activiteiten op dit moment.
                  </p>
                )}

                {openTasks.map(task => {
                  const intervention = task.interventionId ? getInterventionById(task.interventionId) : undefined
                  const dueDateLabel = task.dueDate
                    ? new Date(task.dueDate).toLocaleDateString('nl-BE')
                    : 'Geen einddatum'

                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => {
                        onClose()
                        router.push(task.interventionId ? `/interventions/${task.interventionId}?activity=${task.id}#activiteiten` : '/activiteiten')
                      }}
                      className="w-full rounded-xl border border-stroke bg-white px-3 py-2 text-left"
                    >
                      <p className="font-medium text-sm text-ink">{task.title}</p>
                      <p className="mt-1 text-xs text-ink-soft">{intervention?.customerName ?? 'Onbekende klant'}</p>
                      <p className="mt-1 text-xs text-ink-soft">Tegen {dueDateLabel}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
