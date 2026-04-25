'use client'

import { useCallback, useEffect, useState } from 'react'
import SignaturePad from '@/components/SignaturePad'
import DevicePanel from '@/components/DevicePanel'
import { generateWerkbonPDF } from '@/lib/pdf'
import type { PdfPart, PdfTaskItem } from '@/lib/pdf'
import { useTasks } from '@/lib/task-store'
import { queueTaskCommand } from '@/lib/tasks/sync'
import { getTaskStatusLabel } from '@/lib/task-meta'
import { getUserById } from '@/lib/mock-data'
import type { Intervention, DbTask, Task, User } from '@/types'

function getAssignmentLabel(task: Pick<Task, 'assigneeType' | 'assigneeUserId' | 'assigneeRole'>): string {
  if (task.assigneeType === 'group' && task.assigneeRole) {
    const labels: Record<User['role'], string> = {
      technician: 'Techniekers', admin: 'Admin', office: 'Office', warehouse: 'Magazijn', hr: 'HR',
    }
    return labels[task.assigneeRole] ?? task.assigneeRole
  }
  return getUserById(task.assigneeUserId ?? '')?.name ?? 'Onbekende gebruiker'
}
import PartsSection from './PartsSection'
import PhotoUploadSection from './PhotoUploadSection'
import TaskManager from './TaskManager'
import Section from './Section'

interface FormState {
  status: string
  workStart: string
  workEnd: string
  description: string
  parts: PdfPart[]
  signature: string | null
}

const STATUS_OPTIONS = [
  { value: 'gepland',          label: 'Gepland',               activeClass: 'bg-stroke text-ink-soft border-stroke',           inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'onderweg',         label: 'Onderweg',              activeClass: 'bg-brand-orange text-white border-brand-orange',   inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'bezig',            label: 'Bezig',                 activeClass: 'bg-brand-blue text-white border-brand-blue',       inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'wacht_onderdelen', label: 'Wacht op onderdelen',   activeClass: 'bg-brand-red text-white border-brand-red',         inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'afgewerkt',        label: 'Afgewerkt',             activeClass: 'bg-brand-green text-white border-brand-green',     inactiveClass: 'bg-surface text-ink-soft border-stroke' },
]

function now() { return new Date().toISOString() }

function isoToHHMM(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  intervention: Intervention
  initialActivityId?: string
}

export default function WerkbonForm({ intervention, initialActivityId }: Props) {
  const { tasks } = useTasks()
  const werkbonId = `wb-${intervention.id}`

  const [form, setForm] = useState<FormState>({
    status: intervention.status,
    workStart: '',
    workEnd: '',
    description: '',
    parts: [],
    signature: null,
  })
  const [pdfLoading, setPdfLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [deviceRefresh, setDeviceRefresh] = useState(0)
  const [queuedPartIds, setQueuedPartIds] = useState<Set<string>>(new Set())
  const [orderTasks, setOrderTasks] = useState<DbTask[]>([])
  const [workflowTasks, setWorkflowTasks] = useState<DbTask[]>([])
  const [workflowRefresh, setWorkflowRefresh] = useState(0)

  useEffect(() => {
    fetch(`/api/tasks?work_order_id=${intervention.id}`)
      .then(r => r.ok ? r.json() : { tasks: [] })
      .then((data: { tasks: DbTask[] }) => {
        const all = data.tasks ?? []
        setOrderTasks(all.filter(t => t.type === 'order_part'))
        setWorkflowTasks(all.filter(t => t.type === 'load_parts' || t.type === 'plan_revisit'))
      })
      .catch(() => {})
  }, [intervention.id, queuedPartIds, workflowRefresh])

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function markStartWork() {
    setForm(prev => ({ ...prev, workStart: now(), status: 'bezig' }))
  }

  function markEndWork() {
    setForm(prev => ({ ...prev, workEnd: now(), status: 'afgewerkt' }))
  }

  function setTimeField(field: 'workStart' | 'workEnd', hhmm: string) {
    if (!hhmm) { setForm(prev => ({ ...prev, [field]: '' })); return }
    const [h, m] = hhmm.split(':').map(Number)
    setForm(prev => {
      const base = prev[field] ? new Date(prev[field]) : new Date()
      base.setHours(h, m, 0, 0)
      return { ...prev, [field]: base.toISOString() }
    })
  }

  function addPart(toOrder: boolean) {
    const part: PdfPart = { id: `p-${Date.now()}`, code: '', description: '', quantity: 1, toOrder, urgent: false }
    setForm(prev => ({ ...prev, parts: [...prev.parts, part] }))
  }

  function updatePart(id: string, field: keyof PdfPart, value: string | number | boolean) {
    setForm(prev => ({
      ...prev,
      parts: prev.parts.map(p => p.id === id ? { ...p, [field]: value } : p),
    }))
  }

  function removePart(id: string) {
    setForm(prev => ({ ...prev, parts: prev.parts.filter(p => p.id !== id) }))
  }

  const handleSignature = useCallback((dataUrl: string | null) => {
    setForm(prev => ({ ...prev, signature: dataUrl }))
  }, [])

  async function handlePDF() {
    setPdfLoading(true)
    await new Promise(resolve => setTimeout(resolve, 200))

    const linkedTasks = tasks.filter(task => task.werkbonId === werkbonId)
    const pdfTasks: PdfTaskItem[] = linkedTasks.map(task => ({
      id: task.id,
      title: task.title,
      assigneeName: getAssignmentLabel(task),
      priority: task.priority,
      dueDate: task.dueDate ?? '',
      statusLabel: getTaskStatusLabel(task.status),
    }))

    try {
      const pdfBlob = generateWerkbonPDF({
        customerName: intervention.customerName,
        siteName: intervention.siteName,
        siteAddress: intervention.siteAddress,
        siteCity: intervention.siteCity,
        deviceBrand: intervention.deviceBrand || '',
        deviceModel: intervention.deviceModel || '',
        status: form.status,
        workStart: form.workStart,
        workEnd: form.workEnd,
        description: form.description,
        parts: form.parts,
        followUp: [],
        tasks: pdfTasks,
        signature: form.signature,
      })

      const fd = new FormData()
      fd.append('changedBy', intervention.technicians[0]?.technicianId ?? '')
      fd.append('completionNotes', form.description)
      fd.append('completionParts', JSON.stringify(form.parts))
      fd.append('followUp', JSON.stringify(linkedTasks))
      if (form.workStart) fd.append('workStart', form.workStart)
      if (form.workEnd) fd.append('workEnd', form.workEnd)
      fd.append('pdf', pdfBlob, `werkbon-${intervention.id}.pdf`)

      const res = await fetch(`/api/work-orders/${intervention.id}/complete`, {
        method: 'POST',
        body: fd,
      })

      if (res.ok) {
        setSaveStatus('saved')
        setDeviceRefresh(current => current + 1)

        for (const part of form.parts) {
          await queueTaskCommand('/api/tasks', 'POST', {
            work_order_id: intervention.id,
            type: 'order_part',
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
      console.error('PDF error:', err)
      setSaveStatus('error')
    }

    setPdfLoading(false)
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
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

      <DevicePanel
        deviceId={intervention.deviceId}
        brand={intervention.deviceBrand}
        model={intervention.deviceModel}
        currentWorkOrderId={intervention.id}
        refreshKey={deviceRefresh}
      />

      <Section title="STATUS">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(s => (
            <button key={s.value} type="button" onClick={() => update('status', s.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-opacity border ${form.status === s.value ? s.activeClass : s.inactiveClass}`}>
              {s.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="TIJDREGISTRATIE">
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { label: 'Werk start', value: form.workStart, field: 'workStart' as const },
            { label: 'Werk einde', value: form.workEnd,   field: 'workEnd'   as const },
          ].map(item => (
            <label key={item.label} className="rounded-xl p-3 text-center bg-surface block">
              <p className="text-xs mb-1 text-ink-soft">{item.label}</p>
              {item.value ? (
                <input type="time" value={isoToHHMM(item.value)}
                  onChange={e => setTimeField(item.field, e.target.value)}
                  className="w-full text-xl font-bold text-ink bg-transparent text-center outline-none" />
              ) : (
                <p className="text-xl font-bold text-ink">--:--</p>
              )}
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {!form.workStart && (
            <button type="button" onClick={markStartWork}
              className="w-full py-3 rounded-xl font-bold text-white text-sm bg-brand-blue">
              Start werk
            </button>
          )}
          {form.workStart && !form.workEnd && (
            <button type="button" onClick={markEndWork}
              className="w-full py-3 rounded-xl font-bold text-white text-sm bg-brand-green">
              Werk beëindigen
            </button>
          )}
        </div>
      </Section>

      <Section title="OMSCHRIJVING WERKZAAMHEDEN">
        <textarea rows={5} placeholder="Beschrijf de uitgevoerde werkzaamheden..."
          value={form.description} onChange={e => update('description', e.target.value)}
          className="w-full rounded-xl p-3 text-sm resize-none outline-none bg-surface border border-stroke text-ink" />
      </Section>

      <PartsSection
        parts={form.parts}
        onAddPart={addPart}
        onUpdatePart={updatePart}
        onRemovePart={removePart}
        queuedPartIds={queuedPartIds}
      />

      <PhotoUploadSection
        workOrderId={intervention.id}
        technicianId={intervention.technicians[0]?.technicianId ?? null}
      />

      <TaskManager
        intervention={intervention}
        werkbonId={werkbonId}
        orderTasks={orderTasks}
        workflowTasks={workflowTasks}
        onWorkflowTaskComplete={() => setWorkflowRefresh(r => r + 1)}
        initialActivityId={initialActivityId}
      />

      <Section title="HANDTEKENING KLANT">
        <SignaturePad signature={form.signature} onSignatureChange={handleSignature} />
      </Section>

      <button type="button" onClick={handlePDF} disabled={pdfLoading}
        className="w-full py-4 rounded-xl font-bold text-white text-base disabled:opacity-60 bg-brand-orange">
        {pdfLoading ? 'PDF aanmaken...' : 'PDF Genereren & Opslaan'}
      </button>

      {saveStatus === 'saved' && (
        <p className="text-center text-sm font-semibold text-brand-green">✓ Werkbon opgeslagen</p>
      )}
      {saveStatus === 'error' && (
        <p className="text-center text-sm font-semibold text-brand-red">✗ Opslaan mislukt — zie console</p>
      )}
    </div>
  )
}
