/**
 * How close two street names are.
 *
 * Used to decide whether a street the geocoder proposes is a repair of what was
 * scanned, or a different street altogether. "Prinsbouwdewijnlaan" and "Prins
 * Boudewijnlaan" differ by one dropped letter — that is OCR. "Kapelstraat" and
 * "Kasteelstraat" are two streets, and swapping one for the other would move a
 * customer to the wrong building.
 *
 * The postal code already keeps a correction inside the right town (see
 * StreetCorrector). This is the second gate: near enough to be the same street,
 * or leave it alone.
 */

/** Edit distance: how many single-character changes turn `a` into `b`. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Only the previous row is ever needed, so keep one row rather than a grid.
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      const insertion = current[j - 1] + 1
      const deletion = previous[j] + 1
      current[j] = Math.min(substitution, insertion, deletion)
    }
    previous = current
  }

  return previous[b.length]
}

/**
 * Similarity from 0 to 1, ignoring case, spaces and punctuation.
 *
 * Spacing is ignored on purpose: OCR merges words as readily as it drops
 * letters, and "Prins Boudewijnlaan" arriving as one word is the same street.
 */
export function similarity(a: string, b: string): number {
  const strip = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

  const left = strip(a)
  const right = strip(b)

  if (left === right) return 1
  if (left.length === 0 || right.length === 0) return 0

  return 1 - levenshtein(left, right) / Math.max(left.length, right.length)
}

/**
 * The bar a proposed street has to clear before it may overwrite what was
 * scanned. Below it, the difference is more likely a different street than a
 * misread one, and the scanned text stays — a human can still read the paper.
 */
export const STREET_MATCH_THRESHOLD = 0.9

export function isCloseEnoughToCorrect(scanned: string, proposed: string): boolean {
  return similarity(scanned, proposed) >= STREET_MATCH_THRESHOLD
}
