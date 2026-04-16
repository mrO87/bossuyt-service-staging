'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AvatarMenu from '@/components/AvatarMenu'
import { getInterventionById } from '@/lib/mock-data'
import { canManageTask, getTaskStatusLabel, getTaskTypeLabel, isTaskAssignedToUser, isTaskOpen } from '@/lib/task-meta'
import { useTasks } from '@/lib/task-store'
import type { Task } from '@/types'

function BossuytLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <text x="1" y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="1" y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
    </svg>
  )
}

function formatDueDate(value?: string): string {
  if (!value) return 'Geen vervaldatum'

  return new Date(value).toLocaleDateString('nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function ActivityRow({ task }: { task: Task }) {
  const { currentUser } = useTasks()
  const intervention = task.interventionId ? getInterventionById(task.interventionId) : undefined

  return (
    <Link
      href={task.interventionId ? `/interventions/${task.interventionId}?activity=${task.id}#activiteiten` : '/'}
      className="rounded-xl border border-stroke bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-base text-ink">{task.title}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {getTaskTypeLabel(task.type)} • {getTaskStatusLabel(task.status)}
          </p>
        </div>
        <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft">
          {formatDueDate(task.dueDate)}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-1 text-xs text-ink-soft">
        {intervention && <p>Klant: {intervention.customerName}</p>}
        <p>{canManageTask(task, currentUser) ? 'Je kan deze activiteit aanpassen' : 'Alleen bekijken'}</p>
      </div>
    </Link>
  )
}

export default function ActivitiesPage() {
  const router = useRouter()
  const { currentUser, tasks } = useTasks()

  const myTasks = useMemo(() => (
    tasks.filter(task => isTaskAssignedToUser(task, currentUser))
  ), [currentUser, tasks])

  const openTasks = myTasks.filter(task => isTaskOpen(task.status))
  const closedTasks = myTasks.filter(task => !isTaskOpen(task.status))

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-brand-dark px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BossuytLogo />
          <div>
            <p className="font-bold text-base leading-tight tracking-wide text-white">bossuyt</p>
            <p className="text-xs leading-tight text-ink-soft">activiteiten</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 rounded-lg bg-brand-mid px-3 py-1.5 text-sm font-medium text-white"
          >
            ← Terug
          </button>
          <AvatarMenu />
        </div>
      </header>

      <main className="px-4 py-4 flex flex-col gap-4 pb-8">
        <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <p className="text-xs text-ink-soft">Mijn open activiteiten</p>
          <p className="mt-1 text-3xl font-bold text-ink">{openTasks.length}</p>
        </div>

        <section className="flex flex-col gap-3">
          <div>
            <p className="font-bold text-sm text-ink">Open</p>
            <p className="text-xs text-ink-soft">Tik op een activiteit om meteen de juiste werkbon te openen.</p>
          </div>

          {openTasks.length === 0 && (
            <p className="rounded-xl border border-stroke bg-white px-4 py-5 text-sm text-ink-soft shadow-sm">
              Je hebt geen open activiteiten.
            </p>
          )}

          {openTasks.map(task => (
            <ActivityRow key={`${task.id}-${task.updatedAt}`} task={task} />
          ))}
        </section>

        {closedTasks.length > 0 && (
          <section className="flex flex-col gap-3">
            <div>
              <p className="font-bold text-sm text-ink">Gesloten</p>
              <p className="text-xs text-ink-soft">Klaargezette of geannuleerde activiteiten.</p>
            </div>

            {closedTasks.map(task => (
              <ActivityRow key={`${task.id}-${task.updatedAt}`} task={task} />
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
