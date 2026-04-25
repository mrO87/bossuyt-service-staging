/**
 * lib/tasks/sync.ts
 *
 * Offline-first sync for the task system.
 *
 * queueTaskCommand  — writes a command to IndexedDB and tries to send it
 *                     immediately. Falls back silently if offline.
 *
 * flushTaskQueue    — replays all unsynced commands in order. Called:
 *                     • on the browser "online" event
 *                     • on app foreground (visibilitychange → visible)
 *                     • after any successful online sync
 */

import {
  enqueueTaskCommand,
  getUnsyncedTaskCommands,
  markTaskCommandFailed,
  markTaskCommandSynced,
} from '@/lib/idb'
import type { TaskCommand } from '@/lib/idb'

/**
 * Write a task API call to IndexedDB, then attempt to send it immediately.
 * If the request fails (network error / offline), it stays in the queue
 * and will be replayed by flushTaskQueue when the device comes back online.
 *
 * The `body` must already contain a `client_id` field that matches the
 * `clientId` you pass here — the server uses it for idempotency.
 */
export async function queueTaskCommand(
  endpoint: string,
  method: string,
  body: Record<string, unknown> & { client_id: string },
): Promise<void> {
  const clientId = body.client_id

  await enqueueTaskCommand({ clientId, endpoint, method, body })

  // Attempt immediate send — ignore failure, flushTaskQueue handles retries
  try {
    await sendCommand({ endpoint, method, body })
    await markTaskCommandSynced(clientId)
  } catch {
    // offline or server error — will be retried on next flush
  }
}

/**
 * Replay all unsynced commands in chronological order.
 * Stops on the first 5xx or network error (will retry next flush).
 * Marks 4xx responses as permanently failed (don't retry broken requests).
 */
export async function flushTaskQueue(): Promise<void> {
  const commands = await getUnsyncedTaskCommands()

  for (const cmd of commands) {
    try {
      const res = await sendCommand(cmd)

      if (res.ok || res.status === 409) {
        // 200 = success, 409 = duplicate (idempotency) — both mean done
        await markTaskCommandSynced(cmd.clientId)
        continue
      }

      if (res.status >= 400 && res.status < 500) {
        // Permanent failure — bad request, don't retry
        const text = await res.text()
        await markTaskCommandFailed(cmd.clientId, `HTTP ${res.status}: ${text}`)
        continue
      }

      // 5xx or unexpected status — stop and retry later
      break
    } catch {
      // Network error — stop and retry later
      break
    }
  }
}

async function sendCommand(cmd: Pick<TaskCommand, 'endpoint' | 'method' | 'body'>): Promise<Response> {
  return fetch(cmd.endpoint, {
    method:  cmd.method,
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(cmd.body),
  })
}

/** Register global event listeners to flush the queue automatically. */
export function registerSyncListeners(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('online', () => { void flushTaskQueue() })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void flushTaskQueue()
    }
  })
}
