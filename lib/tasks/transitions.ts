/**
 * lib/tasks/transitions.ts
 *
 * Pure function: maps (currentStatus, action) → nextStatus.
 * Returns null if the transition is not allowed.
 *
 * No database. No network. No side effects.
 * This makes it safe to call from both server and client code.
 */
import type { DbTaskStatus } from '@/types'

export type TaskAction = 'start' | 'complete' | 'skip' | 'block' | 'cancel' | 'reopen'

// All legal transitions in one table.
// Missing action = forbidden transition.
const TRANSITIONS: Record<DbTaskStatus, Partial<Record<TaskAction, DbTaskStatus>>> = {
  pending:     { cancel: 'cancelled' },
  ready:       { start: 'in_progress', cancel: 'cancelled' },
  in_progress: {
    complete: 'done',
    skip:     'skipped',
    block:    'blocked',
    cancel:   'cancelled',
  },
  done:        { reopen: 'in_progress' },
  skipped:     { reopen: 'in_progress' },
  blocked:     { start: 'in_progress', cancel: 'cancelled' },
  cancelled:   {},
}

/**
 * Returns the next status after applying `action` to `current`,
 * or null when the transition is not allowed.
 */
export function getNextStatus(
  current: DbTaskStatus,
  action: TaskAction,
): DbTaskStatus | null {
  return TRANSITIONS[current]?.[action] ?? null
}
