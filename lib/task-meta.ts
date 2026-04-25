import type { Task, TaskPriority, TaskStatus, TaskType, User } from '@/types'

export const TASK_PRIORITY_OPTIONS: Array<{
  value: TaskPriority
  label: string
  activeClass: string
  inactiveClass: string
}> = [
  { value: 'laag', label: 'Laag', activeClass: 'bg-brand-green text-white border-brand-green', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'normaal', label: 'Normaal', activeClass: 'bg-brand-blue text-white border-brand-blue', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'hoog', label: 'Hoog', activeClass: 'bg-brand-orange text-white border-brand-orange', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'dringend', label: 'Dringend', activeClass: 'bg-brand-red text-white border-brand-red', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
]

export const TASK_STATUS_OPTIONS: Array<{
  value: TaskStatus
  label: string
  activeClass: string
  inactiveClass: string
}> = [
  { value: 'open', label: 'Open', activeClass: 'bg-stroke text-ink border-stroke', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'gepland', label: 'Gepland', activeClass: 'bg-brand-blue text-white border-brand-blue', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'bezig', label: 'Bezig', activeClass: 'bg-brand-orange text-white border-brand-orange', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'wacht_op_info', label: 'Wacht op info', activeClass: 'bg-brand-red text-white border-brand-red', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'klaar', label: 'Klaar', activeClass: 'bg-brand-green text-white border-brand-green', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'geannuleerd', label: 'Geannuleerd', activeClass: 'bg-brand-dark text-white border-brand-dark', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
]

export const TASK_TYPE_OPTIONS: Array<{
  value: TaskType
  label: string
}> = [
  { value: 'email', label: 'E-mail' },
  { value: 'bellen', label: 'Bellen' },
  { value: 'bericht', label: 'Bericht' },
  { value: 'afspraak', label: 'Afspraak' },
  { value: 'todo', label: 'To do' },
  { value: 'bestelling', label: 'Bestelling' },
  { value: 'offerte', label: 'Offerte' },
]

export function getTaskPriorityLabel(priority: TaskPriority): string {
  return TASK_PRIORITY_OPTIONS.find(option => option.value === priority)?.label ?? priority
}

export function getTaskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_OPTIONS.find(option => option.value === status)?.label ?? status
}

export function getTaskTypeLabel(type: TaskType): string {
  return TASK_TYPE_OPTIONS.find(option => option.value === type)?.label ?? type
}

export function isTaskOpen(status: TaskStatus): boolean {
  return status !== 'klaar' && status !== 'geannuleerd'
}

export function isTaskAssignedToUser(task: Task, user: User): boolean {
  if (task.assigneeType === 'group') {
    return task.assigneeRole === user.role
  }

  return task.assigneeUserId === user.id
}

export function canManageTask(task: Task, user: User): boolean {
  return (
    user.role === 'admin' ||
    task.createdByUserId === user.id ||
    isTaskAssignedToUser(task, user)
  )
}
