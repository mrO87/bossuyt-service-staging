/**
 * lib/idb.ts — IndexedDB helpers
 *
 * IndexedDB is the browser's built-in offline database.
 * We use the `idb` package which wraps IndexedDB in a clean Promise API
 * (the native IndexedDB API is callback-based and painful to use).
 *
 * Stores we create:
 *   - "interventions"  : the day's work orders (planned + open pool)
 *   - "werkbonnen"     : form data filled in by the technician
 *   - "pendingWrites"  : actions done offline, waiting to sync to server
 *   - "dayMeta"        : metadata about the last sync (date, technician, etc.)
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type {
  Intervention,
  WerkbonFormState,
  WorkOrderPhotoDraft,
  WorkOrderPhotoSyncStatus,
} from '@/types'

// ---------- Schema ----------
// This tells TypeScript exactly what's in each store.
// Think of it like table definitions in a SQL database.
interface BossuytDB extends DBSchema {
  interventions: {
    key: string                 // the intervention id
    value: Intervention
    indexes: {
      'by-source': string       // index on source ('planned' | 'reactive')
      'by-status': string       // index on status
    }
  }
  werkbonnen: {
    key: string                 // intervention id (1-to-1)
    value: WerkbonDraft
  }
  workOrderPhotos: {
    key: string
    value: WorkOrderPhotoDraft
    indexes: {
      'by-workOrderId': string
      'by-syncStatus': WorkOrderPhotoSyncStatus
    }
  }
  photoBlobs: {
    key: string
    value: Blob
  }
  pendingWrites: {
    key: number                 // auto-incremented
    value: PendingWrite
    autoIncrement: true
  }
  dayMeta: {
    key: string                 // always 'current'
    value: DayMeta
  }
  task_commands: {
    key: string                 // clientId (UUID)
    value: TaskCommand
  }
  intakeUploads: {
    key: string                 // clientId (UUID)
    value: IntakeUploadDraft
  }
}

/**
 * A photographed or scanned work order waiting to reach the server.
 *
 * Reading a bon needs docling, so an upload cannot be completed offline — but
 * it can be *kept*. The technician photographs a bon in a machine room with no
 * signal; this holds the file until there is one. `clientId` travels with it, so
 * a retry after a half-finished request finds the existing upload on the server
 * instead of creating a second one.
 */
export interface IntakeUploadDraft {
  clientId: string
  fileName: string
  mimeType: string
  size: number
  file: Blob
  createdAt: string
  lastError?: string
}

export interface WerkbonDraft {
  interventionId: string
  form: WerkbonFormState
  lastSavedAt: string
}

export interface PendingWrite {
  id?: number
  /**
   * 'update_planning' states a technician's whole day — which work orders and
   * in what order. Anything left out goes back to the open pool. Because it is
   * a result rather than a change, a newer one can simply replace an older one:
   * see PLANNING_WRITE_TYPES.
   *
   * 'update_sequence' is what that write was called when it could only reorder.
   * The payload shape never changed, so writes queued on a phone before the
   * update still replay; nothing new is ever enqueued under that name.
   */
  type:
    | 'patch_status'
    | 'remove_intervention'
    | 'submit_werkbon'
    | 'update_planning'
    | 'update_sequence'
    | 'update_estimate'
    | 'upload_work_order_photo'
    | 'delete_work_order_photo'
  payload: Record<string, unknown>
  createdAt: string
  attempts: number
}

/**
 * Every name a pending planning write can carry. Only one such write is ever
 * queued at a time: dragging twenty times offline has to arrive as one call,
 * not twenty that each carry a version number the previous one invalidated.
 */
export const PLANNING_WRITE_TYPES = ['update_planning', 'update_sequence'] as const

export interface PendingWriteResult {
  synced: number
  failed: number
  notice?: string
  conflict?: boolean
}

export interface TaskCommand {
  clientId: string                    // crypto.randomUUID() — doubles as idempotency key
  endpoint: string                    // e.g. '/api/tasks'
  method: string                      // 'POST' | 'PATCH'
  body: Record<string, unknown>
  createdAt: string                   // ISO — replay in this order
  synced: boolean
  error?: string                      // set on permanent 4xx failure
}

export interface DayMeta {
  date: string              // YYYY-MM-DD
  technicianId: string
  cachedAt: string
  totalPlanned: number
  totalOpen: number
}

// ---------- Singleton ----------
// We open the DB once and reuse the connection.
// Version number: increment this when you change the schema.
let dbPromise: Promise<IDBPDatabase<BossuytDB>> | null = null

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

function normalizeIntervention(item: Intervention): Intervention {
  return {
    ...item,
    technicians: item.technicians.map(technician => ({
      ...technician,
      initials: deriveInitials(technician.name),
    })),
  }
}

export function getDB(): Promise<IDBPDatabase<BossuytDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BossuytDB>('bossuyt-service', 4, {
      upgrade(db, oldVersion) {
        // "interventions" store
        if (!db.objectStoreNames.contains('interventions')) {
          const intStore = db.createObjectStore('interventions', { keyPath: 'id' })
          intStore.createIndex('by-source', 'source')
          intStore.createIndex('by-status', 'status')
        }

        // "werkbonnen" store — one draft per intervention.
        // v3 changed the record shape (WerkbonCache → WerkbonDraft); the old
        // store was never written to, so dropping it loses nothing.
        if (oldVersion < 3 && db.objectStoreNames.contains('werkbonnen')) {
          db.deleteObjectStore('werkbonnen')
        }
        if (!db.objectStoreNames.contains('werkbonnen')) {
          db.createObjectStore('werkbonnen', { keyPath: 'interventionId' })
        }

        if (!db.objectStoreNames.contains('workOrderPhotos')) {
          const photoStore = db.createObjectStore('workOrderPhotos', { keyPath: 'id' })
          photoStore.createIndex('by-workOrderId', 'workOrderId')
          photoStore.createIndex('by-syncStatus', 'syncStatus')
        }

        if (!db.objectStoreNames.contains('photoBlobs')) {
          db.createObjectStore('photoBlobs')
        }

        // "pendingWrites" — auto-increment key like an SQL sequence
        if (!db.objectStoreNames.contains('pendingWrites')) {
          db.createObjectStore('pendingWrites', {
            keyPath: 'id',
            autoIncrement: true,
          })
        }

        // "dayMeta" — single record, key is always 'current'
        if (!db.objectStoreNames.contains('dayMeta')) {
          db.createObjectStore('dayMeta', { keyPath: 'date' })
        }

        // "task_commands" — offline task queue
        if (!db.objectStoreNames.contains('task_commands')) {
          db.createObjectStore('task_commands', { keyPath: 'clientId' })
        }

        // "intakeUploads" — v4. Uploaded bons that have not reached the server
        // yet. Added, never migrated: every store above is created only when it
        // is missing, so an existing database keeps all of its data.
        if (!db.objectStoreNames.contains('intakeUploads')) {
          db.createObjectStore('intakeUploads', { keyPath: 'clientId' })
        }
      },
    })
  }
  return dbPromise
}

// ---------- Interventions ----------

/** Save all today's interventions (replaces previous cache) */
export async function cacheInterventions(items: Intervention[]): Promise<void> {
  const db = await getDB()
  // Use a transaction so all writes succeed or all fail — no half-saved state
  const tx = db.transaction('interventions', 'readwrite')
  await tx.store.clear()                         // wipe old day's data
  await Promise.all(items.map(i => tx.store.put(normalizeIntervention(i))))
  await tx.done
}

/** Get all planned interventions (dispatcher-assigned, has executeBeforeDate) */
export async function getPlannedInterventions(): Promise<Intervention[]> {
  const db = await getDB()
  // Use the index we created — much faster than scanning all records
  return (await db.getAllFromIndex('interventions', 'by-source', 'planned')).map(normalizeIntervention)
}

/** Get all open pool interventions (technician picks from these) */
export async function getOpenInterventions(): Promise<Intervention[]> {
  const db = await getDB()
  return (await db.getAllFromIndex('interventions', 'by-source', 'reactive')).map(normalizeIntervention)
}

/** Get a single intervention by id */
export async function getIntervention(id: string): Promise<Intervention | undefined> {
  const db = await getDB()
  const item = await db.get('interventions', id)
  return item ? normalizeIntervention(item) : undefined
}

/** Save or refresh one intervention without clearing the full day cache */
export async function upsertIntervention(item: Intervention): Promise<void> {
  const db = await getDB()
  await db.put('interventions', normalizeIntervention(item))
}

/** Update status of an intervention in local cache */
export async function updateInterventionStatus(
  id: string,
  status: Intervention['status']
): Promise<void> {
  const db = await getDB()
  const item = await db.get('interventions', id)
  if (item) {
    await db.put('interventions', normalizeIntervention({ ...item, status }))
  }
}

/** Update sequence (order) of interventions after drag & drop
 *  plannedOrder lives on the lead technician inside intervention.technicians
 */
export async function updateInterventionSequence(
  id: string,
  sequence: number
): Promise<void> {
  const db = await getDB()
  const item = await db.get('interventions', id)
  if (item) {
    const technicians = item.technicians.map(t =>
      t.isLead ? { ...t, plannedOrder: sequence } : t
    )
    await db.put('interventions', normalizeIntervention({ ...item, technicians }))
  }
}

// ---------- Werkbonnen ----------

/** Save the werkbon form as a draft — called (debounced) on every change so it survives a refresh or a dead battery. */
export async function saveWerkbon(interventionId: string, form: WerkbonFormState): Promise<void> {
  const db = await getDB()
  await db.put('werkbonnen', { interventionId, form, lastSavedAt: new Date().toISOString() })
}

/** Load the saved draft for an intervention, if any */
export async function loadWerkbon(interventionId: string): Promise<WerkbonDraft | undefined> {
  const db = await getDB()
  return db.get('werkbonnen', interventionId)
}

/** Remove the draft after a successful submit */
export async function deleteWerkbon(interventionId: string): Promise<void> {
  const db = await getDB()
  await db.delete('werkbonnen', interventionId)
}

export async function createWorkOrderPhotoDraft(input: {
  workOrderId: string
  file: Blob
  fileName: string
}): Promise<WorkOrderPhotoDraft> {
  const db = await getDB()
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const draft: WorkOrderPhotoDraft = {
    id,
    workOrderId: input.workOrderId,
    fileName: input.fileName,
    mimeType: input.file.type || 'image/jpeg',
    size: input.file.size,
    localBlobKey: id,
    createdAt,
    syncStatus: 'pending',
  }

  const tx = db.transaction(['workOrderPhotos', 'photoBlobs'], 'readwrite')
  await tx.objectStore('workOrderPhotos').put(draft)
  await tx.objectStore('photoBlobs').put(input.file, draft.localBlobKey)
  await tx.done
  return draft
}

export async function listWorkOrderPhotos(workOrderId: string): Promise<WorkOrderPhotoDraft[]> {
  const db = await getDB()
  const items = await db.getAllFromIndex('workOrderPhotos', 'by-workOrderId', workOrderId)
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getWorkOrderPhotoBlob(localBlobKey: string): Promise<Blob | undefined> {
  const db = await getDB()
  return db.get('photoBlobs', localBlobKey)
}

async function updateWorkOrderPhotoDraft(
  photoId: string,
  updater: (draft: WorkOrderPhotoDraft) => WorkOrderPhotoDraft,
): Promise<void> {
  const db = await getDB()
  const current = await db.get('workOrderPhotos', photoId)
  if (!current) return
  await db.put('workOrderPhotos', updater(current))
}

export async function markWorkOrderPhotoPending(photoId: string): Promise<void> {
  await updateWorkOrderPhotoDraft(photoId, draft => ({
    ...draft,
    syncStatus: 'pending',
    errorMessage: undefined,
  }))
}

export async function markWorkOrderPhotoUploaded(
  photoId: string,
  input: { serverPath: string; uploadedAt: string },
): Promise<void> {
  await updateWorkOrderPhotoDraft(photoId, draft => ({
    ...draft,
    syncStatus: 'uploaded',
    serverPath: input.serverPath,
    uploadedAt: input.uploadedAt,
    errorMessage: undefined,
  }))
}

export async function markWorkOrderPhotoFailed(
  photoId: string,
  errorMessage: string,
): Promise<void> {
  await updateWorkOrderPhotoDraft(photoId, draft => ({
    ...draft,
    syncStatus: 'failed',
    errorMessage,
  }))
}

export async function markWorkOrderPhotoDeleting(photoId: string): Promise<void> {
  await updateWorkOrderPhotoDraft(photoId, draft => ({ ...draft, syncStatus: 'deleting' }))
}

export async function deleteWorkOrderPhotoDraft(photoId: string, localBlobKey: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['workOrderPhotos', 'photoBlobs', 'pendingWrites'], 'readwrite')
  await tx.objectStore('workOrderPhotos').delete(photoId)
  await tx.objectStore('photoBlobs').delete(localBlobKey)
  const pwStore = tx.objectStore('pendingWrites')
  const keys = await pwStore.getAllKeys()
  const values = await pwStore.getAll()
  for (let i = 0; i < values.length; i++) {
    if (
      values[i].type === 'upload_work_order_photo' &&
      (values[i].payload as { photoId?: string }).photoId === photoId
    ) {
      await pwStore.delete(keys[i])
      break
    }
  }
  await tx.done
}

export async function renameWorkOrderPhotoDraft(photoId: string, newFileName: string): Promise<void> {
  await updateWorkOrderPhotoDraft(photoId, draft => ({ ...draft, fileName: newFileName }))
}

export async function renamePendingWorkOrderPhoto(photoId: string, newFileName: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('pendingWrites', 'readwrite')
  const keys = await tx.store.getAllKeys()
  const values = await tx.store.getAll()
  for (let i = 0; i < values.length; i++) {
    const write = values[i]
    if (
      write.type === 'upload_work_order_photo' &&
      (write.payload as { photoId?: string }).photoId === photoId
    ) {
      await tx.store.put(
        { ...write, payload: { ...write.payload, fileName: newFileName } },
        keys[i],
      )
      break
    }
  }
  await tx.done
}

// ---------- Pending writes ----------

/** Queue an action to be sent to the server when online */
export async function enqueuePendingWrite(write: Omit<PendingWrite, 'id' | 'attempts'>): Promise<void> {
  const db = await getDB()
  await db.add('pendingWrites', { ...write, attempts: 0 })
}

export async function removePendingWritesByType(
  type: PendingWrite['type'] | readonly PendingWrite['type'][],
): Promise<void> {
  const wanted = Array.isArray(type) ? type : [type]

  const db = await getDB()
  const tx = db.transaction('pendingWrites', 'readwrite')
  const items = await tx.store.getAll()

  await Promise.all(
    items
      .filter(item => wanted.includes(item.type) && typeof item.id === 'number')
      .map(item => tx.store.delete(item.id!)),
  )

  await tx.done
}

/**
 * Queue one planning write, replacing whatever planning write was waiting.
 *
 * The payload describes the resulting day, so an older one carries no
 * information the newer one lacks — and keeping both would be worse than
 * useless: the first would bump the planning version the second still claims,
 * turning a second drag into a phantom conflict.
 */
export async function enqueuePlanningWrite(
  payload: Record<string, unknown>,
): Promise<void> {
  await removePendingWritesByType(PLANNING_WRITE_TYPES)
  await enqueuePendingWrite({
    type: 'update_planning',
    createdAt: new Date().toISOString(),
    payload,
  })
}

/** Get all pending writes (to process when back online) */
export async function getPendingWrites(): Promise<PendingWrite[]> {
  const db = await getDB()
  return db.getAll('pendingWrites')
}

/** Remove a pending write after it was successfully sent */
export async function removePendingWrite(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('pendingWrites', id)
}

// ---------- Day metadata ----------

export async function saveDayMeta(meta: DayMeta): Promise<void> {
  const db = await getDB()
  await db.put('dayMeta', meta)
}

/**
 * Forget when the day was last synced, so the next look fetches it again.
 *
 * For the moment something is created that belongs in today's view. The cache
 * is honest about being five minutes old; it just has no way to know that those
 * five minutes now matter.
 */
export async function invalidateDayCache(): Promise<void> {
  const db = await getDB()
  await db.clear('dayMeta')
}

export async function getDayMeta(): Promise<DayMeta | undefined> {
  const db = await getDB()
  // We always store with the date as key, get the most recent
  const all = await db.getAll('dayMeta')
  return all.sort((a, b) => b.date.localeCompare(a.date))[0]
}

// ---------- Task commands (offline task queue) ----------

/** Queue a task API call for later sync if the device is offline. */
export async function enqueueTaskCommand(
  command: Omit<TaskCommand, 'createdAt' | 'synced'>,
): Promise<void> {
  const db = await getDB()
  await db.put('task_commands', {
    ...command,
    createdAt: new Date().toISOString(),
    synced: false,
  })
}

/** Get all unsynced task commands in creation order. */
export async function getUnsyncedTaskCommands(): Promise<TaskCommand[]> {
  const db = await getDB()
  const all = await db.getAll('task_commands')
  return all
    .filter(c => !c.synced)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Mark a task command as successfully synced. */
export async function markTaskCommandSynced(clientId: string): Promise<void> {
  const db = await getDB()
  const cmd = await db.get('task_commands', clientId)
  if (cmd) await db.put('task_commands', { ...cmd, synced: true })
}

/** Mark a task command as permanently failed (4xx response). */
export async function markTaskCommandFailed(clientId: string, error: string): Promise<void> {
  const db = await getDB()
  const cmd = await db.get('task_commands', clientId)
  if (cmd) await db.put('task_commands', { ...cmd, error })
}

// ---------- Uploaded work order bons ----------

/**
 * Keep an uploaded bon locally before it goes to the server.
 *
 * Project rule: every write lands in IndexedDB first. Here that is not
 * ceremony — the file is a photograph of a piece of paper that may already be
 * back in a drawer, and it must survive a dropped connection, a closed tab and
 * a reloaded page.
 */
export async function queueIntakeUpload(draft: IntakeUploadDraft): Promise<void> {
  const db = await getDB()
  await db.put('intakeUploads', draft)
}

/** Everything still waiting to be sent, oldest first. */
export async function getQueuedIntakeUploads(): Promise<IntakeUploadDraft[]> {
  const db = await getDB()
  const all = await db.getAll('intakeUploads')
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Drop an upload once the server has confirmed it holds the file. */
export async function removeIntakeUpload(clientId: string): Promise<void> {
  const db = await getDB()
  await db.delete('intakeUploads', clientId)
}

/** Record why the last attempt failed, so the queue can show it. */
export async function markIntakeUploadFailed(clientId: string, error: string): Promise<void> {
  const db = await getDB()
  const existing = await db.get('intakeUploads', clientId)
  if (!existing) return
  await db.put('intakeUploads', { ...existing, lastError: error })
}

/** One queued upload by the id the phone gave it, or undefined when it is gone. */
export async function getIntakeUpload(clientId: string): Promise<IntakeUploadDraft | undefined> {
  const db = await getDB()
  return db.get('intakeUploads', clientId)
}
