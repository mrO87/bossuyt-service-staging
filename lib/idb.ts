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
import type { Intervention } from '@/types'

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
    value: WerkbonCache
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

export interface PendingWrite {
  id?: number
  type: 'patch_status' | 'remove_intervention' | 'submit_werkbon' | 'update_sequence'
  payload: Record<string, unknown>
  createdAt: string
  attempts: number
}

export interface PendingWriteResult {
  synced: number
  failed: number
  notice?: string
  conflict?: boolean
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

export function getDB(): Promise<IDBPDatabase<BossuytDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BossuytDB>('bossuyt-service', 1, {
      upgrade(db) {
        // "interventions" store
        const intStore = db.createObjectStore('interventions', { keyPath: 'id' })
        intStore.createIndex('by-source', 'source')
        intStore.createIndex('by-status', 'status')

        // "werkbonnen" store — one per intervention
        db.createObjectStore('werkbonnen', { keyPath: 'interventionId' })

        // "pendingWrites" — auto-increment key like an SQL sequence
        db.createObjectStore('pendingWrites', {
          keyPath: 'id',
          autoIncrement: true,
        })

        // "dayMeta" — single record, key is always 'current'
        db.createObjectStore('dayMeta', { keyPath: 'date' })
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

/** Save werkbon form state — called on every change so data survives refresh */
export async function saveWerkbon(data: WerkbonCache): Promise<void> {
  const db = await getDB()
  await db.put('werkbonnen', { ...data, lastSavedAt: new Date().toISOString() })
}

/** Load saved werkbon for an intervention */
export async function loadWerkbon(interventionId: string): Promise<WerkbonCache | undefined> {
  const db = await getDB()
  return db.get('werkbonnen', interventionId)
}

// ---------- Pending writes ----------

/** Queue an action to be sent to the server when online */
export async function enqueuePendingWrite(write: Omit<PendingWrite, 'id' | 'attempts'>): Promise<void> {
  const db = await getDB()
  await db.add('pendingWrites', { ...write, attempts: 0 })
}

export async function removePendingWritesByType(type: PendingWrite['type']): Promise<void> {
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

export async function getDayMeta(): Promise<DayMeta | undefined> {
  const db = await getDB()
  // We always store with the date as key, get the most recent
  const all = await db.getAll('dayMeta')
  return all.sort((a, b) => b.date.localeCompare(a.date))[0]
}
