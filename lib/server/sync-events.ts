import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { syncEvents } from '@/lib/db/schema'
import type { CanonicalEntityType, SyncEventStatus, SyncEventType } from '@/types/sync'

type CreateSyncEventInput = {
  id: string
  eventType: SyncEventType
  entityType: CanonicalEntityType
  entityId: string
  payload: Record<string, unknown>
  idempotencyKey: string
  localVersion: number
  status?: SyncEventStatus
  resultPayload?: Record<string, unknown>
}

export async function findSyncEventByIdempotencyKey(idempotencyKey: string) {
  const [existing] = await db
    .select()
    .from(syncEvents)
    .where(eq(syncEvents.idempotencyKey, idempotencyKey))

  return existing ?? null
}

export async function createSyncEvent(input: CreateSyncEventInput) {
  const existing = await findSyncEventByIdempotencyKey(input.idempotencyKey)
  if (existing) {
    return existing
  }

  await db.insert(syncEvents).values({
    id: input.id,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    status: input.status ?? 'pending',
    payload: input.payload,
    payloadVersion: 1,
    localVersion: input.localVersion,
    idempotencyKey: input.idempotencyKey,
    attemptCount: 0,
    maxAttempts: 7,
    nextAttemptAt: new Date(),
    resultPayload: input.resultPayload ?? null,
  })

  const [created] = await db
    .select()
    .from(syncEvents)
    .where(eq(syncEvents.id, input.id))

  return created
}
