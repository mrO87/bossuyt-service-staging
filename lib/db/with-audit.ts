/**
 * Wraps a database write in a transaction and sets the session-local variable
 * `app.current_user` so that audit triggers can record who made the change.
 *
 * Usage:
 *   await withAudit('tech-001', async (tx) => {
 *     await tx.update(workOrders).set({ status: 'afgewerkt' }).where(...)
 *   })
 */
import { sql } from 'drizzle-orm'
import { db }  from '@/lib/db'

// The transaction object Drizzle passes to the callback
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function withAudit<T>(
  changedBy: string | null | undefined,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (changedBy) {
      // set_config(name, value, is_local=true) is equivalent to SET LOCAL —
      // the value is scoped to this transaction and reset when it ends.
      await tx.execute(
        sql`SELECT set_config('app.current_user', ${changedBy}, true)`,
      )
    }
    return fn(tx)
  })
}
