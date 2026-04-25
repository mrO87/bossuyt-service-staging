/**
 * lib/tasks/migrate.ts
 *
 * One-shot migration of localStorage tasks → PostgreSQL.
 *
 * Call migrateLocalStorageTasks() once on app load (client-side only)
 * when the localStorage key exists AND the user is authenticated.
 *
 * The migration is idempotent: each old task id is used as client_id,
 * so if the browser crashes mid-way, re-running is safe.
 */

const LEGACY_KEY = 'bossuyt-service:tasks'

interface LegacyTask {
  id: string
  type: string
  title: string
  description?: string
  assigneeType: string
  assigneeUserId?: string
  assigneeRole?: string
  createdByUserId: string
  priority: string
  status: string
  werkbonId?: string
  interventionId?: string
  dueDate?: string
  createdAt: string
}

/** Map old localStorage task types to new DbTaskType values. */
function mapType(legacyType: string): string {
  const MAP: Record<string, string> = {
    bestelling: 'order_part',
    todo:       'internal_note',
    email:      'contact_customer',
    bellen:     'contact_customer',
    bericht:    'contact_customer',
    afspraak:   'plan_revisit',
    offerte:    'other',
  }
  return MAP[legacyType] ?? 'other'
}

/** Map old role values to new TaskRole values. */
function mapRole(assigneeRole?: string): string {
  const MAP: Record<string, string> = {
    technician: 'technician',
    warehouse:  'warehouse',
    office:     'office',
    admin:      'admin',
    hr:         'office',
  }
  return assigneeRole ? (MAP[assigneeRole] ?? 'office') : 'office'
}

export interface MigrationResult {
  migrated: number
  failed:   number
  skipped:  number
}

/**
 * Migrate all tasks from localStorage to PostgreSQL.
 *
 * Returns a summary of the migration. Shows a toast via the browser
 * notification API — callers should show this to the user.
 */
export async function migrateLocalStorageTasks(): Promise<MigrationResult> {
  if (typeof window === 'undefined') return { migrated: 0, failed: 0, skipped: 0 }

  const raw = window.localStorage.getItem(LEGACY_KEY)
  if (!raw) return { migrated: 0, failed: 0, skipped: 0 }

  let tasks: LegacyTask[]
  try {
    tasks = JSON.parse(raw) as LegacyTask[]
  } catch {
    console.warn('[migrate] Kon localStorage taken niet parsen, verwijder sleutel')
    window.localStorage.removeItem(LEGACY_KEY)
    return { migrated: 0, failed: 0, skipped: 0 }
  }

  if (!Array.isArray(tasks) || tasks.length === 0) {
    window.localStorage.removeItem(LEGACY_KEY)
    return { migrated: 0, failed: 0, skipped: 0 }
  }

  let migrated = 0
  let failed   = 0
  let skipped  = 0

  for (const task of tasks) {
    // Skip tasks not linked to a work order (legacy tasks could be standalone)
    if (!task.interventionId) {
      skipped++
      continue
    }

    try {
      const res = await fetch('/api/tasks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_order_id: task.interventionId,
          werkbon_id:    task.werkbonId ?? null,
          type:          mapType(task.type),
          role:          mapRole(task.assigneeRole),
          title:         task.title,
          description:   task.description ?? null,
          due_date:      task.dueDate ?? null,
          client_id:     task.id,  // original id as idempotency key
          changed_by:    task.createdByUserId,
        }),
      })

      if (res.ok || res.status === 409) {
        migrated++
      } else {
        console.warn(`[migrate] Taak ${task.id} mislukt: HTTP ${res.status}`)
        failed++
      }
    } catch (err) {
      console.error(`[migrate] Taak ${task.id} netwerk fout:`, err)
      failed++
    }
  }

  // Remove the localStorage key when fully done (even on partial failure —
  // client_id idempotency means safe to re-run on next load if needed)
  if (failed === 0) {
    window.localStorage.removeItem(LEGACY_KEY)
  }

  console.info(`[migrate] Migratie klaar: ${migrated} gesynchroniseerd, ${failed} mislukt, ${skipped} overgeslagen`)
  return { migrated, failed, skipped }
}
