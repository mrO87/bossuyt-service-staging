/**
 * lib/deskew.ts — straighten a photographed Service Bon into a flat A4.
 *
 * The zones in lib/werkbon-zones.ts are millimetres on an A4 page, so they only
 * mean anything once the photo has been turned into an A4 page. A phone held
 * over a sheet of paper never produces one: the page arrives as a quadrilateral
 * with converging edges, because the camera is not perpendicular to the desk.
 *
 * Correcting that is a *homography* — a projective transform. It is the map
 * that turns any quadrilateral into any other, and it is exactly the right tool
 * here because a camera photographing a flat surface produces precisely this
 * kind of distortion and no other: straight lines stay straight, but parallel
 * lines stop being parallel.
 *
 * Eight numbers describe one. Four corners give eight equations. So four corners
 * are all we need, which is why the user only ever drags four handles.
 *
 * Everything here is pure arithmetic on plain arrays — no canvas, no DOM — so
 * it runs in a test as happily as in a browser.
 */

export type Point = { x: number; y: number }

/**
 * A4 at 200 dpi. Enough resolution for OCR to read a customer number reliably,
 * small enough that warping it stays quick on a phone: 210mm and 297mm at
 * 200/25.4 pixels per millimetre.
 */
export const A4_WIDTH_PX = 1654
export const A4_HEIGHT_PX = 2339

/** Anything shaped like ImageData, so this module needs no DOM to be tested. */
export type RgbaImage = {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * The eight coefficients of a projective transform, in the order they are used:
 *
 *   x' = (a·x + b·y + c) / (g·x + h·y + 1)
 *   y' = (d·x + e·y + f) / (g·x + h·y + 1)
 *
 * The ninth coefficient of a homography is fixed at 1. That costs nothing —
 * scaling all nine by the same factor describes the same transform — and it
 * turns an awkward "find the null space" problem into an ordinary 8×8 system.
 */
export type Homography = [number, number, number, number, number, number, number, number]

/**
 * Find the transform that sends each `from` corner to the matching `to` corner.
 *
 * Each corner pair contributes two rows to an 8×8 system. Rearranging the two
 * equations above so the unknowns sit on the left gives:
 *
 *   a·x + b·y + c            − g·x·x' − h·y·x' = x'
 *               d·x + e·y + f − g·x·y' − h·y·y' = y'
 *
 * Solving that by Gaussian elimination gives the eight coefficients.
 *
 * Throws when the four corners are degenerate — three of them in a line, or two
 * on top of each other. That is not a corner case to paper over: it means the
 * handles do not describe a page, and warping anyway would produce a smear that
 * OCR would then confidently misread.
 */
export function solveHomography(from: Point[], to: Point[]): Homography {
  if (from.length !== 4 || to.length !== 4) {
    throw new Error('Een homografie heeft precies vier hoekpunten nodig')
  }

  const matrix: number[][] = []
  const rhs: number[] = []

  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const { x: u, y: v } = to[i]

    matrix.push([x, y, 1, 0, 0, 0, -x * u, -y * u])
    rhs.push(u)
    matrix.push([0, 0, 0, x, y, 1, -x * v, -y * v])
    rhs.push(v)
  }

  return solveLinearSystem(matrix, rhs) as Homography
}

/** Where a single point ends up under a transform. */
export function applyHomography(h: Homography, point: Point): Point {
  const [a, b, c, d, e, f, g, i] = h
  const denominator = g * point.x + i * point.y + 1

  return {
    x: (a * point.x + b * point.y + c) / denominator,
    y: (d * point.x + e * point.y + f) / denominator,
  }
}

/**
 * Gaussian elimination with partial pivoting.
 *
 * "Partial pivoting" means: before eliminating a column, swap in the row with
 * the largest value in it. Without that step a pivot near zero divides the rest
 * of the row by almost nothing and the rounding error swamps the answer — which
 * for us would show up as a page that looks subtly bent.
 */
function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length
  const augmented = matrix.map((row, i) => [...row, rhs[i]])

  for (let column = 0; column < n; column++) {
    let pivot = column
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }

    if (Math.abs(augmented[pivot][column]) < 1e-10) {
      throw new Error('De vier hoekpunten vormen geen vlak — sleep ze naar de hoeken van het blad')
    }

    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]

    for (let row = 0; row < n; row++) {
      if (row === column) continue
      const factor = augmented[row][column] / augmented[column][column]
      for (let col = column; col <= n; col++) {
        augmented[row][col] -= factor * augmented[column][col]
      }
    }
  }

  return augmented.map((row, i) => row[n] / row[i])
}

/**
 * Turn the quadrilateral the user marked into a flat A4 image.
 *
 * Note which direction the transform runs: from the *destination* rectangle to
 * the *source* photo. That looks backwards, but it is what avoids holes. Walking
 * the source and pushing each pixel forward leaves gaps wherever the image is
 * stretched; walking the destination and pulling from the source visits every
 * output pixel exactly once, so every one of them gets a value.
 *
 * `corners` are the four points on the photo, clockwise from the top-left of
 * the sheet — the same order the drag handles are numbered.
 */
export function warpToA4(
  source: RgbaImage,
  corners: Point[],
  width: number = A4_WIDTH_PX,
  height: number = A4_HEIGHT_PX,
): RgbaImage {
  const destination: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]

  const toSource = solveHomography(destination, corners)
  const out = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = applyHomography(toSource, { x: x + 0.5, y: y + 0.5 })
      sampleBilinear(source, from.x, from.y, out, (y * width + x) * 4)
    }
  }

  return { data: out, width, height }
}

/**
 * Read a colour at a fractional position by mixing the four pixels around it.
 *
 * Taking the single nearest pixel instead would be faster, but printed text at
 * this scale is only a few pixels tall: nearest-neighbour breaks thin strokes
 * into a dotted mess and OCR starts reading 0 as O. Mixing keeps the strokes
 * continuous, which is the whole point of the exercise.
 *
 * Anything sampled from outside the photo comes back white, so a corner dragged
 * slightly beyond the edge produces white margin rather than a black band.
 */
function sampleBilinear(
  source: RgbaImage,
  x: number,
  y: number,
  out: Uint8ClampedArray,
  offset: number,
): void {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0

  for (let channel = 0; channel < 3; channel++) {
    const topLeft = pixelAt(source, x0, y0, channel)
    const topRight = pixelAt(source, x0 + 1, y0, channel)
    const bottomLeft = pixelAt(source, x0, y0 + 1, channel)
    const bottomRight = pixelAt(source, x0 + 1, y0 + 1, channel)

    const top = topLeft + (topRight - topLeft) * fx
    const bottom = bottomLeft + (bottomRight - bottomLeft) * fx
    out[offset + channel] = top + (bottom - top) * fy
  }

  out[offset + 3] = 255
}

function pixelAt(source: RgbaImage, x: number, y: number, channel: number): number {
  if (x < 0 || y < 0 || x >= source.width || y >= source.height) return 255
  return source.data[(y * source.width + x) * 4 + channel]
}

/**
 * A sensible starting quadrilateral: a rectangle inset from the edges of the
 * photo, in the same clockwise order as everything else here.
 *
 * People frame a document roughly centred with a bit of desk around it, so this
 * lands close enough that most uploads need a nudge rather than four drags.
 */
export function defaultCorners(width: number, height: number, inset = 0.08): Point[] {
  const dx = width * inset
  const dy = height * inset

  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ]
}
