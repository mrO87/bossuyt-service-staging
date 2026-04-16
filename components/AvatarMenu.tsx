'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getInterventionById } from '@/lib/mock-data'
import { getTaskPriorityLabel, isTaskAssignedToUser, isTaskOpen } from '@/lib/task-meta'
import { useTasks } from '@/lib/task-store'

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
  const { currentUser, tasks, getOpenTaskCountForUser } = useTasks()

  const openTasks = useMemo(() => (
    tasks.filter(task => isTaskAssignedToUser(task, currentUser) && isTaskOpen(task.status)).slice(0, 3)
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
        <div className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-stroke bg-white p-3 shadow-xl">
          <div className="border-b border-stroke pb-3">
            <p className="font-bold text-sm text-ink">{currentUser.name}</p>
            <p className="text-xs text-ink-soft">{getRoleLabel(currentUser.role)}</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              router.push('/activiteiten')
            }}
            className="mt-3 w-full rounded-xl border border-stroke bg-surface px-3 py-2 text-left"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-sm text-ink">Open activiteiten</span>
              <span className="rounded-full bg-brand-orange px-2 py-0.5 text-xs font-bold text-white">
                {openTaskCount}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">Bekijk je activiteitenlijst en werk ze daar verder af.</p>
          </button>

          <div className="mt-3 flex flex-col gap-2">
            {openTasks.length === 0 && (
              <p className="rounded-xl bg-surface px-3 py-3 text-xs text-ink-soft">
                Geen open activiteiten op dit moment.
              </p>
            )}

            {openTasks.map(task => {
              const intervention = task.interventionId ? getInterventionById(task.interventionId) : undefined

              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    router.push(task.interventionId ? `/interventions/${task.interventionId}?activity=${task.id}#activiteiten` : '/activiteiten')
                  }}
                  className="rounded-xl border border-stroke px-3 py-2 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm text-ink">{task.title}</p>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                      {getTaskPriorityLabel(task.priority)}
                    </span>
                  </div>
                  {intervention && (
                    <p className="mt-1 text-xs text-ink-soft">{intervention.customerName}</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
