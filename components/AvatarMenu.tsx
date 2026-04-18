'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSettings } from '@/lib/hooks/useSettings'
import { getInterventionById } from '@/lib/mock-data'
import { isTaskAssignedToUser, isTaskOpen } from '@/lib/task-meta'
import { useTasks } from '@/lib/task-store'
import AddressSearch from '@/components/SettingsSheet/AddressSearch'
import OvertimeWidget from '@/components/SettingsSheet/OvertimeWidget'

function getRoleLabel(role: string): string {
  switch (role) {
    case 'technician': return 'Technieker'
    case 'admin': return 'Admin'
    case 'office': return 'Office'
    case 'warehouse': return 'Magazijn'
    case 'hr': return 'HR'
    default: return role
  }
}

export default function AvatarMenu() {
  const router = useRouter()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const { settings, updateSetting } = useSettings()
  const { currentUser, tasks, getOpenTaskCountForUser } = useTasks()

  const openTasks = useMemo(() => (
    tasks.filter(task => isTaskAssignedToUser(task, currentUser) && isTaskOpen(task.status))
  ), [currentUser, tasks])

  const openTaskCount = getOpenTaskCountForUser(currentUser.id)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="relative w-10 h-10 rounded-full flex items-center justify-center bg-brand-orange text-white shadow-sm"
        aria-label="Open gebruikersmenu"
      >
        <span className="text-sm font-bold">{currentUser.initials}</span>
        {openTaskCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-brand-red text-[10px] font-bold text-white flex items-center justify-center">
            {openTaskCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-80 rounded-2xl border border-stroke bg-white p-4 shadow-xl max-h-[85vh] overflow-y-auto">
          <div className="border-b border-stroke pb-3 mb-4">
            <p className="font-bold text-sm text-ink">{currentUser.name}</p>
            <p className="text-xs text-ink-soft">{getRoleLabel(currentUser.role)}</p>
          </div>

          {/* — Startlocatie — */}
          <div className="mb-5">
            <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-2">
              Startlocatie
            </p>
            <div className="flex rounded-xl overflow-hidden border border-stroke">
              <button
                type="button"
                onClick={() => {
                  updateSetting('startLocation', 'atelier')
                  updateSetting('homeAddress', null)
                }}
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
                Bossuyt Kitchen, Noordlaan 19, 8520 Kuurne
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
          <div className="mb-5">
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
          <div className="mb-5">
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
                        setOpen(false)
                        setTasksOpen(false)
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
      )}
    </div>
  )
}
