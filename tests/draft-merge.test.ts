/**
 * chooseDraft / mayOverwrite — which half-filled werkbon survives.
 *
 * Why this exists at all: a draft used to live only in the browser, so a bon
 * typed into on a phone was gone if that phone cleared its storage — which it
 * does, once photos fill it. Writing drafts away fixes that and creates this
 * question: two copies, one screen.
 *
 * Newest wins. The part worth testing is not that rule but its edges — a tie,
 * a clock that makes no sense, and above all that work typed here is never set
 * aside without saying so.
 */
import { describe, expect, it } from 'vitest'
import { chooseDraft, mayOverwrite, type DraftSide } from '@/lib/werkbon/draftMerge'

function draft(minutesPastNoon: number, by = 'u1'): DraftSide<{ notes: string }> {
  const at = new Date(Date.UTC(2026, 8, 14, 12, minutesPastNoon)).toISOString()
  return { form: { notes: `om ${minutesPastNoon}` }, updatedAt: at, updatedBy: by }
}

describe('chooseDraft', () => {
  it('has nothing to show when neither side has a draft', () => {
    expect(chooseDraft(null, null)).toEqual({ use: 'none' })
  })

  it('takes the only draft there is', () => {
    expect(chooseDraft(draft(5), null).use).toBe('local')
    expect(chooseDraft(null, draft(5)).use).toBe('remote')
  })

  it('says nothing was displaced when there was nothing here', () => {
    const result = chooseDraft(null, draft(5))
    expect(result).toMatchObject({ use: 'remote', displaced: null })
  })

  it('keeps the newer local draft', () => {
    expect(chooseDraft(draft(10), draft(5)).use).toBe('local')
  })

  it('takes the newer remote draft', () => {
    expect(chooseDraft(draft(5), draft(10)).use).toBe('remote')
  })

  it('names what it set aside, and who typed it', () => {
    // The whole reason for the notice: an afternoon of typing on this phone is
    // about to vanish behind a newer copy, and nobody should discover that by
    // noticing the fields look different.
    const result = chooseDraft(draft(5, 'u1'), draft(10, 'u2'))

    expect(result.use).toBe('remote')
    if (result.use !== 'remote') return
    expect(result.displaced).toEqual({
      updatedBy: 'u1',
      updatedAt: draft(5).updatedAt,
    })
  })

  it('leaves a tie on screen', () => {
    // Same age: the person is already looking at one of them, and replacing it
    // with an equally old copy is movement with no meaning behind it.
    expect(chooseDraft(draft(7), draft(7)).use).toBe('local')
  })

  it('treats an unreadable timestamp as ancient rather than throwing', () => {
    const broken: DraftSide = { form: {}, updatedAt: 'gisteren ergens' }
    expect(chooseDraft(broken, draft(1)).use).toBe('remote')
    expect(chooseDraft(draft(1), broken).use).toBe('local')
  })
})

describe('mayOverwrite', () => {
  it('writes when the server holds nothing', () => {
    expect(mayOverwrite(draft(5), null)).toBe(true)
  })

  it('writes when ours is newer', () => {
    expect(mayOverwrite(draft(10), draft(5))).toBe(true)
  })

  it('refuses when the server has something newer', () => {
    // A phone coming back online after a week must not flatten what was done
    // in the meantime.
    expect(mayOverwrite(draft(5), draft(10))).toBe(false)
  })

  it('refuses an exact tie, so a replayed write changes nothing', () => {
    expect(mayOverwrite(draft(7), draft(7))).toBe(false)
  })
})
