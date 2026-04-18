import { describe, expect, it } from 'vitest'
import { getNextStatus } from '@/lib/tasks/transitions'

describe('getNextStatus', () => {
  it('returns the valid next statuses for each allowed action', () => {
    expect(getNextStatus('pending', 'start')).toBeNull()
    expect(getNextStatus('ready', 'start')).toBe('in_progress')
    expect(getNextStatus('in_progress', 'complete')).toBe('done')
    expect(getNextStatus('in_progress', 'skip')).toBe('skipped')
    expect(getNextStatus('in_progress', 'block')).toBe('blocked')
    expect(getNextStatus('done', 'reopen')).toBe('in_progress')
    expect(getNextStatus('ready', 'cancel')).toBe('cancelled')
    expect(getNextStatus('in_progress', 'cancel')).toBe('cancelled')
  })

  it('returns null for invalid transitions', () => {
    expect(getNextStatus('pending', 'complete')).toBeNull()
    expect(getNextStatus('done', 'complete')).toBeNull()
    expect(getNextStatus('cancelled', 'start')).toBeNull()
    expect(getNextStatus('skipped', 'start')).toBeNull()
  })
})
