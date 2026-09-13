'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  A4_HEIGHT_PX,
  A4_WIDTH_PX,
  defaultCorners,
  warpToA4,
  type Point,
} from '@/lib/deskew'

interface Props {
  /** The photo the user just took or picked. */
  file: File
  onDone: (straightened: Blob) => void
  onCancel: () => void
}

/** Clockwise from the top-left of the sheet — the order lib/deskew.ts expects. */
const HANDLE_LABELS = ['linksboven', 'rechtsboven', 'rechtsonder', 'linksonder']

/**
 * Let the user mark the four corners of the bon in a photo, then straighten it.
 *
 * The corners are marked by hand rather than detected automatically. Finding the
 * edge of a sheet of paper in a photo with a shadow across it and a strip of
 * desk in frame is the unreliable half of this problem, and getting it subtly
 * wrong is worse than not trying: the zones would read slightly the wrong place
 * and quietly return the wrong customer number. Four handles are honest, take a
 * couple of seconds, and can never fail silently.
 */
export default function CornerPicker({ file, onDone, onCancel }: Props) {
  // The object URL that shows the photo, and the photo's true pixel size. Both
  // are set once the browser has decoded the file.
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)

  // Corner positions in the photo's own pixels, not screen pixels. Keeping them
  // in image space means they stay correct when the phone rotates and the
  // displayed size changes.
  const [corners, setCorners] = useState<Point[]>([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const frameRef = useRef<HTMLDivElement>(null)
  // Which handle the finger is currently on. A ref, not state: it changes on
  // every pointer move and none of those changes need a re-render.
  const draggingRef = useRef<number | null>(null)

  // Decode the file into something the <img> can show. The cleanup revokes the
  // URL, otherwise the photo stays in memory for as long as the tab is open.
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = event.currentTarget
    setNaturalSize({ width: naturalWidth, height: naturalHeight })
    setCorners(defaultCorners(naturalWidth, naturalHeight))
  }

  /** Screen coordinates → the photo's own pixels. */
  const toImageSpace = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const frame = frameRef.current
      if (!frame || !naturalSize) return null

      const box = frame.getBoundingClientRect()
      const scaleX = naturalSize.width / box.width
      const scaleY = naturalSize.height / box.height

      // Clamped to the photo: a handle outside it would warp in white margin
      // and, worse, hide the handle off-screen where it cannot be dragged back.
      return {
        x: Math.max(0, Math.min(naturalSize.width, (clientX - box.left) * scaleX)),
        y: Math.max(0, Math.min(naturalSize.height, (clientY - box.top) * scaleY)),
      }
    },
    [naturalSize],
  )

  function startDrag(index: number, event: React.PointerEvent) {
    event.preventDefault()
    draggingRef.current = index
    // Capture routes every later move to this element, so a fast drag that
    // outruns the finger does not drop the handle.
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: React.PointerEvent) {
    const index = draggingRef.current
    if (index === null) return

    const point = toImageSpace(event.clientX, event.clientY)
    if (!point) return

    setCorners(previous => previous.map((corner, i) => (i === index ? point : corner)))
  }

  function endDrag() {
    draggingRef.current = null
  }

  /**
   * Straighten the photo and hand the result back.
   *
   * The warp runs on the photo at full resolution, not on what is displayed, so
   * the output carries every pixel the camera captured. That matters: docling
   * has to read a customer number off it.
   */
  async function straighten() {
    if (!naturalSize || !imageUrl) return

    setWorking(true)
    setError(null)

    try {
      const bitmap = await createImageBitmap(file)

      // De maten eerst vastleggen. `bitmap.close()` geeft het geheugen vrij en
      // zet width en height op nul — daarna uitlezen gaf letterlijk "The source
      // width is 0" en elke foto strandde op dat scherm. De tekening op het
      // canvas blijft na close() gewoon staan; alleen de bitmap zelf is weg.
      const { width, height } = bitmap

      const sourceCanvas = document.createElement('canvas')
      sourceCanvas.width = width
      sourceCanvas.height = height
      const sourceContext = sourceCanvas.getContext('2d')
      if (!sourceContext) throw new Error('Canvas niet beschikbaar')
      sourceContext.drawImage(bitmap, 0, 0)
      bitmap.close()

      const source = sourceContext.getImageData(0, 0, width, height)
      const warped = warpToA4(source, corners)

      const outputCanvas = document.createElement('canvas')
      outputCanvas.width = A4_WIDTH_PX
      outputCanvas.height = A4_HEIGHT_PX
      const outputContext = outputCanvas.getContext('2d')
      if (!outputContext) throw new Error('Canvas niet beschikbaar')
      // Let the context allocate the ImageData and copy the pixels in. Calling
      // `new ImageData(...)` would work at runtime, but the buffer our warp
      // returns is not typed as one the constructor accepts.
      const output = outputContext.createImageData(warped.width, warped.height)
      output.data.set(warped.data)
      outputContext.putImageData(output, 0, 0)

      const blob = await new Promise<Blob | null>(resolve =>
        outputCanvas.toBlob(resolve, 'image/jpeg', 0.92),
      )
      if (!blob) throw new Error('Afbeelding kon niet opgeslagen worden')

      onDone(blob)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rechttrekken mislukt')
    } finally {
      setWorking(false)
    }
  }

  const ready = Boolean(naturalSize) && corners.length === 4

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-2">
        <p className="font-bold text-base text-ink">Zet de hoeken op het blad</p>
        <p className="text-sm text-ink-soft">
          Sleep de vier stippen naar de hoeken van de werkbon. Alles daarbuiten wordt weggesneden.
        </p>
      </div>

      <div
        ref={frameRef}
        className="relative select-none touch-none rounded-xl overflow-hidden bg-black"
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {imageUrl && (
          // An object URL of unknown dimensions, measured on load; next/image
          // cannot size it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Geüploade werkbon"
            onLoad={handleImageLoad}
            className="block w-full h-auto"
          />
        )}

        {ready && naturalSize && (
          <>
            {/* The quadrilateral, so the crop is visible before it happens. */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
              preserveAspectRatio="none"
            >
              <polygon
                points={corners.map(c => `${c.x},${c.y}`).join(' ')}
                fill="rgba(242,140,40,0.15)"
                stroke="#F28C28"
                strokeWidth={Math.max(naturalSize.width, naturalSize.height) / 250}
              />
            </svg>

            {corners.map((corner, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Hoek ${HANDLE_LABELS[index]}`}
                onPointerDown={event => startDrag(index, event)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                // Large enough to hit with a gloved finger, and centred on the
                // corner rather than starting at it.
                className="absolute w-11 h-11 -ml-[22px] -mt-[22px] rounded-full border-4 border-brand-orange bg-white/80 shadow-lg touch-none"
                style={{
                  left: `${(corner.x / naturalSize.width) * 100}%`,
                  top: `${(corner.y / naturalSize.height) * 100}%`,
                }}
              />
            ))}
          </>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-brand-red/10 border border-brand-red px-3 py-2 text-sm font-semibold text-brand-red">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={working}
          className="flex-1 py-4 rounded-xl font-bold text-base bg-surface text-ink border border-stroke disabled:opacity-50"
        >
          Andere foto
        </button>
        <button
          type="button"
          onClick={straighten}
          disabled={!ready || working}
          className="flex-[2] py-4 rounded-xl font-bold text-base bg-brand-orange text-white disabled:opacity-50"
        >
          {working ? 'Bezig met rechttrekken…' : 'Rechttrekken en uitlezen'}
        </button>
      </div>
    </div>
  )
}
