'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import SignaturePad from '@/components/SignaturePad'
import DevicePanel from '@/components/DevicePanel'
import { generateWerkbonPDF } from '@/lib/pdf'
import type { PdfPart, ServiceBonPdfData } from '@/lib/pdf'
import { useTasks } from '@/lib/task-store'
import { queueTaskCommand } from '@/lib/tasks/sync'
import { deleteWerkbon, loadWerkbon, saveWerkbon } from '@/lib/idb'
import type { Device, Intervention, DbTask, WerkbonFormState } from '@/types'
import PartsSection from './PartsSection'
import PhotoUploadSection from './PhotoUploadSection'
import TaskManager from './TaskManager'
import Section from './Section'
import BonHeaderCard from './BonHeaderCard'
import VisitSection from './VisitSection'
import DevicePicker from './DevicePicker'

const STATUS_OPTIONS = [
  { value: 'gepland',          label: 'Gepland',               activeClass: 'bg-stroke text-ink-soft border-stroke',           inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'onderweg',         label: 'Onderweg',              activeClass: 'bg-brand-orange text-white border-brand-orange',   inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'bezig',            label: 'Bezig',                 activeClass: 'bg-brand-blue text-white border-brand-blue',       inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'wacht_onderdelen', label: 'Wacht op onderdelen',   activeClass: 'bg-brand-red text-white border-brand-red',         inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'afgewerkt',        label: 'Afgewerkt',             activeClass: 'bg-brand-green text-white border-brand-green',     inactiveClass: 'bg-surface text-ink-soft border-stroke' },
]

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10)
}

function isWeekend(isoDate: string): boolean {
  const day = new Date(`${isoDate}T12:00:00`).getDay()
  return day === 0 || day === 6
}

function initialForm(intervention: Intervention): WerkbonFormState {
  const today = todayISODate()
  return {
    status: intervention.status,
    deviceId: intervention.deviceId,
    technicianId:
      intervention.technicians.find(t => t.isLead)?.technicianId ??
      intervention.technicians[0]?.technicianId ??
      null,
    visitDate: today,
    arrivalTime: '',
    departureTime: '',
    workStart: '',
    workEnd: '',
    interventionKind: isWeekend(today) ? 'weekend' : 'week',
    tripCount: 1,
    personCount: Math.max(1, intervention.technicians.length),
    notes: '',
    remarks: '',
    parts: [],
    signature: null,
  }
}

interface Props {
  intervention: Intervention
  initialActivityId?: string
}

export default function WerkbonForm({ intervention, initialActivityId }: Props) {
  const { tasks } = useTasks()
  const werkbonId = `wb-${intervention.id}`

  const [form, setForm] = useState<WerkbonFormState>(() => initialForm(intervention))
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [pickedDevice, setPickedDevice] = useState<Device | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [bonNumber, setBonNumber] = useState<string | null>(null)
  const [existingCount, setExistingCount] = useState(0)
  const [deviceRefresh, setDeviceRefresh] = useState(0)
  const [queuedPartIds, setQueuedPartIds] = useState<Set<string>>(new Set())
  const [orderTasks, setOrderTasks] = useState<DbTask[]>([])
  const [workflowTasks, setWorkflowTasks] = useState<DbTask[]>([])
  const [workflowRefresh, setWorkflowRefresh] = useState(0)
  const saveTimer = useRef<number | null>(null)
  // Set the moment the technician changes anything. Guards three separate races
  // around the IndexedDB draft — see the two effects below and handleSubmit.
  const isDirty = useRef(false)

  // ── Draft: load once, then autosave (debounced 500 ms) ──────────────────────
  useEffect(() => {
    let cancelled = false
    loadWerkbon(intervention.id)
      .then(draft => {
        // IndexedDB is async. If the technician started typing while we were
        // reading, their input is newer than the draft and must win.
        if (!cancelled && draft && !isDirty.current) setForm(draft.form)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDraftLoaded(true) })
    return () => { cancelled = true }
  }, [intervention.id])

  useEffect(() => {
    // Only save real edits. Saving an untouched form would persist initialForm
    // and let a stale local copy shadow assignment changes made on the server.
    // And once the bon is submitted the draft is gone deliberately: writing it
    // back here would resurrect it.
    if (!draftLoaded || !isDirty.current || saveStatus === 'saved') return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void saveWerkbon(intervention.id, form) }, 500)
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [form, draftLoaded, saveStatus, intervention.id])

  // How many werkbonnen already exist for this work order → bon number preview "-NN".
  // Falls back to the device the technician picked on-site, so a work order that
  // arrived without one does not sit frozen at -01. This is only a preview: the
  // server assigns the authoritative number under a row lock.
  const previewDeviceId = intervention.deviceId ?? form.deviceId
  useEffect(() => {
    if (!previewDeviceId) return
    fetch(`/api/devices/${previewDeviceId}/history`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: Array<{ workOrderId: string }>) =>
        setExistingCount(rows.filter(r => r.workOrderId === intervention.id).length))
      .catch(() => {})
  }, [intervention.id, previewDeviceId, saveStatus])

  useEffect(() => {
    fetch(`/api/tasks?work_order_id=${intervention.id}`)
      .then(r => r.ok ? r.json() : { tasks: [] })
      .then((data: { tasks: DbTask[] }) => {
        const all = data.tasks ?? []
        setOrderTasks(all.filter(t => t.type === 'order_part' || t.type === 'replenish_stock'))
        setWorkflowTasks(all.filter(t => t.type === 'pick_parts' || t.type === 'load_parts' || t.type === 'plan_revisit'))
      })
      .catch(() => {})
  }, [intervention.id, queuedPartIds, workflowRefresh])

  // Poll every 10s while a load_parts task is pending (waiting for warehouse to finish pick_parts).
  // Once pick_parts is marked done, the server promotes load_parts to ready — we pick that up here.
  useEffect(() => {
    const hasPendingLoad = workflowTasks.some(t => t.type === 'load_parts' && t.status === 'pending')
    if (!hasPendingLoad) return
    const interval = setInterval(() => setWorkflowRefresh(v => v + 1), 10_000)
    return () => clearInterval(interval)
  }, [workflowTasks])

  const update = useCallback(<K extends keyof WerkbonFormState>(field: K, value: WerkbonFormState[K]) => {
    isDirty.current = true
    setForm(prev => ({ ...prev, [field]: value }))
  }, [])

  function addPart(toOrder: boolean) {
    isDirty.current = true
    const part: PdfPart = { id: `p-${Date.now()}`, code: '', description: '', quantity: 1, toOrder, urgent: false }
    setForm(prev => ({ ...prev, parts: [...prev.parts, part] }))
  }

  function updatePart(id: string, field: keyof PdfPart, value: string | number | boolean) {
    isDirty.current = true
    setForm(prev => ({ ...prev, parts: prev.parts.map(p => (p.id === id ? { ...p, [field]: value } : p)) }))
  }

  function removePart(id: string) {
    isDirty.current = true
    setForm(prev => ({ ...prev, parts: prev.parts.filter(p => p.id !== id) }))
  }

  const handleSignature = useCallback((dataUrl: string | null) => update('signature', dataUrl), [update])

  function handleDevicePicked(device: Device) {
    setPickedDevice(device)
    update('deviceId', device.id)
  }

  const bonNumberPreview =
    bonNumber ?? `${intervention.ticketNumber ?? intervention.id}-${String(existingCount + 1).padStart(2, '0')}`
  const technicianName = intervention.technicians.find(t => t.technicianId === form.technicianId)?.name ?? ''

  /** Single place that maps form + intervention to the Service Bon PDF input. */
  function buildPdfData(): ServiceBonPdfData {
    const invoiceNumber =
      intervention.invoiceCustomerNumber && intervention.invoiceCustomerNumber !== intervention.customerNumber
        ? intervention.invoiceCustomerNumber
        : ''

    return {
      ticketNumber: intervention.ticketNumber ?? '',
      bonNumber: bonNumberPreview,
      ticketDate: intervention.ticketDate ?? intervention.createdAt ?? '',
      customerNumber: intervention.customerNumber ?? '',
      invoiceCustomerNumber: invoiceNumber,
      customerName: intervention.customerName,
      siteAddress: intervention.siteAddress,
      siteCity: intervention.siteCity,
      contactName: intervention.contactName ?? '',
      phones: [intervention.contactPhone, ...(intervention.sitePhones ?? [])].filter((p): p is string => Boolean(p)),
      closingDay: intervention.closingDay ?? '',
      deviceUnitNumber: pickedDevice?.unitNumber ?? intervention.deviceUnitNumber ?? '',
      deviceDescription: [
        pickedDevice?.brand ?? intervention.deviceBrand,
        pickedDevice?.model ?? intervention.deviceModel,
      ].filter(Boolean).join(' '),
      deviceDeliveryDate: pickedDevice?.deliveryDate ?? intervention.deviceDeliveryDate ?? '',
      deviceWarrantyUntil: pickedDevice?.warrantyUntil ?? intervention.deviceWarrantyUntil ?? '',
      customerDescription: intervention.description ?? '',
      technicianReport: form.notes,
      parts: form.parts,
      technicianName,
      visitDate: form.visitDate ? new Date(`${form.visitDate}T00:00:00`).toISOString() : '',
      arrivalTime: form.arrivalTime,
      departureTime: form.departureTime,
      interventionKind: form.interventionKind,
      tripCount: form.tripCount,
      personCount: form.personCount,
      remarks: form.remarks,
      signature: form.signature,
    }
  }

  async function handleSubmit() {
    setSaving(true)
    // Cancel any queued autosave. Without this, an edit made within 500ms of
    // tapping submit fires after deleteWerkbon and writes the draft back.
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const linkedTasks = tasks.filter(task => task.werkbonId === werkbonId)

    try {
      const pdfBlob = await generateWerkbonPDF(buildPdfData())

      const fd = new FormData()
      fd.append('changedBy', form.technicianId ?? intervention.technicians[0]?.technicianId ?? '')
      if (form.technicianId) fd.append('technicianId', form.technicianId)
      if (form.deviceId) fd.append('deviceId', form.deviceId)
      fd.append('completionNotes', form.notes)
      fd.append('remarks', form.remarks)
      fd.append('completionParts', JSON.stringify(form.parts))
      fd.append('followUp', JSON.stringify(linkedTasks))
      fd.append('visitDate', new Date(`${form.visitDate}T00:00:00`).toISOString())
      for (const key of ['arrivalTime', 'departureTime', 'workStart', 'workEnd'] as const) {
        if (form[key]) fd.append(key, form[key])
      }
      fd.append('interventionKind', form.interventionKind)
      fd.append('tripCount', String(form.tripCount))
      fd.append('personCount', String(form.personCount))
      if (form.signature) fd.append('signature', form.signature)
      fd.append('pdf', pdfBlob, `servicebon-${intervention.id}.pdf`)

      const res = await fetch(`/api/work-orders/${intervention.id}/complete`, { method: 'POST', body: fd })

      if (res.ok) {
        const json = (await res.json()) as { bonNumber: string }
        setBonNumber(json.bonNumber)
        setSaveStatus('saved')
        setDeviceRefresh(current => current + 1)
        isDirty.current = false
        await deleteWerkbon(intervention.id)

        for (const part of form.parts) {
          await queueTaskCommand('/api/tasks', 'POST', {
            work_order_id: intervention.id,
            // A part taken from stock is a refill, not a purchase. Keeping both
            // as order_part put refills in the warehouse's order queue and, worse,
            // exported them to the ERP as pending supplier orders for parts that
            // were already fitted.
            type: part.toOrder ? 'order_part' : 'replenish_stock',
            role: 'warehouse',
            title: part.toOrder
              ? `Bestellen: ${part.description || part.code || 'onderdeel'}`
              : `Stock aanvullen: ${part.description || part.code || 'onderdeel'}`,
            payload: {
              part_number: part.code,
              description: part.description,
              quantity:    part.quantity,
              urgency:     part.urgent ? 'urgent' : 'normal',
              order_type:  part.toOrder ? 'supplier_order' : 'stock_replenish',
            },
            client_id: part.id,
          })
        }

        if (form.parts.length > 0) {
          setQueuedPartIds(new Set(form.parts.map(p => p.id)))
        }
      } else {
        console.error('Complete route error:', res.status, await res.text())
        setSaveStatus('error')
      }
    } catch (err) {
      console.error('Submit error:', err)
      setSaveStatus('error')
    }

    setSaving(false)
  }

  const deviceKnown = Boolean(form.deviceId)

  return (
    <div className="flex flex-col gap-4 pb-10">
      <BonHeaderCard intervention={intervention} bonNumberPreview={bonNumberPreview} />

      <div className="flex flex-wrap gap-2 px-1">
        {STATUS_OPTIONS.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => update('status', s.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              form.status === s.value ? s.activeClass : s.inactiveClass
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {deviceKnown ? (
        <DevicePanel
          deviceId={form.deviceId}
          brand={pickedDevice?.brand ?? intervention.deviceBrand}
          model={pickedDevice?.model ?? intervention.deviceModel}
          refreshKey={deviceRefresh}
        />
      ) : (
        <DevicePicker siteId={intervention.siteId} onPick={handleDevicePicked} />
      )}

      <Section title="OMSCHRIJVING KLANT | OBSERVATIONS CLIENT">
        <p className="text-sm text-ink whitespace-pre-wrap">{intervention.description || '—'}</p>
      </Section>

      <Section title="TECHNICUS RAPPORT | RAPPORT TECHNICIEN">
        <textarea
          rows={5}
          placeholder="Wat heb je vastgesteld en gedaan?"
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
          className="w-full rounded-xl p-3 text-sm resize-none outline-none bg-surface border border-stroke text-ink"
        />
      </Section>

      <PartsSection
        parts={form.parts}
        onAddPart={addPart}
        onUpdatePart={updatePart}
        onRemovePart={removePart}
        queuedPartIds={queuedPartIds}
      />

      <VisitSection form={form} technicians={intervention.technicians} onChange={update} />

      <Section title="OPMERKINGEN | REMARQUES">
        <textarea
          rows={3}
          placeholder="Opmerkingen voor kantoor of volgende technieker"
          value={form.remarks}
          onChange={e => update('remarks', e.target.value)}
          className="w-full rounded-xl p-3 text-sm resize-none outline-none bg-surface border border-stroke text-ink"
        />
      </Section>

      <PhotoUploadSection workOrderId={intervention.id} technicianId={form.technicianId} />

      <TaskManager
        intervention={intervention}
        werkbonId={werkbonId}
        orderTasks={orderTasks}
        workflowTasks={workflowTasks}
        onWorkflowTaskComplete={() => setWorkflowRefresh(r => r + 1)}
        initialActivityId={initialActivityId}
      />

      <Section title="AKKOORD VAN KLANT | ACCORD DU CLIENT">
        <SignaturePad signature={form.signature} onSignatureChange={handleSignature} />
        {technicianName && <p className="mt-2 text-xs text-ink-soft">Technicus: {technicianName}</p>}
      </Section>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || saveStatus === 'saved'}
        className="w-full py-4 rounded-xl font-bold text-white text-base disabled:opacity-60 bg-brand-orange"
      >
        {saving ? 'Bon afsluiten...' : saveStatus === 'saved' ? '✓ Bon afgesloten' : 'Bon afsluiten & PDF'}
      </button>

      {saveStatus === 'saved' && bonNumber && (
        <p className="text-center text-sm font-semibold text-brand-green">✓ Service bon {bonNumber} opgeslagen</p>
      )}
      {saveStatus === 'error' && (
        <p className="text-center text-sm font-semibold text-brand-red">✗ Opslaan mislukt — probeer opnieuw</p>
      )}
    </div>
  )
}
