'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createWorkOrderPhotoDraft,
  deleteWorkOrderPhotoDraft,
  enqueuePendingWrite,
  getWorkOrderPhotoBlob,
  listWorkOrderPhotos,
  markWorkOrderPhotoDeleting,
  renameWorkOrderPhotoDraft,
  renamePendingWorkOrderPhoto,
} from '@/lib/idb'
import { syncPendingWrites } from '@/lib/sync'
import type { WorkOrderPhotoDraft, WorkOrderPhotoSyncStatus } from '@/types'
import Section from './Section'

interface PhotoCard extends WorkOrderPhotoDraft {
  previewUrl: string | null
}

function getPhotoStatusMeta(status: WorkOrderPhotoSyncStatus): { label: string; badgeClassName: string } {
  if (status === 'uploaded') return { label: 'Geupload', badgeClassName: 'bg-brand-green text-white' }
  if (status === 'failed') return { label: 'Mislukt', badgeClassName: 'bg-brand-red text-white' }
  if (status === 'deleting') return { label: 'Verwijderen...', badgeClassName: 'bg-brand-red text-white' }
  return { label: 'Wacht op upload', badgeClassName: 'bg-brand-orange text-white' }
}

function PhotoStatusBadge({ status }: { status: WorkOrderPhotoSyncStatus }) {
  const meta = getPhotoStatusMeta(status)
  return (
    <div
      className={`absolute bottom-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold shadow-sm ${meta.badgeClassName}`}
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

interface Props {
  workOrderId: string
  technicianId: string | null
}

export default function PhotoUploadSection({ workOrderId, technicianId }: Props) {
  const [photos, setPhotos] = useState<PhotoCard[]>([])
  const [photoActionBusy, setPhotoActionBusy] = useState(false)
  const [renamingPhotoId, setRenamingPhotoId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [renamingExt, setRenamingExt] = useState('')

  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlsRef = useRef<string[]>([])

  const refreshPhotos = useCallback(async () => {
    const drafts = await listWorkOrderPhotos(workOrderId)
    const next = await Promise.all(
      drafts.map(async draft => {
        const blob = await getWorkOrderPhotoBlob(draft.localBlobKey)
        return { ...draft, previewUrl: blob ? URL.createObjectURL(blob) : null }
      }),
    )
    previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    previewUrlsRef.current = next.map(item => item.previewUrl).filter((url): url is string => Boolean(url))
    setPhotos(next)
  }, [workOrderId])

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
          workOrderId,
          file,
          fileName: file.name || `foto-${Date.now()}.jpg`,
        })
        await enqueuePendingWrite({
          type: 'upload_work_order_photo',
          payload: {
            photoId: draft.id,
            workOrderId,
            fileName: draft.fileName,
            mimeType: draft.mimeType,
            changedBy: technicianId,
          },
          createdAt: new Date().toISOString(),
        })
      }
      await refreshPhotos()
      await syncPhotosIfPossible()
    } finally {
      setPhotoActionBusy(false)
    }
  }, [workOrderId, technicianId, refreshPhotos, syncPhotosIfPossible])

  async function handleDeletePhoto(photoId: string) {
    const photo = photos.find(p => p.id === photoId)
    if (!photo || photo.syncStatus === 'deleting') return

    if (photo.syncStatus === 'uploaded') {
      setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, syncStatus: 'deleting' } : p))
      await markWorkOrderPhotoDeleting(photoId)
      await enqueuePendingWrite({
        type: 'delete_work_order_photo',
        payload: {
          photoId: photo.id,
          workOrderId,
          localBlobKey: photo.localBlobKey,
          changedBy: technicianId,
        },
        createdAt: new Date().toISOString(),
      })
      await syncPhotosIfPossible()
    } else {
      if (photo.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl)
      setPhotos(prev => prev.filter(p => p.id !== photoId))
      await deleteWorkOrderPhotoDraft(photo.id, photo.localBlobKey)
    }
  }

  async function commitRename(photoId: string) {
    const trimmed = renamingValue.trim()
    if (trimmed) {
      const newFileName = trimmed + renamingExt
      setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, fileName: newFileName } : p))
      await renameWorkOrderPhotoDraft(photoId, newFileName)
      await renamePendingWorkOrderPhoto(photoId, newFileName)
    }
    setRenamingPhotoId(null)
  }

  // Load photos on mount
  useEffect(() => {
    let isActive = true

    async function loadPhotos() {
      const drafts = await listWorkOrderPhotos(workOrderId)
      const next = await Promise.all(
        drafts.map(async draft => {
          const blob = await getWorkOrderPhotoBlob(draft.localBlobKey)
          return { ...draft, previewUrl: blob ? URL.createObjectURL(blob) : null }
        }),
      )

      if (!isActive) {
        next.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl) })
        return
      }

      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      previewUrlsRef.current = next.map(item => item.previewUrl).filter((url): url is string => Boolean(url))
      setPhotos(next)
    }

    void loadPhotos()

    return () => {
      isActive = false
      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      previewUrlsRef.current = []
    }
  }, [workOrderId])

  // Sync when coming back online
  useEffect(() => {
    function handleOnline() { void syncPhotosIfPossible() }

    if (typeof window !== 'undefined') window.addEventListener('online', handleOnline)
    const timeoutId = window.setTimeout(() => { void syncPhotosIfPossible() }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      if (typeof window !== 'undefined') window.removeEventListener('online', handleOnline)
    }
  }, [syncPhotosIfPossible])

  return (
    <Section title="FOTO'S">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">
          Voeg een foto toe via de camera of kies er een uit de galerij. Nieuwe foto&apos;s blijven lokaal bewaard tot er opnieuw verbinding is.
        </p>

        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { void queuePhotos(e.target.files); e.target.value = '' }} />
        <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { void queuePhotos(e.target.files); e.target.value = '' }} />

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={photoActionBusy}
            className="rounded-xl bg-brand-blue px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
            Foto nemen
          </button>
          <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={photoActionBusy}
            className="rounded-xl border border-stroke bg-surface px-4 py-3 text-sm font-bold text-ink disabled:opacity-60">
            Foto kiezen
          </button>
        </div>

        {photos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stroke bg-surface px-3 py-4 text-center text-sm text-ink-soft">
            Nog geen foto&apos;s toegevoegd
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map(photo => (
              <div key={photo.id} className="overflow-hidden rounded-xl border border-stroke bg-surface">
                <div className="relative aspect-square bg-white">
                  {photo.previewUrl ? (
                    <Image src={photo.previewUrl} alt={photo.fileName} fill unoptimized sizes="33vw" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs font-medium text-ink-soft">Geen voorbeeld</div>
                  )}
                  {photo.syncStatus !== 'deleting' && (
                    <button type="button" onClick={() => void handleDeletePhoto(photo.id)}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white"
                      title="Verwijderen">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                        <path d="M2.5 4.5h11M6 4.5V3h4v1.5M5 4.5v8h6v-8H5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M7 7v3M9 7v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                  <PhotoStatusBadge status={photo.syncStatus} />
                </div>
                <div className="flex flex-col gap-0.5 p-1.5">
                  {renamingPhotoId === photo.id ? (
                    <input
                      autoFocus
                      value={renamingValue}
                      onChange={e => setRenamingValue(e.target.value)}
                      onBlur={() => commitRename(photo.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(photo.id)
                        if (e.key === 'Escape') setRenamingPhotoId(null)
                      }}
                      className="w-full truncate rounded border border-brand-orange bg-white px-1 py-0.5 text-xs font-semibold text-ink outline-none"
                    />
                  ) : (
                    <button type="button"
                      onClick={() => {
                        const dotIndex = photo.fileName.lastIndexOf('.')
                        setRenamingPhotoId(photo.id)
                        setRenamingValue(dotIndex > 0 ? photo.fileName.slice(0, dotIndex) : photo.fileName)
                        setRenamingExt(dotIndex > 0 ? photo.fileName.slice(dotIndex) : '')
                      }}
                      className="truncate text-left text-xs font-semibold text-ink"
                      title="Klik om naam te wijzigen">
                      {photo.fileName}
                    </button>
                  )}
                  {photo.syncStatus === 'failed' && photo.errorMessage && (
                    <p className="text-xs text-brand-red">{photo.errorMessage}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}
