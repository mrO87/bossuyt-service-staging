'use client'

import { useMemo, useState } from 'react'
import { getUserById, users } from '@/lib/mock-data'
import { TASK_TYPE_OPTIONS, canManageTask, getTaskStatusLabel, isTaskOpen } from '@/lib/task-meta'
import { useTasks } from '@/lib/task-store'
import type { DbTask, Intervention, Task, TaskStatus, TaskType, User } from '@/types'
import PartsOrderCard from './PartsOrderCard'
import Section from './Section'

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ActivityEditorState {
  type: TaskType
  title: string
  description: string
  assigneeValue: string
  dueDate: string
  status: TaskStatus
}

const GROUP_ASSIGNMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'group:technician', label: 'Groep - Techniekers' },
  { value: 'group:admin', label: 'Groep - Admin' },
  { value: 'group:office', label: 'Groep - Office' },
  { value: 'group:warehouse', label: 'Groep - Magazijn' },
  { value: 'group:hr', label: 'Groep - HR' },
]

function getRoleLabel(role: User['role']): string {
  switch (role) {
    case 'technician': return 'Techniekers'
    case 'admin': return 'Admin'
    case 'office': return 'Office'
    case 'warehouse': return 'Magazijn'
    case 'hr': return 'HR'
    default: return role
  }
}

function getAssignmentValue(task: Pick<Task, 'assigneeType' | 'assigneeUserId' | 'assigneeRole'>): string {
  if (task.assigneeType === 'group' && task.assigneeRole) return `group:${task.assigneeRole}`
  return `user:${task.assigneeUserId ?? ''}`
}

function parseAssignmentValue(value: string): Pick<Task, 'assigneeType' | 'assigneeUserId' | 'assigneeRole'> {
  if (value.startsWith('group:')) {
    return { assigneeType: 'group', assigneeRole: value.replace('group:', '') as User['role'], assigneeUserId: undefined }
  }
  return { assigneeType: 'user', assigneeUserId: value.replace('user:', ''), assigneeRole: undefined }
}

function getAssignmentLabel(task: Pick<Task, 'assigneeType' | 'assigneeUserId' | 'assigneeRole'>): string {
  if (task.assigneeType === 'group' && task.assigneeRole) return getRoleLabel(task.assigneeRole)
  return getUserById(task.assigneeUserId ?? '')?.name ?? 'Onbekende gebruiker'
}

function buildEditorState(task: Task): ActivityEditorState {
  return {
    type: task.type,
    title: task.title,
    description: task.description ?? '',
    assigneeValue: getAssignmentValue(task),
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
    status: task.status,
  }
}

function createEmptyEditorState(currentUserId: string): ActivityEditorState {
  return { type: 'todo', title: '', description: '', assigneeValue: `user:${currentUserId}`, dueDate: '', status: 'open' }
}

function formatActivityDueDate(value?: string): string {
  if (!value) return 'Geen vervaldatum'
  return new Date(value).toLocaleDateString('nl-BE')
}

// ── Component ─────────────────────────────────────────────────────────────────

const DB_TASK_TYPE_LABELS: Partial<Record<DbTask['type'], string>> = {
  load_parts:   'Onderdelen laden in bus',
  plan_revisit: 'Opvolgbon inplannen',
}

const DB_TASK_ROLE_LABELS: Record<string, string> = {
  technician: 'Technieker',
  office:     'Office / Planning',
  warehouse:  'Magazijn',
  admin:      'Admin',
}

const DB_TASK_STATUS_LABELS: Record<string, string> = {
  pending:     'Wachtend',
  ready:       'Klaar voor actie',
  in_progress: 'Bezig',
  done:        'Gedaan',
  skipped:     'Overgeslagen',
  cancelled:   'Geannuleerd',
  blocked:     'Geblokkeerd',
}

interface Props {
  intervention: Intervention
  werkbonId: string
  orderTasks: DbTask[]
  workflowTasks?: DbTask[]
  onWorkflowTaskComplete?: () => void
  initialActivityId?: string
}

export default function TaskManager({ intervention, werkbonId, orderTasks, workflowTasks = [], onWorkflowTaskComplete, initialActivityId }: Props) {
  const { currentUser, tasks, createTask, updateTask } = useTasks()

  async function handleCompleteDbTask(task: DbTask) {
    try {
      const res = await fetch(`/api/tasks/${task.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', completed_by: currentUser.id, changed_by: currentUser.id }),
      })
      if (res.ok) onWorkflowTaskComplete?.()
    } catch { /* ignore */ }
  }

  const [editingTaskId, setEditingTaskId] = useState<string | 'new' | null>(() => initialActivityId ?? null)
  const [taskError, setTaskError] = useState('')
  const [editorState, setEditorState] = useState<ActivityEditorState | null>(() => {
    const initialTask = initialActivityId
      ? tasks.find(task => task.werkbonId === werkbonId && task.id === initialActivityId)
      : undefined
    return initialTask ? buildEditorState(initialTask) : null
  })

  const linkedTasks = useMemo(() => (
    [...tasks.filter(task => task.werkbonId === werkbonId)]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  ), [tasks, werkbonId])

  const openTaskCount = linkedTasks.filter(task => isTaskOpen(task.status)).length

  function updateEditorField<K extends keyof ActivityEditorState>(field: K, value: ActivityEditorState[K]) {
    setEditorState(prev => prev ? { ...prev, [field]: value } : prev)
  }

  function openTaskEditor(task: Task) {
    setEditingTaskId(task.id)
    setEditorState(buildEditorState(task))
    setTaskError('')
  }

  function openNewTaskEditor() {
    setEditingTaskId('new')
    setEditorState(createEmptyEditorState(currentUser.id))
    setTaskError('')
  }

  function closeTaskEditor() {
    setEditingTaskId(null)
    setEditorState(null)
  }

  function handleMarkTaskDone(task: Task) {
    if (!canManageTask(task, currentUser)) return
    const description = editingTaskId === task.id ? editorState?.description : task.description
    const assignment = editingTaskId === task.id && editorState
      ? parseAssignmentValue(editorState.assigneeValue)
      : { assigneeType: task.assigneeType, assigneeUserId: task.assigneeUserId, assigneeRole: task.assigneeRole }

    updateTask(task.id, {
      type: editingTaskId === task.id ? editorState?.type : task.type,
      title: editingTaskId === task.id ? editorState?.title : task.title,
      description,
      ...assignment,
      dueDate: editingTaskId === task.id ? editorState?.dueDate : task.dueDate,
      status: 'klaar',
    })
    closeTaskEditor()
  }

  function handleCancelTask(task: Task) {
    if (!canManageTask(task, currentUser)) return
    updateTask(task.id, { status: 'geannuleerd' })
    closeTaskEditor()
  }

  function handleSaveTask(task: Task) {
    if (!editorState || !canManageTask(task, currentUser)) return
    if (!editorState.title.trim()) { setTaskError('Geef eerst een samenvatting voor de activiteit in.'); return }
    if (!editorState.dueDate) { setTaskError('Kies eerst een vervaldatum voor de activiteit.'); return }

    const assignment = parseAssignmentValue(editorState.assigneeValue)
    updateTask(task.id, {
      type: editorState.type,
      title: editorState.title,
      description: editorState.description,
      ...assignment,
      dueDate: editorState.dueDate,
      status: editorState.status,
    })
    setTaskError('')
    closeTaskEditor()
  }

  function handleCreateActivity() {
    if (!editorState || editingTaskId !== 'new') return
    if (!editorState.title.trim()) { setTaskError('Geef eerst een samenvatting voor de activiteit in.'); return }
    if (!editorState.dueDate) { setTaskError('Kies eerst een vervaldatum voor de activiteit.'); return }

    const assignment = parseAssignmentValue(editorState.assigneeValue)
    createTask({
      type: editorState.type,
      title: editorState.title,
      description: editorState.description,
      ...assignment,
      createdByUserId: currentUser.id,
      priority: 'normaal',
      dueDate: editorState.dueDate,
      werkbonId,
      interventionId: intervention.id,
    })
    setTaskError('')
    closeTaskEditor()
  }

  function AssigneeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className="rounded-lg px-3 py-2 text-sm outline-none bg-surface border border-stroke text-ink">
        <optgroup label="Personen">
          {users.filter(u => u.active).map(u => (
            <option key={u.id} value={`user:${u.id}`}>{u.name}</option>
          ))}
        </optgroup>
        <optgroup label="Groepen">
          {GROUP_ASSIGNMENT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
      </select>
    )
  }

  return (
    <Section
      id="activiteiten"
      title="ACTIVITEITEN"
      collapsible
      defaultOpen
      badge={`${openTaskCount} open`}
      actionLabel="Nieuwe activiteit"
      onActionClick={openNewTaskEditor}
    >
      <div className="flex flex-col gap-3">
        <PartsOrderCard
          orderTasks={orderTasks}
          intervention={intervention}
          showSupplier={currentUser?.role === 'warehouse' || currentUser?.role === 'admin'}
        />

        {workflowTasks.map(task => {
          const isDone = task.status === 'done' || task.status === 'skipped' || task.status === 'cancelled'
          return (
            <div key={task.id} className={`rounded-xl border p-3 flex items-start gap-3 ${isDone ? 'border-stroke bg-surface opacity-60' : 'border-stroke bg-surface'}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-orange text-xs font-bold text-white">
                {task.role === 'technician' ? 'TK' : task.role === 'office' ? 'OF' : task.role.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  <span className="font-bold">{DB_TASK_TYPE_LABELS[task.type] ?? task.title}</span>
                  <span className="text-ink-soft"> – </span>
                  <span className="text-xs text-ink-soft">{DB_TASK_ROLE_LABELS[task.role] ?? task.role}</span>
                </p>
                {task.description && <p className="mt-0.5 text-xs text-ink-soft">{task.description}</p>}
                <div className="mt-1 flex gap-x-3 text-xs">
                  {!isDone ? (
                    <button type="button" onClick={() => handleCompleteDbTask(task)} className="text-brand-green">✅ Gereed</button>
                  ) : (
                    <span className="text-ink-soft">{DB_TASK_STATUS_LABELS[task.status] ?? task.status}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {linkedTasks.length === 0 && orderTasks.length === 0 && workflowTasks.length === 0 && (
          <p className="text-sm text-center py-2 text-ink-faint">Nog geen activiteiten op deze werkbon</p>
        )}

        {/* New task editor */}
        {editingTaskId === 'new' && editorState && (
          <div className="rounded-xl border border-brand-orange/30 bg-white p-3">
            <p className="text-sm font-bold text-ink">Nieuwe activiteit</p>
            <p className="mt-1 text-xs text-ink-soft">Deze activiteit verschijnt meteen bij de verantwoordelijke gebruiker.</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-soft">Soort taak</span>
                <select value={editorState.type} onChange={e => updateEditorField('type', e.target.value as TaskType)}
                  className="rounded-lg px-3 py-2 text-sm outline-none bg-surface border border-stroke text-ink">
                  {TASK_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-soft">Verval datum</span>
                <input type="date" value={editorState.dueDate} onChange={e => updateEditorField('dueDate', e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm outline-none bg-surface border border-stroke text-ink" />
              </label>
            </div>

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">Samenvatting</span>
              <input value={editorState.title} onChange={e => updateEditorField('title', e.target.value)}
                placeholder="Bijvoorbeeld: bestellen onderdelen"
                className="rounded-lg px-3 py-2 text-sm outline-none bg-surface border border-stroke text-ink" />
            </label>

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">Toegewezen aan</span>
              <AssigneeSelect value={editorState.assigneeValue} onChange={v => updateEditorField('assigneeValue', v)} />
            </label>

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">Notitie</span>
              <textarea rows={4} value={editorState.description} onChange={e => updateEditorField('description', e.target.value)}
                placeholder="Schrijf hier extra context, opvolging of afspraken..."
                className="rounded-lg px-3 py-2 text-sm outline-none resize-none bg-surface border border-stroke text-ink" />
            </label>

            {taskError && <p className="mt-3 text-xs font-medium text-brand-red">{taskError}</p>}

            <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium">
              <button type="button" onClick={handleCreateActivity} className="text-brand-orange">Opslaan</button>
              <button type="button" onClick={closeTaskEditor} className="text-ink-soft">Sluiten</button>
            </div>
          </div>
        )}

        {/* Task list */}
        {linkedTasks.map(task => {
          const canManage = canManageTask(task, currentUser)
          const isEditing = editingTaskId === task.id && editorState !== null
          const creator = getUserById(task.createdByUserId)
          const assignmentLabel = getAssignmentLabel(task)
          const dueDateLabel = formatActivityDueDate(task.dueDate)

          return (
            <div key={task.id}
              className={`rounded-xl p-3 flex flex-col gap-3 bg-surface border ${editingTaskId === task.id ? 'border-brand-orange ring-1 ring-brand-orange/30' : 'border-stroke'}`}>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-orange text-xs font-bold text-white">
                  {creator?.initials ?? '??'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="text-xs text-ink-soft">{dueDateLabel}</span>{' '}
                    <span className="font-bold">{task.title}</span>
                    <span className="text-ink-soft"> – </span>
                    <span className="text-xs text-ink-soft">{assignmentLabel}</span>
                  </p>
                  <div className="mt-1 flex gap-x-3 text-xs">
                    {canManage && !isEditing && (
                      <>
                        <button type="button" onClick={() => handleMarkTaskDone(task)} className="text-brand-green">✅ Gereed</button>
                        <button type="button" onClick={() => openTaskEditor(task)} className="text-ink-soft">✏️ Bewerken</button>
                        <button type="button" onClick={() => handleCancelTask(task)} className="text-brand-red">❌ Annuleren</button>
                      </>
                    )}
                    {!canManage && <span className="text-ink-soft">{getTaskStatusLabel(task.status)}</span>}
                  </div>
                </div>
              </div>

              {/* Edit form for existing task */}
              {isEditing && editorState && (
                <div className="rounded-xl border border-brand-orange/30 bg-white p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-ink-soft">Soort taak</span>
                      <select value={editorState.type} onChange={e => updateEditorField('type', e.target.value as TaskType)}
                        className="rounded-lg px-3 py-2 text-sm outline-none bg-surface border border-stroke text-ink">
                        {TASK_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-ink-soft">Verval datum</span>
                      <input type="date" value={editorState.dueDate} onChange={e => updateEditorField('dueDate', e.target.value)}
                        className="rounded-lg px-3 py-2 text-sm outline-none bg-surface border border-stroke text-ink" />
                    </label>
                  </div>

                  <label className="mt-3 flex flex-col gap-1">
                    <span className="text-xs font-medium text-ink-soft">Samenvatting</span>
                    <input value={editorState.title} onChange={e => updateEditorField('title', e.target.value)}
                      placeholder="Bijvoorbeeld: bestellen onderdelen"
                      className="rounded-lg px-3 py-2 text-sm outline-none bg-surface border border-stroke text-ink" />
                  </label>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-ink-soft">Toegewezen aan</span>
                      <AssigneeSelect value={editorState.assigneeValue} onChange={v => updateEditorField('assigneeValue', v)} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-ink-soft">Status</span>
                      <select value={editorState.status} onChange={e => updateEditorField('status', e.target.value as TaskStatus)}
                        className="rounded-lg px-3 py-2 text-sm outline-none bg-surface border border-stroke text-ink">
                        <option value="open">Open</option>
                        <option value="gepland">Gepland</option>
                        <option value="bezig">Bezig</option>
                        <option value="wacht_op_info">Wacht op info</option>
                      </select>
                    </label>
                  </div>

                  <label className="mt-3 flex flex-col gap-1">
                    <span className="text-xs font-medium text-ink-soft">Notitie</span>
                    <textarea rows={4} value={editorState.description} onChange={e => updateEditorField('description', e.target.value)}
                      placeholder="Schrijf hier extra context, opvolging of afspraken..."
                      className="rounded-lg px-3 py-2 text-sm outline-none resize-none bg-surface border border-stroke text-ink" />
                  </label>

                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium">
                    <button type="button" onClick={() => handleMarkTaskDone(task)} className="text-brand-green">✅ Gereed</button>
                    <button type="button" onClick={() => handleCancelTask(task)} className="text-brand-red">❌ Annuleren</button>
                    <button type="button" onClick={() => handleSaveTask(task)} className="text-brand-orange">Opslaan</button>
                    <button type="button" onClick={closeTaskEditor} className="text-ink-soft">Sluiten</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}
