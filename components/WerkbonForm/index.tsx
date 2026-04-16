'use client'

import Image from 'next/image'
import { useState, useCallback, useEffect, useRef } from 'react'
import SignaturePad from '@/components/SignaturePad'
import DevicePanel from '@/components/DevicePanel'
import { generateWerkbonPDF } from '@/lib/pdf'
import type { PdfPart, PdfFollowUp } from '@/lib/pdf'
import {
  createWorkOrderPhotoDraft,
  enqueuePendingWrite,
  getWorkOrderPhotoBlob,
  listWorkOrderPhotos,
} from '@/lib/idb'
import { syncPendingWrites } from '@/lib/sync'
import type {
  Intervention,
  WorkOrderPhotoDraft,
  WorkOrderPhotoSyncStatus,
} from '@/types'

// Local state shape for the form
interface FormState {
  status: string
  workStart: string
  workEnd: string
  description: string
  parts: PdfPart[]
  followUp: PdfFollowUp[]
  signature: string | null
}

const STATUS_OPTIONS = [
  { value: 'gepland',          label: 'Gepland',             activeClass: 'bg-stroke text-ink-soft border-stroke',                inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'onderweg',         label: 'Onderweg',            activeClass: 'bg-brand-orange text-white border-brand-orange',       inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'bezig',            label: 'Bezig',               activeClass: 'bg-brand-blue text-white border-brand-blue',           inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'wacht_onderdelen', label: 'Wacht op onderdelen', activeClass: 'bg-brand-red text-white border-brand-red',             inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'afgewerkt',        label: 'Afgewerkt',           activeClass: 'bg-brand-green text-white border-brand-green',         inactiveClass: 'bg-surface text-ink-soft border-stroke' },
]

const PRIORITY_OPTIONS = [
  { value: 'laag',      label: 'Laag',      activeClass: 'bg-brand-green text-white border-brand-green',   inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'gemiddeld', label: 'Gemiddeld', activeClass: 'bg-brand-blue text-white border-brand-blue',     inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'hoog',      label: 'Hoog',      activeClass: 'bg-brand-orange text-white border-brand-orange', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
] as const

function now() {
  return new Date().toISOString()
}

// Reusable section wrapper
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden bg-white border border-stroke shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 bg-brand-dark">
        <div className="w-1 h-4 rounded-full bg-brand-orange" />
        <p className="font-bold text-sm tracking-wide text-white">{title}</p>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}

interface Props {
  intervention: Intervention
}

interface PhotoCard extends WorkOrderPhotoDraft {
  previewUrl: string | null
}

function getPhotoStatusMeta(status: WorkOrderPhotoSyncStatus): {
  label: string
  badgeClassName: string
} {
  if (status === 'uploaded') {
    return {
      label: 'Geupload',
      badgeClassName: 'bg-brand-green text-white',
    }
  }

  if (status === 'failed') {
    return {
      label: 'Mislukt',
      badgeClassName: 'bg-brand-red text-white',
    }
  }

  return {
    label: 'Wacht',
    badgeClassName: 'bg-brand-orange text-white',
  }
}

function PhotoStatusBadge({ status }: { status: WorkOrderPhotoSyncStatus }) {
  const meta = getPhotoStatusMeta(status)

  return (
    <div
      className={`absolute right-2 top-2 flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold shadow-sm ${meta.badgeClassName}`}
      title={meta.label}
    >
      {status === 'uploaded' ? (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span>{status === 'failed' ? '!' : '...'}</span>
      )}
    </div>
  )
}

export default function WerkbonForm({ intervention }: Props) {
  const [form, setForm] = useState<FormState>({
    status:      intervention.status,
    workStart:   '',
    workEnd:     '',
    description: '',
    parts:       [],
    followUp:    [],
    signature:   null,
  })
  const [pdfLoading,    setPdfLoading]    = useState(false)
  const [saveStatus,    setSaveStatus]    = useState<'idle' | 'saved' | 'error'>('idle')
  const [deviceRefresh, setDeviceRefresh] = useState(0)
  const [photos, setPhotos] = useState<PhotoCard[]>([])
  const [photoActionBusy, setPhotoActionBusy] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlsRef = useRef<string[]>([])

  // Generic updater for simple fields
  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // Time buttons
  function markStartWork() {
    setForm(prev => ({ ...prev, workStart: now(), status: 'bezig' }))
  }
  function markEndWork() {
    setForm(prev => ({ ...prev, workEnd: now(), status: 'afgewerkt' }))
  }

  // Convert the "HH:mm" value from a <input type="time"> back into an ISO
  // timestamp on the same calendar day as the original entry (or today if
  // no time was set yet). Keeps the stored value format consistent with
  // the buttons (always an ISO string).
  function setTimeField(field: 'workStart' | 'workEnd', hhmm: string) {
    if (!hhmm) {
      setForm(prev => ({ ...prev, [field]: '' }))
      return
    }
    const [h, m] = hhmm.split(':').map(Number)
    setForm(prev => {
      const base = prev[field] ? new Date(prev[field]) : new Date()
      base.setHours(h, m, 0, 0)
      return { ...prev, [field]: base.toISOString() }
    })
  }

  // Convert an ISO timestamp to the "HH:mm" shape that <input type="time"> needs.
  function isoToHHMM(iso: string): string {
    if (!iso) return ''
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // Parts
  function addPart() {
    const part: PdfPart = { id: `p-${Date.now()}`, code: '', description: '', quantity: 1, toOrder: false, urgent: false }
    setForm(prev => ({ ...prev, parts: [...prev.parts, part] }))
  }
  function updatePart(id: string, field: keyof PdfPart, value: string | number | boolean) {
    setForm(prev => ({
      ...prev,
      parts: prev.parts.map(p => p.id === id ? { ...p, [field]: value } : p)
    }))
  }
  function removePart(id: string) {
    setForm(prev => ({ ...prev, parts: prev.parts.filter(p => p.id !== id) }))
  }

  // Follow-up
  function addFollowUp() {
    const f: PdfFollowUp = { id: `f-${Date.now()}`, description: '', priority: 'gemiddeld', dueDate: '' }
    setForm(prev => ({ ...prev, followUp: [...prev.followUp, f] }))
  }
  function updateFollowUp(id: string, field: keyof PdfFollowUp, value: string) {
    setForm(prev => ({
      ...prev,
      followUp: prev.followUp.map(f => f.id === id ? { ...f, [field]: value } : f)
    }))
  }
  function removeFollowUp(id: string) {
    setForm(prev => ({ ...prev, followUp: prev.followUp.filter(f => f.id !== id) }))
  }

  // Signature
  const handleSignature = useCallback((dataUrl: string | null) => {
    setForm(prev => ({ ...prev, signature: dataUrl }))
  }, [])

  const refreshPhotos = useCallback(async () => {
    const drafts = await listWorkOrderPhotos(intervention.id)
    const next = await Promise.all(
      drafts.map(async draft => {
        const blob = await getWorkOrderPhotoBlob(draft.localBlobKey)
        return {
          ...draft,
          previewUrl: blob ? URL.createObjectURL(blob) : null,
        }
      }),
    )

    previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    previewUrlsRef.current = next
      .map(item => item.previewUrl)
      .filter((url): url is string => Boolean(url))

    setPhotos(next)
  }, [intervention.id])

  const syncPhotosIfPossible = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    await syncPendingWrites()
    await refreshPhotos()
  }, [refreshPhotos])

  const queuePhotos = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const selectedImages = Array.from(files).filter(file => file.type.startsWith('image/'))
    if (selectedImages.length === 0) return

    setPhotoActionBusy(true)

    try {
      for (const file of selectedImages) {
        const draft = await createWorkOrderPhotoDraft({
          workOrderId: intervention.id,
          file,
          fileName: file.name || `foto-${Date.now()}.jpg`,
        })

        await enqueuePendingWrite({
          type: 'upload_work_order_photo',
          payload: {
            photoId: draft.id,
            workOrderId: intervention.id,
            fileName: draft.fileName,
            mimeType: draft.mimeType,
            changedBy: intervention.technicians[0]?.technicianId ?? null,
          },
          createdAt: new Date().toISOString(),
        })
      }

      await refreshPhotos()
      await syncPhotosIfPossible()
    } finally {
      setPhotoActionBusy(false)
    }
  }, [intervention.id, intervention.technicians, refreshPhotos, syncPhotosIfPossible])

  function handleCameraChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    void queuePhotos(files)
    event.target.value = ''
  }

  function handleGalleryChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    void queuePhotos(files)
    event.target.value = ''
  }

  useEffect(() => {
    let isActive = true

    async function loadPhotos() {
      const drafts = await listWorkOrderPhotos(intervention.id)
      const next = await Promise.all(
        drafts.map(async draft => {
          const blob = await getWorkOrderPhotoBlob(draft.localBlobKey)
          return {
            ...draft,
            previewUrl: blob ? URL.createObjectURL(blob) : null,
          }
        }),
      )

      if (!isActive) {
        next.forEach(item => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        })
        return
      }

      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      previewUrlsRef.current = next
        .map(item => item.previewUrl)
        .filter((url): url is string => Boolean(url))

      setPhotos(next)
    }

    void loadPhotos()

    return () => {
      isActive = false
      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      previewUrlsRef.current = []
    }
  }, [intervention.id])

  useEffect(() => {
    function handleOnline() {
      void syncPhotosIfPossible()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
    }

    const timeoutId = window.setTimeout(() => {
      void syncPhotosIfPossible()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
      }
    }
  }, [syncPhotosIfPossible])

  // PDF
  async function handlePDF() {
    setPdfLoading(true)
    await new Promise(r => setTimeout(r, 200))
    try {
      const pdfBlob = generateWerkbonPDF({
        customerName: intervention.customerName,
        siteName:     intervention.siteName,
        siteAddress:  intervention.siteAddress,
        siteCity:     intervention.siteCity,
        deviceBrand:  intervention.deviceBrand  || '',
        deviceModel:  intervention.deviceModel  || '',
        status:       form.status,
        workStart:    form.workStart,
        workEnd:      form.workEnd,
        description:  form.description,
        parts:        form.parts,
        followUp:     form.followUp,
        signature:    form.signature,
      })

      // Persist completion data to the server
      const fd = new FormData()
      fd.append('changedBy',       intervention.technicians[0]?.technicianId ?? '')
      fd.append('completionNotes', form.description)
      fd.append('completionParts', JSON.stringify(form.parts))
      fd.append('followUp',        JSON.stringify(form.followUp))
      if (form.workStart) fd.append('workStart', form.workStart)
      if (form.workEnd)   fd.append('workEnd',   form.workEnd)
      fd.append('pdf', pdfBlob, `werkbon-${intervention.id}.pdf`)
      const res = await fetch(`/api/work-orders/${intervention.id}/complete`, {
        method: 'POST',
        body:   fd,
      })
      if (res.ok) {
        setSaveStatus('saved')
        setDeviceRefresh(k => k + 1)
      } else {
        console.error('Complete route error:', res.status, await res.text())
        setSaveStatus('error')
      }
    } catch (err) {
      console.error('PDF error:', err)
      setSaveStatus('error')
    }
    setPdfLoading(false)
  }

  return (
    <div className="flex flex-col gap-4 pb-10">

      {/* ── Info card ── */}
      <Section title="KLANT & TOESTEL">
        <div className="flex flex-col gap-1">
          <p className="font-bold text-base text-ink">{intervention.customerName}</p>
          <p className="text-sm text-ink-soft">{intervention.siteName}</p>
          <p className="text-sm text-ink-soft">{intervention.siteAddress}, {intervention.siteCity}</p>
          {intervention.description && (
            <p className="text-sm mt-2 pt-2 border-t border-stroke italic text-brand-orange">
              Melding: {intervention.description}
            </p>
          )}
        </div>
      </Section>

      {/* ── Device panel (collapsible: detail + documents) ── */}
      <DevicePanel
        deviceId={intervention.deviceId}
        brand={intervention.deviceBrand}
        model={intervention.deviceModel}
        currentWorkOrderId={intervention.id}
        refreshKey={deviceRefresh}
      />

      {/* ── Status ── */}
      <Section title="STATUS">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.value}
              onClick={() => update('status', s.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-opacity border ${form.status === s.value ? s.activeClass : s.inactiveClass}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Time registration ── */}
      <Section title="TIJDREGISTRATIE">
        {/* Editable time inputs — tap to adjust the recorded time */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { label: 'Werk start', value: form.workStart, field: 'workStart' as const },
            { label: 'Werk einde', value: form.workEnd,   field: 'workEnd'   as const },
          ].map(t => (
            <label key={t.label} className="rounded-xl p-3 text-center bg-surface block">
              <p className="text-xs mb-1 text-ink-soft">{t.label}</p>
              {t.value ? (
                <input
                  type="time"
                  value={isoToHHMM(t.value)}
                  onChange={e => setTimeField(t.field, e.target.value)}
                  className="w-full text-xl font-bold text-ink bg-transparent text-center outline-none"
                />
              ) : (
                <p className="text-xl font-bold text-ink">--:--</p>
              )}
            </label>
          ))}
        </div>

        {/* Action buttons — show progressively */}
        <div className="flex flex-col gap-2">
          {!form.workStart && (
            <button
              onClick={markStartWork}
              className="w-full py-3 rounded-xl font-bold text-white text-sm bg-brand-blue"
            >
              Start werk
            </button>
          )}
          {form.workStart && !form.workEnd && (
            <button
              onClick={markEndWork}
              className="w-full py-3 rounded-xl font-bold text-white text-sm bg-brand-green"
            >
              Werk beëindigen
            </button>
          )}
        </div>
      </Section>

      {/* ── Work description ── */}
      <Section title="OMSCHRIJVING WERKZAAMHEDEN">
        <textarea
          rows={5}
          placeholder="Beschrijf de uitgevoerde werkzaamheden..."
          value={form.description}
          onChange={e => update('description', e.target.value)}
          className="w-full rounded-xl p-3 text-sm resize-none outline-none bg-surface border border-stroke text-ink"
        />
      </Section>

      {/* ── Parts ── */}
      <Section title="GEBRUIKTE ONDERDELEN">
        <div className="flex flex-col gap-3">
          {form.parts.length === 0 && (
            <p className="text-sm text-center py-2 text-ink-faint">Nog geen onderdelen toegevoegd</p>
          )}
          {form.parts.map(part => (
            <div key={part.id} className="rounded-xl p-3 flex flex-col gap-2 bg-surface border border-stroke">
              <div className="flex gap-2">
                <input
                  placeholder="Artikelcode"
                  value={part.code}
                  onChange={e => updatePart(part.id, 'code', e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none bg-white border border-stroke text-ink"
                />
                <input
                  type="number"
                  min={1}
                  value={part.quantity}
                  onChange={e => updatePart(part.id, 'quantity', parseInt(e.target.value) || 1)}
                  className="w-16 rounded-lg px-3 py-2 text-sm text-center outline-none bg-white border border-stroke text-ink"
                />
                <button onClick={() => removePart(part.id)} className="px-2 text-lg text-brand-red">×</button>
              </div>
              <input
                placeholder="Omschrijving onderdeel"
                value={part.description}
                onChange={e => updatePart(part.id, 'description', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none bg-white border border-stroke text-ink"
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    checked={part.toOrder}
                    onChange={e => updatePart(part.id, 'toOrder', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Te bestellen
                </label>
                {part.toOrder && (
                  <label className="flex items-center gap-2 text-sm font-medium text-brand-red">
                    <input
                      type="checkbox"
                      checked={part.urgent}
                      onChange={e => updatePart(part.id, 'urgent', e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    Dringend
                  </label>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={addPart}
            className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed border-stroke text-ink-soft"
          >
            + Onderdeel toevoegen
          </button>
        </div>
      </Section>

      {/* ── Follow-up ── */}
      <Section title="OPVOLGACTIES">
        <div className="flex flex-col gap-3">
          {form.followUp.length === 0 && (
            <p className="text-sm text-center py-2 text-ink-faint">Geen opvolgacties</p>
          )}
          {form.followUp.map(f => (
            <div key={f.id} className="rounded-xl p-3 flex flex-col gap-3 bg-surface border border-stroke">
              {/* Description row */}
              <div className="flex gap-2">
                <input
                  placeholder="Beschrijving actie..."
                  value={f.description}
                  onChange={e => updateFollowUp(f.id, 'description', e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none bg-white border border-stroke text-ink"
                />
                <button onClick={() => removeFollowUp(f.id)} className="px-2 text-lg text-brand-red">×</button>
              </div>

              {/* Priority — three-level segmented control */}
              <div className="grid grid-cols-3 gap-1.5">
                {PRIORITY_OPTIONS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => updateFollowUp(f.id, 'priority', p.value)}
                    className={`py-1.5 rounded-lg text-xs font-semibold border transition-colors ${f.priority === p.value ? p.activeClass : p.inactiveClass}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Due date — small inline row aligned right */}
              <div className="flex items-center justify-end gap-2">
                <label className="text-[11px] uppercase tracking-wide text-ink-soft">Tegen</label>
                <input
                  type="date"
                  value={f.dueDate}
                  onChange={e => updateFollowUp(f.id, 'dueDate', e.target.value)}
                  className="rounded-md px-2 py-1 text-xs outline-none bg-white border border-stroke text-ink"
                />
              </div>
            </div>
          ))}
          <button
            onClick={addFollowUp}
            className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed border-stroke text-ink-soft"
          >
            + Opvolgactie toevoegen
          </button>
        </div>
      </Section>

      <Section title="FOTO'S">
        <div className="flex flex-col gap-3">
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCameraChange}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleGalleryChange}
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={photoActionBusy}
              className="rounded-xl bg-brand-blue px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              Foto nemen
            </button>
            <button
              onClick={() => galleryInputRef.current?.click()}
              disabled={photoActionBusy}
              className="rounded-xl border border-stroke bg-surface px-4 py-3 text-sm font-bold text-ink disabled:opacity-60"
            >
              Foto kiezen
            </button>
          </div>

          {photos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stroke bg-surface px-3 py-4 text-center text-sm text-ink-soft">
              Nog geen foto&apos;s toegevoegd
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {photos.map(photo => {
                const statusMeta = getPhotoStatusMeta(photo.syncStatus)

                return (
                  <div key={photo.id} className="overflow-hidden rounded-xl border border-stroke bg-surface">
                    <div className="relative aspect-square bg-white">
                      {photo.previewUrl ? (
                        <Image
                          src={photo.previewUrl}
                          alt={photo.fileName}
                          fill
                          unoptimized
                          sizes="50vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm font-medium text-ink-soft">
                          Geen voorbeeld
                        </div>
                      )}
                      <PhotoStatusBadge status={photo.syncStatus} />
                    </div>
                    <div className="flex flex-col gap-1 p-3">
                      <p className="truncate text-sm font-semibold text-ink">{photo.fileName}</p>
                      <p className="text-xs text-ink-soft">{statusMeta.label}</p>
                      {photo.syncStatus === 'failed' && photo.errorMessage && (
                        <p className="text-xs text-brand-red">{photo.errorMessage}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Section>

      {/* ── Signature ── */}
      <Section title="HANDTEKENING KLANT">
        <SignaturePad signature={form.signature} onSignatureChange={handleSignature} />
      </Section>

      {/* ── PDF button ── */}
      <button
        onClick={handlePDF}
        disabled={pdfLoading}
        className="w-full py-4 rounded-xl font-bold text-white text-base disabled:opacity-60 bg-brand-orange"
      >
        {pdfLoading ? 'PDF aanmaken...' : 'PDF Genereren & Opslaan'}
      </button>

      {saveStatus === 'saved' && (
        <p className="text-center text-sm font-semibold text-brand-green">
          ✓ Werkbon opgeslagen
        </p>
      )}
      {saveStatus === 'error' && (
        <p className="text-center text-sm font-semibold text-brand-red">
          ✗ Opslaan mislukt — zie console
        </p>
      )}

    </div>
  )
}
