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
import type { PdfFollowUp, PdfPart } from '@/lib/pdf'
import type { Intervention } from '@/types'
import type {
  SyncEventStatus,
  UploadedWorkOrderPhotoDTO,
  WorkOrderExecutionDTO,
} from '@/types/sync'
import { buildIdempotencyKey } from '@/lib/sync-utils'

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
    value: WerkbonCache | WerkbonDraft
  }
  pendingWrites: {
    key: number                 // auto-incremented
    value: PendingWrite | OfflineSyncEvent
    autoIncrement: true
  }
  dayMeta: {
    key: string                 // always 'current'
    value: DayMeta
  }
}

export interface WerkbonCache {
  interventionId: string
  parts: Array<{ articleId: string; qty: number }>
  notes: string
  followUpRequired: boolean
  followUpNote: string
  signatureDataUrl?: string
  lastSavedAt: string
}

export type PhotoSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

export interface WerkbonPhotoDraft {
  localId: string
  fileName: string
  mimeType: string
  originalSize: number
  compressedSize: number
  width: number
  height: number
  createdAt: string
  syncStatus: PhotoSyncStatus
  blob: Blob
  serverPhotoId?: string
  serverUrl?: string
  uploadedAt?: string
}

export interface WerkbonDraft {
  interventionId: string
  status: string
  workStart: string
  workEnd: string
  description: string
  parts: PdfPart[]
  followUp: PdfFollowUp[]
  signature: string | null
  photos: WerkbonPhotoDraft[]
  lastSavedAt: string
}

export interface PendingWrite {
  id?: number
  type: 'patch_status' | 'remove_intervention' | 'submit_werkbon' | 'update_sequence'
  payload: Record<string, unknown>
  createdAt: string
  attempts: number
}

export type OfflineSyncEventType = 'reorder_work_orders' | 'push_work_order_execution'

type ReorderWorkOrdersPayload = {
  technicianId: string
  date: string
  planningVersion: number
  orderedWorkOrderIds: string[]
}

export type WorkOrderExecutionSyncPayload = WorkOrderExecutionDTO & {
  pdfBlob: Blob
  pdfFileName: string
  photoBlobs: Array<{
    localId: string
    fileName: string
    mimeType: string
    blob: Blob
  }>
  rawParts: Array<{
    id: string
    code: string
    description: string
    quantity: number
    toOrder: boolean
    urgent: boolean
  }>
}

export type OfflineSyncEventPayload =
  | ReorderWorkOrdersPayload
  | WorkOrderExecutionSyncPayload

export interface OfflineSyncEvent {
  id?: number
  syncEventId: string
  type: OfflineSyncEventType
  entityType: 'work_order'
  entityId: string
  payload: OfflineSyncEventPayload
  createdAt: string
  updatedAt: string
  attempts: number
  maxAttempts: number
  status: Extract<SyncEventStatus, 'pending' | 'processing' | 'acked' | 'retry_scheduled' | 'dead_letter'>
  nextAttemptAt: string
  idempotencyKey: string
  localVersion: number
  lastError?: string
}

export interface PendingWriteResult {
  synced: number
  failed: number
  notice?: string
  conflict?: boolean
  pending?: number
}

export interface DayMeta {
  date: string              // YYYY-MM-DD
  technicianId: string
  revision: number
  cachedAt: string
  totalPlanned: number
  totalOpen: number
}

// ---------- Singleton ----------
// We open the DB once and reuse the connection.
// Version number: increment this when you change the schema.
let dbPromise: Promise<IDBPDatabase<BossuytDB>> | null = null

export function getDB(): Promise<IDBPDatabase<BossuytDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BossuytDB>('bossuyt-service', 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('interventions')) {
          const intStore = db.createObjectStore('interventions', { keyPath: 'id' })
          intStore.createIndex('by-source', 'source')
          intStore.createIndex('by-status', 'status')
        }

        if (!db.objectStoreNames.contains('werkbonnen')) {
          db.createObjectStore('werkbonnen', { keyPath: 'interventionId' })
        }

        if (!db.objectStoreNames.contains('pendingWrites')) {
          db.createObjectStore('pendingWrites', {
            keyPath: 'id',
            autoIncrement: true,
          })
        }

        if (!db.objectStoreNames.contains('dayMeta')) {
          db.createObjectStore('dayMeta', { keyPath: 'date' })
        }
      },
    })
  }
  return dbPromise
}

function normalizeWerkbonDraft(record: WerkbonDraft | WerkbonCache | undefined): WerkbonDraft | undefined {
  if (!record) {
    return undefined
  }

  if ('status' in record && 'photos' in record) {
    return {
      ...record,
      photos: record.photos.map(photo => ({
        ...photo,
        syncStatus: photo.syncStatus ?? 'pending',
      })),
    }
  }

  return {
    interventionId: record.interventionId,
    status: '',
    workStart: '',
    workEnd: '',
    description: record.notes ?? '',
    parts: [],
    followUp: record.followUpRequired && record.followUpNote
      ? [{
          id: `legacy-follow-up-${record.interventionId}`,
          description: record.followUpNote,
          priority: 'gemiddeld',
          dueDate: '',
        }]
      : [],
    signature: record.signatureDataUrl ?? null,
    photos: [],
    lastSavedAt: record.lastSavedAt ?? new Date().toISOString(),
  }
}

function createOfflineSyncEvent(input: {
  syncEventId?: string
  type: OfflineSyncEventType
  entityId: string
  payload: OfflineSyncEventPayload
  idempotencyKey: string
  localVersion: number
  createdAt?: string
}): OfflineSyncEvent {
  const createdAt = input.createdAt ?? new Date().toISOString()

  return {
    syncEventId: input.syncEventId ?? crypto.randomUUID(),
    type: input.type,
    entityType: 'work_order',
    entityId: input.entityId,
    payload: input.payload,
    createdAt,
    updatedAt: createdAt,
    attempts: 0,
    maxAttempts: 7,
    status: 'pending',
    nextAttemptAt: createdAt,
    idempotencyKey: input.idempotencyKey,
    localVersion: input.localVersion,
  }
}

function normalizePendingWrite(item: PendingWrite | OfflineSyncEvent): OfflineSyncEvent | null {
  if ('syncEventId' in item && 'status' in item) {
    return item
  }

  if (item.type !== 'update_sequence') {
    return null
  }

  const payload = item.payload as ReorderWorkOrdersPayload
  const localVersion = payload.planningVersion ?? 1

  return createOfflineSyncEvent({
    type: 'reorder_work_orders',
    entityId: payload.orderedWorkOrderIds[0] ?? 'planning',
    payload,
    idempotencyKey: buildIdempotencyKey('reorder_work_orders', payload.technicianId, payload.date, localVersion),
    localVersion,
    createdAt: item.createdAt,
  })
}

// ---------- Interventions ----------

/** Save all today's interventions (replaces previous cache) */
export async function cacheInterventions(items: Intervention[]): Promise<void> {
  const db = await getDB()
  // Use a transaction so all writes succeed or all fail — no half-saved state
  const tx = db.transaction('interventions', 'readwrite')
  await tx.store.clear()                         // wipe old day's data
  await Promise.all(items.map(i => tx.store.put(i)))
  await tx.done
}

/** Get all planned interventions (dispatcher-assigned, has executeBeforeDate) */
export async function getPlannedInterventions(): Promise<Intervention[]> {
  const db = await getDB()
  // Use the index we created — much faster than scanning all records
  return db.getAllFromIndex('interventions', 'by-source', 'planned')
}

/** Get all open pool interventions (technician picks from these) */
export async function getOpenInterventions(): Promise<Intervention[]> {
  const db = await getDB()
  return db.getAllFromIndex('interventions', 'by-source', 'reactive')
}

/** Get a single intervention by id */
export async function getIntervention(id: string): Promise<Intervention | undefined> {
  const db = await getDB()
  return db.get('interventions', id)
}

/** Save or refresh one intervention without clearing the full day cache */
export async function upsertIntervention(item: Intervention): Promise<void> {
  const db = await getDB()
  await db.put('interventions', item)
}

/** Update status of an intervention in local cache */
export async function updateInterventionStatus(
  id: string,
  status: Intervention['status']
): Promise<void> {
  const db = await getDB()
  const item = await db.get('interventions', id)
  if (item) {
    await db.put('interventions', { ...item, status })
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
    await db.put('interventions', { ...item, technicians })
  }
}

// ---------- Werkbonnen ----------

/** Save werkbon draft state — called on every change so data survives refresh */
export async function saveWerkbonDraft(data: Omit<WerkbonDraft, 'lastSavedAt'>): Promise<void> {
  const db = await getDB()
  await db.put('werkbonnen', { ...data, lastSavedAt: new Date().toISOString() })
}

/** Load saved werkbon draft for an intervention */
export async function loadWerkbonDraft(interventionId: string): Promise<WerkbonDraft | undefined> {
  const db = await getDB()
  const record = await db.get('werkbonnen', interventionId)
  return normalizeWerkbonDraft(record)
}

export async function setWerkbonPhotoSyncStatus(
  interventionId: string,
  syncStatus: Extract<PhotoSyncStatus, 'pending' | 'syncing' | 'failed'>,
): Promise<void> {
  const db = await getDB()
  const record = normalizeWerkbonDraft(await db.get('werkbonnen', interventionId))

  if (!record) {
    return
  }

  await db.put('werkbonnen', {
    ...record,
    photos: record.photos.map(photo => (
      photo.syncStatus === 'synced'
        ? photo
        : { ...photo, syncStatus }
    )),
    lastSavedAt: new Date().toISOString(),
  })
}

export async function reconcileWerkbonPhotos(
  interventionId: string,
  uploadedPhotos: UploadedWorkOrderPhotoDTO[],
): Promise<void> {
  const db = await getDB()
  const record = normalizeWerkbonDraft(await db.get('werkbonnen', interventionId))

  if (!record) {
    return
  }

  const uploadedByLocalId = new Map(uploadedPhotos.map(photo => [photo.localId, photo]))

  await db.put('werkbonnen', {
    ...record,
    photos: record.photos.map(photo => {
      const uploaded = uploadedByLocalId.get(photo.localId)
      if (!uploaded) {
        return photo
      }

      return {
        ...photo,
        syncStatus: 'synced',
        serverPhotoId: uploaded.photoId,
        serverUrl: uploaded.url,
        uploadedAt: uploaded.uploadedAt,
      }
    }),
    lastSavedAt: new Date().toISOString(),
  })
}

// ---------- Pending writes ----------

/** Queue an action to be sent to the server when online */
export async function enqueuePendingWrite(write: Omit<PendingWrite, 'id' | 'attempts'>): Promise<void> {
  const db = await getDB()
  await db.add('pendingWrites', { ...write, attempts: 0 })
}

export async function enqueueReorderSyncEvent(input: ReorderWorkOrdersPayload & {
  entityId: string
  localVersion: number
}): Promise<void> {
  const db = await getDB()
  const event = createOfflineSyncEvent({
    type: 'reorder_work_orders',
    entityId: input.entityId,
    payload: {
      technicianId: input.technicianId,
      date: input.date,
      planningVersion: input.planningVersion,
      orderedWorkOrderIds: input.orderedWorkOrderIds,
    },
    idempotencyKey: buildIdempotencyKey('reorder_work_orders', input.technicianId, input.date, input.localVersion),
    localVersion: input.localVersion,
  })

  await db.add('pendingWrites', event)
}

export async function enqueueWorkOrderExecutionSyncEvent(
  payload: WorkOrderExecutionSyncPayload,
  localVersion: number,
): Promise<void> {
  const db = await getDB()
  const event = createOfflineSyncEvent({
    syncEventId: payload.localEventId,
    type: 'push_work_order_execution',
    entityId: payload.workOrderId,
    payload,
    idempotencyKey: buildIdempotencyKey('push_work_order_execution', payload.workOrderId, localVersion, payload.localEventId),
    localVersion,
  })

  await db.add('pendingWrites', event)
}

export async function removePendingWritesByType(
  type: PendingWrite['type'] | OfflineSyncEvent['type'],
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('pendingWrites', 'readwrite')
  const items = await tx.store.getAll()

  await Promise.all(
    items
      .filter(item => item.type === type && typeof item.id === 'number')
      .map(item => tx.store.delete(item.id!)),
  )

  await tx.done
}

/** Get all raw pending queue entries, including legacy writes. */
export async function getPendingWrites(): Promise<Array<PendingWrite | OfflineSyncEvent>> {
  const db = await getDB()
  return db.getAll('pendingWrites')
}

export async function getPendingSyncEvents(): Promise<OfflineSyncEvent[]> {
  const db = await getDB()
  const items = await db.getAll('pendingWrites')
  const now = new Date().toISOString()

  return items
    .map(item => normalizePendingWrite(item))
    .filter((item): item is OfflineSyncEvent => Boolean(item))
    .filter(item => item.status !== 'dead_letter' && item.nextAttemptAt <= now)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Remove a pending write after it was successfully sent */
export async function removePendingWrite(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('pendingWrites', id)
}

export async function updatePendingSyncEvent(
  eventId: number,
  updater: (event: OfflineSyncEvent) => OfflineSyncEvent,
): Promise<void> {
  const db = await getDB()
  const current = await db.get('pendingWrites', eventId)
  const normalized = current ? normalizePendingWrite(current) : null

  if (!normalized) {
    return
  }

  await db.put('pendingWrites', {
    ...updater(normalized),
    id: eventId,
    updatedAt: new Date().toISOString(),
  })
}

export async function countPendingSyncEvents(): Promise<number> {
  const items = await getPendingSyncEvents()
  return items.filter(item => item.status !== 'acked').length
}

// ---------- Day metadata ----------

export async function saveDayMeta(meta: DayMeta): Promise<void> {
  const db = await getDB()
  await db.put('dayMeta', meta)
}

export async function getDayMeta(): Promise<DayMeta | undefined> {
  const db = await getDB()
  // We always store with the date as key, get the most recent
  const all = await db.getAll('dayMeta')
  return all.sort((a, b) => b.date.localeCompare(a.date))[0]
}
