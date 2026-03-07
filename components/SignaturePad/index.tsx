'use client'

import { useRef, useEffect, useCallback, useState } from 'react'

interface Props {
  signature: string | null
  onSignatureChange: (dataUrl: string | null) => void
}

export default function SignaturePad({ signature, onSignatureChange }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasContent, setHasContent] = useState(false)

  // Get position from either mouse or touch event
  function getPos(e: React.TouchEvent | React.MouseEvent) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const touch = e.touches[0]
      if (!touch) return { x: 0, y: 0 }
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top)  * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    }
  }

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    setIsDrawing(true)
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [])

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.strokeStyle = '#1F2933'
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasContent(true)
  }, [isDrawing])

  const endDraw = useCallback(() => {
    if (!isDrawing) return
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (canvas && hasContent) {
      onSignatureChange(canvas.toDataURL('image/png'))
    }
  }, [isDrawing, hasContent, onSignatureChange])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    const ctx    = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasContent(false)
    onSignatureChange(null)
  }, [onSignatureChange])

  // Redraw if signature prop changes externally
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    if (signature) {
      const img = new Image()
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setHasContent(true)
      }
      img.src = signature
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setHasContent(false)
    }
  }, [signature])

  return (
    <div className="flex flex-col gap-2">
      {/* Canvas */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{ border: '2px dashed #E5E7EB', backgroundColor: '#F9FAFB' }}
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full touch-none cursor-crosshair"
          style={{ height: '130px' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {/* Placeholder text when empty */}
        {!hasContent && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm" style={{ color: '#9CA3AF' }}>Teken hier de handtekening van de klant</p>
          </div>
        )}
      </div>

      {/* Clear button */}
      <button
        type="button"
        onClick={clear}
        disabled={!hasContent}
        className="self-end text-sm px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-40"
        style={{ backgroundColor: '#F4F6F8', color: '#6B7280', border: '1px solid #E5E7EB' }}
      >
        Wissen
      </button>
    </div>
  )
}
