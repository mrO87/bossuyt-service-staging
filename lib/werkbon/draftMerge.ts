/**
 * Deciding which half-filled werkbon to show: the one on this device, or the
 * one the server has.
 *
 * Drafts used to live only in the browser, so this question never arose. Now
 * that they are written away, the same bon can have been typed into on a phone
 * and on a laptop, and one of the two is about to be set aside.
 *
 * The rule is newest wins — simple enough to reason about at a customer's
 * counter. What it must never do is set work aside silently: if the server's
 * copy displaces something that was typed here, the person has to be told, and
 * by whom.
 */

export interface DraftSide<TForm = unknown> {
  form: TForm
  /** ISO timestamp, set by whichever device last changed the form. */
  updatedAt: string
  /** Technician id, so a notice can name who. */
  updatedBy?: string
}

export type DraftChoice<TForm = unknown> =
  | { use: 'none' }
  | { use: 'local'; draft: DraftSide<TForm> }
  | {
      use: 'remote'
      draft: DraftSide<TForm>
      /** Set only when taking the remote copy sets local work aside. */
      displaced: { updatedBy?: string; updatedAt: string } | null
    }

function time(side: Pick<DraftSide, 'updatedAt'>): number {
  const parsed = Date.parse(side.updatedAt)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function chooseDraft<TForm>(
  local: DraftSide<TForm> | null,
  remote: DraftSide<TForm> | null,
): DraftChoice<TForm> {
  if (!local && !remote) return { use: 'none' }
  if (local && !remote) return { use: 'local', draft: local }
  if (!local && remote) return { use: 'remote', draft: remote, displaced: null }

  const here = local as DraftSide<TForm>
  const there = remote as DraftSide<TForm>

  // A tie goes to what is already on screen: the person is looking at it, and
  // swapping it for a copy of the same age would be motion without meaning.
  if (time(here) >= time(there)) return { use: 'local', draft: here }

  return {
    use: 'remote',
    draft: there,
    // Something was typed here and is now being set aside. Say so.
    displaced: { updatedBy: here.updatedBy, updatedAt: here.updatedAt },
  }
}

/**
 * Whether our draft may overwrite the one the server holds.
 *
 * The same rule seen from the other side. The server refuses a write older than
 * what it already has, so a phone coming back online after a week cannot
 * flatten work done since.
 */
export function mayOverwrite(
  incoming: Pick<DraftSide, 'updatedAt'>,
  stored: Pick<DraftSide, 'updatedAt'> | null,
): boolean {
  if (!stored) return true
  return time(incoming) > time(stored)
}
