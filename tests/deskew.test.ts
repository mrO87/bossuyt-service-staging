import { describe, expect, it } from 'vitest'
import {
  applyHomography,
  defaultCorners,
  solveHomography,
  warpToA4,
  type Point,
  type RgbaImage,
} from '@/lib/deskew'

const square: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

function expectPointClose(actual: Point, expected: Point, precision = 6) {
  expect(actual.x).toBeCloseTo(expected.x, precision)
  expect(actual.y).toBeCloseTo(expected.y, precision)
}

describe('solveHomography', () => {
  it('leaves points where they are when nothing moves', () => {
    const h = solveHomography(square, square)
    for (const point of square) expectPointClose(applyHomography(h, point), point)
  })

  it('sends every corner exactly where it was told to', () => {
    // A convincingly skewed page: the far edge is shorter than the near one,
    // which is what a photo taken at an angle actually looks like.
    const photo: Point[] = [
      { x: 120, y: 80 },
      { x: 880, y: 140 },
      { x: 940, y: 1180 },
      { x: 60, y: 1100 },
    ]
    const page: Point[] = [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 850 },
      { x: 0, y: 850 },
    ]

    const h = solveHomography(photo, page)
    for (let i = 0; i < 4; i++) expectPointClose(applyHomography(h, photo[i]), page[i], 4)
  })

  it('keeps straight lines straight', () => {
    // The defining property of a projective transform, and the reason it is the
    // right model for a photographed sheet of paper: the midpoint of an edge
    // stays on that edge, even though it need not stay the midpoint.
    const photo: Point[] = [
      { x: 10, y: 20 },
      { x: 300, y: 60 },
      { x: 320, y: 400 },
      { x: 0, y: 360 },
    ]
    const h = solveHomography(photo, square)

    const edgeMidpoint = { x: (photo[0].x + photo[1].x) / 2, y: (photo[0].y + photo[1].y) / 2 }
    const mapped = applyHomography(h, edgeMidpoint)

    // The top edge of the unit square is y = 0.
    expect(mapped.y).toBeCloseTo(0, 6)
    expect(mapped.x).toBeGreaterThan(0)
    expect(mapped.x).toBeLessThan(1)
  })

  it('refuses four points that do not form a quadrilateral', () => {
    const collinear: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]
    expect(() => solveHomography(collinear, square)).toThrowError(/geen vlak/)
  })

  it('refuses anything other than four corners', () => {
    expect(() => solveHomography(square.slice(0, 3), square)).toThrowError(/vier hoekpunten/)
  })
})

/** A white image with one black quadrant, so a warp is visible in the output. */
function imageWithBlackTopLeft(size: number): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4).fill(255)

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size / 2; x++) {
      const offset = (y * size + x) * 4
      data[offset] = 0
      data[offset + 1] = 0
      data[offset + 2] = 0
    }
  }

  return { data, width: size, height: size }
}

function brightnessAt(image: RgbaImage, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4]
}

describe('warpToA4', () => {
  const source = imageWithBlackTopLeft(64)

  it('produces an image of the size it was asked for', () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
      { x: 0, y: 64 },
    ]
    const result = warpToA4(source, corners, 32, 48)

    expect(result.width).toBe(32)
    expect(result.height).toBe(48)
    expect(result.data.length).toBe(32 * 48 * 4)
  })

  it('keeps the black quadrant in the corner it started in', () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 64 },
      { x: 0, y: 64 },
    ]
    const result = warpToA4(source, corners, 40, 40)

    expect(brightnessAt(result, 5, 5)).toBeLessThan(60)
    expect(brightnessAt(result, 35, 5)).toBeGreaterThan(200)
    expect(brightnessAt(result, 5, 35)).toBeGreaterThan(200)
    expect(brightnessAt(result, 35, 35)).toBeGreaterThan(200)
  })

  it('fills every output pixel, leaving no holes', () => {
    // Pulling from the source rather than pushing into the destination is what
    // guarantees this, even where the warp stretches the image hard.
    const stretched = [
      { x: 20, y: 20 },
      { x: 44, y: 22 },
      { x: 46, y: 40 },
      { x: 18, y: 38 },
    ]
    const result = warpToA4(source, stretched, 50, 70)

    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(255)
    }
  })

  it('reads white outside the photo instead of black', () => {
    // A handle dragged just past the edge should give white margin, not a band
    // of black that OCR would try to read.
    const beyondEdge = [
      { x: -30, y: -30 },
      { x: 94, y: -30 },
      { x: 94, y: 94 },
      { x: -30, y: 94 },
    ]
    const result = warpToA4(source, beyondEdge, 40, 40)

    expect(brightnessAt(result, 1, 1)).toBeGreaterThan(200)
  })
})

describe('defaultCorners', () => {
  it('insets a rectangle clockwise from the top-left', () => {
    const [topLeft, topRight, bottomRight, bottomLeft] = defaultCorners(1000, 2000, 0.1)

    expect(topLeft).toEqual({ x: 100, y: 200 })
    expect(topRight).toEqual({ x: 900, y: 200 })
    expect(bottomRight).toEqual({ x: 900, y: 1800 })
    expect(bottomLeft).toEqual({ x: 100, y: 1800 })
  })

  it('produces corners a homography accepts', () => {
    expect(() => solveHomography(defaultCorners(800, 1200), square)).not.toThrow()
  })
})
