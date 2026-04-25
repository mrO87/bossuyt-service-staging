'use client'

import { useMemo, useState } from 'react'
import { getUserById, users } from '@/lib/mock-data'
import type { PdfPart } from '@/lib/pdf'
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

// ── Workflow task cards ────────────────────────────────────────────────────────

function LoadPartsCard({ task, onComplete }: { task: DbTask; onComplete: (t: DbTask) => void }) {
  const parts = (task.payload?.parts ?? []) as PdfPart[]
  const isPending = task.status === 'pending'
  const isDone = task.status === 'done' || task.status === 'skipped' || task.status === 'cancelled'
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState(true)

  function toggle(id: string) {
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function receiveAll() {
    setChecked(new Set(parts.map(p => p.id)))
    onComplete(task)
  }

  return (
    <div className="rounded-xl border border-stroke overflow-hidden">
      <button type="button" onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-3 text-left bg-surface">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${isPending ? 'bg-ink-faint' : 'bg-brand-orange'}`}>TK</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-ink">Onderdelen laden in bus</p>
          <p className="text-xs text-ink-soft">
            Technieker{parts.length > 0 && ` • ${parts.length} onderdeel${parts.length !== 1 ? 'en' : ''}`}
            {isPending && ' • ⏳ Wacht op magazijn'}
            {isDone && ' • ✓ Klaar'}
          </p>
        </div>
        <span className="text-ink-faint text-sm shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="bg-white">
          {isPending ? (
            <p className="px-3 py-3 border-t border-stroke/40 text-xs text-ink-soft">
              Het magazijn zet de onderdelen eerst klaar. Deze taak wordt automatisch actief zodra dat klaar is.
            </p>
          ) : parts.length > 0 ? (
            <>
              {parts.map(part => (
                <label key={part.id}
                  className="flex items-center gap-3 px-3 py-2.5 border-t border-stroke/40 cursor-pointer">
                  <input type="checkbox"
                    checked={checked.has(part.id) || isDone}
                    onChange={() => !isDone && toggle(part.id)}
                    disabled={isDone}
                    className="h-5 w-5 rounded accent-brand-orange" />
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${checked.has(part.id) || isDone ? 'line-through text-ink-soft' : 'text-ink'}`}>
                      {part.description}
                    </span>
                    {part.code && <span className="ml-2 text-xs text-ink-faint">#{part.code}</span>}
                  </div>
                  <span className="text-xs text-ink-soft shrink-0">×{part.quantity}</span>
                </label>
              ))}
              {!isDone && (
                <div className="flex justify-end gap-2 px-3 py-2.5 border-t border-stroke/40">
                  <button type="button" onClick={receiveAll}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-brand-green/10 text-brand-green">
                    ✅ Alles ontvangen
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-end px-3 py-2.5 border-t border-stroke/40">
              {!isDone
                ? <button type="button" onClick={() => onComplete(task)} className="text-xs text-brand-green">✅ Gereed</button>
                : <span className="text-xs text-ink-soft">✓ Klaar</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PickPartsCard({ task, onComplete }: { task: DbTask; onComplete: (t: DbTask) => void }) {
  const parts = (task.payload?.parts ?? []) as PdfPart[]
  const isDone = task.status === 'done' || task.status === 'skipped' || task.status === 'cancelled'
  const [checked, setChecked] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div className="rounded-xl border border-stroke bg-surface p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-bold text-white">MG</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">Onderdelen klaarzetten</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Magazijn{parts.length > 0 && ` • ${parts.length} onderdeel${parts.length !== 1 ? 'en' : ''}`}{isDone && ' • ✓ Klaar'}
          </p>

          {parts.length > 0 && (
            <div className="mt-2 rounded-lg border border-stroke bg-white overflow-hidden">
              {parts.map(part => (
                <label key={part.id}
                  className="flex items-center gap-3 px-3 py-2.5 border-b border-stroke/40 last:border-b-0 cursor-pointer">
                  <input type="checkbox"
                    checked={checked.has(part.id) || isDone}
                    onChange={() => !isDone && toggle(part.id)}
                    disabled={isDone}
                    className="h-5 w-5 rounded accent-brand-orange" />
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${checked.has(part.id) || isDone ? 'line-through text-ink-soft' : 'text-ink'}`}>
                      {part.description}
                    </span>
                    {part.code && <span className="ml-2 text-xs text-ink-faint">#{part.code}</span>}
                  </div>
                  <span className="text-xs text-ink-soft shrink-0">×{part.quantity}</span>
                </label>
              ))}
            </div>
          )}

          {!isDone && (
            <div className="mt-2 flex gap-3 text-xs font-medium">
              <button type="button"
                onClick={() => { setChecked(new Set(parts.map(p => p.id))); onComplete(task) }}
                className="text-brand-green">
                ✅ {parts.length > 0 ? 'Alles klaargelegd' : 'Gereed'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlanRevisitCard({ task, onComplete }: { task: DbTask; onComplete: (t: DbTask) => void }) {
  const isDone = task.status === 'done' || task.status === 'skipped' || task.status === 'cancelled'
  return (
    <div className="rounded-xl border border-stroke bg-surface p-3 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-orange text-xs font-bold text-white">OF</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">Opvolgbon inplannen</p>
        <p className="mt-0.5 text-xs text-ink-soft">Office / Planning{isDone ? ' • ✓ Klaar' : ''}</p>
        {!isDone && (
          <div className="mt-1.5 flex gap-3 text-xs font-medium">
            <button type="button" onClick={() => onComplete(task)} className="text-brand-green">✅ Gereed</button>
            <span className="text-ink-faint cursor-not-allowed" title="Binnenkort beschikbaar">→ Naar planning</span>
          </div>
        )}
      </div>
    </div>
  )
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
          if (task.type === 'pick_parts') {
            return <PickPartsCard key={task.id} task={task} onComplete={handleCompleteDbTask} />
          }
          if (task.type === 'load_parts') {
            return <LoadPartsCard key={task.id} task={task} onComplete={handleCompleteDbTask} />
          }
          if (task.type === 'plan_revisit') {
            return <PlanRevisitCard key={task.id} task={task} onComplete={handleCompleteDbTask} />
          }
          return null
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
