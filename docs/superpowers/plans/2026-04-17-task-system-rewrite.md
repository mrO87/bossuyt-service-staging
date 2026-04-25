# Task System Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Bossuyt task system from localStorage to PostgreSQL, adding conditional chaining, role queues, work-order timeline events, inter-work-order links, and an ERP-ready REST surface — without touching the existing work order, werkbon, or assignment tables.

**Architecture:** Append 6 new tables to the existing Drizzle schema and push with `drizzle-kit push`. Build pure-function business logic first (transitions, dependency checks, queue queries), then REST API routes, then offline sync via a new IndexedDB `task_commands` store, and finally a one-shot localStorage migration. The old `TaskProvider` / localStorage path stays untouched until Phase 6 completes.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM 0.45 + postgres-js, `idb` for IndexedDB, existing `withAudit` helper, `drizzle-kit push` (no SQL migration files).

---

## File map

| File | Action | Phase |
|---|---|---|
| `types/index.ts` | Modify — append new types | 1 |
| `lib/db/schema.ts` | Modify — append 6 tables, add `externalRef` to workOrders | 1 |
| `lib/tasks/transitions.ts` | Create | 2 |
| `lib/tasks/dependencies.ts` | Create | 2 |
| `lib/tasks/queue.ts` | Create | 2 |
| `app/api/tasks/route.ts` | Create — GET + POST | 3 |
| `app/api/tasks/[id]/route.ts` | Create — PATCH | 3 |
| `app/api/tasks/[id]/transition/route.ts` | Create — POST | 3 |
| `app/api/tasks/queue/route.ts` | Create — GET | 3 |
| `app/api/work-orders/[id]/timeline/route.ts` | Create — GET | 3 |
| `app/api/work-orders/[id]/link/route.ts` | Create — POST | 3 |
| `app/api/work-orders/[id]/links/route.ts` | Create — GET | 3 |
| `app/api/erp/work-orders/route.ts` | Create — GET | 4 |
| `app/api/erp/work-orders/[id]/external-ref/route.ts` | Create — POST | 4 |
| `app/api/erp/parts-pending/route.ts` | Create — GET | 4 |
| `app/api/erp/parts-pending/[task_id]/fulfil/route.ts` | Create — POST | 4 |
| `lib/idb.ts` | Modify — add `task_commands` store, bump version to 3 | 5 |
| `lib/tasks/sync.ts` | Create | 5 |
| `lib/tasks/migrate.ts` | Create | 6 |

---

## Naming note — why `DbTaskStatus` and `DbTaskType`

The existing `types/index.ts` already exports `TaskStatus` (Dutch values: 'open', 'gepland', …) and `TaskType` (Dutch: 'email', 'bellen', …) used by `lib/task-store.tsx`. Because `lib/task-store.tsx` must stay untouched as a fallback, we cannot rename the existing types. The new DB-backed types are prefixed with `Db` to coexist without collision. When Phase 6 migration is complete and `task-store.tsx` is removed, the `Db` prefix can be dropped.

---

## Task 1 — Add new types to `types/index.ts`

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Append the new type block to the end of `types/index.ts`**

Open `types/index.ts` and add this entire block after the last line:

```ts
// ── DB-backed task system (Phase 1, 2026-04-17) ──────────────────────────────
// Existing TaskStatus / TaskType keep their Dutch values for lib/task-store.tsx.
// These new types use English values for the PostgreSQL task system.

export type DbTaskStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'done'
  | 'skipped'
  | 'cancelled'
  | 'blocked'

export type DbTaskType =
  | 'order_part'
  | 'plan_revisit'
  | 'contact_customer'
  | 'internal_note'
  | 'quality_check'
  | 'approval'
  | 'other'

export type TaskRole = 'technician' | 'warehouse' | 'office' | 'admin'

export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'

export type WorkOrderLinkType =
  | 'revisit'
  | 'follow_up'
  | 'warranty_claim'
  | 'split'
  | 'related'

export type ReasonCode =
  | 'part_needed'
  | 'customer_unavailable'
  | 'additional_work_found'
  | 'warranty'
  | 'quality_issue'
  | 'cancelled_by_customer'
  | 'other'

/** Shape returned by the API for a DB-backed task. */
export interface DbTask {
  id: string
  workOrderId: string
  werkbonId: string | null
  templateId: string | null
  type: DbTaskType
  role: TaskRole
  status: DbTaskStatus
  title: string
  description: string | null
  assigneeId: string | null
  seq: number
  dueDate: string | null       // ISO 8601
  completedAt: string | null   // ISO 8601
  completedBy: string | null
  skipReason: string | null
  reasonCode: ReasonCode | null
  payload: Record<string, unknown> | null
  createdAt: string            // ISO 8601
  createdBy: string | null
  updatedAt: string            // ISO 8601
  // Populated by the query layer when requested:
  predecessorIds?: string[]
  successorIds?: string[]
}

export interface TaskTemplate {
  id: string
  name: string
  description: string | null
  defaultRole: TaskRole
  defaultType: DbTaskType
  triggerOnComplete: boolean
  autoCreate: boolean
  delayMinutes: number
  createdAt: string
  active: boolean
}

export interface TaskTemplateEdge {
  id: string
  fromTemplateId: string
  toTemplateId: string
  depType: DependencyType
  autoCreate: boolean
}

export interface WorkOrderLink {
  id: string
  fromWorkOrderId: string
  toWorkOrderId: string
  linkType: WorkOrderLinkType
  reasonCode: ReasonCode | null
  note: string | null
  createdAt: string
  createdBy: string | null
}

export interface WorkOrderEvent {
  id: number
  occurredAt: string
  recordedAt: string
  workOrderId: string
  taskId: string | null
  actorId: string | null
  eventType: string
  payload: Record<string, unknown>
  clientId: string | null
  taskTitle?: string | null   // populated by timeline query
}
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
cd /mnt/data/bossuyt_service_next_staging && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: 0 new errors (same baseline as before).

- [ ] **Step 3: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add types/index.ts && git commit -m "feat: add DB-backed task system types alongside existing legacy types"
```

---

## Task 2 — Extend the Drizzle schema with 6 new tables

**Files:**
- Modify: `lib/db/schema.ts`

After editing, we push immediately with `npm run db:push` so the tables exist for all later tasks.

- [ ] **Step 1: Add `index` to the drizzle-orm/pg-core import and add new type imports**

In `lib/db/schema.ts`, find the two existing import blocks and replace them with:

```ts
import { relations } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import type {
  DbTaskStatus,
  DbTaskType,
  DependencyType,
  InterventionSource,
  InterventionStatus,
  InterventionType,
  ReasonCode,
  TaskRole,
  User,
  WorkOrderLinkType,
} from '@/types'
```

- [ ] **Step 2: Add `externalRef` column to `workOrders`**

Inside the `workOrders` table definition, add this line immediately after `completedAt`:

```ts
  externalRef: text('external_ref'),           // stamped back by Navision/Odoo via ERP API
```

- [ ] **Step 3: Append the 6 new tables at the end of `lib/db/schema.ts`**

Add the following after the `workOrderPhotosRelations` export (the current last line of the file):

```ts
// ── Task system ───────────────────────────────────────────────────────────────
// task_templates is declared first because tasks has a FK → task_templates.id.

export const taskTemplates = pgTable('task_templates', {
  id:                text('id').primaryKey(),
  name:              text('name').notNull(),
  description:       text('description'),
  defaultRole:       text('default_role').$type<TaskRole>().notNull(),
  defaultType:       text('default_type').$type<DbTaskType>().notNull(),
  triggerOnComplete: boolean('trigger_on_complete').notNull().default(false),
  autoCreate:        boolean('auto_create').notNull().default(false),
  delayMinutes:      integer('delay_minutes').notNull().default(0),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  active:            boolean('active').notNull().default(true),
})

export const tasks = pgTable(
  'tasks',
  {
    id:          text('id').primaryKey(),
    workOrderId: text('work_order_id').notNull()
      .references(() => workOrders.id, { onDelete: 'restrict' }),
    werkbonId:   text('werkbon_id')
      .references(() => werkbonnen.id, { onDelete: 'set null' }),
    templateId:  text('template_id')
      .references(() => taskTemplates.id, { onDelete: 'set null' }),
    type:        text('type').$type<DbTaskType>().notNull(),
    role:        text('role').$type<TaskRole>().notNull(),
    status:      text('status').$type<DbTaskStatus>().notNull().default('pending'),
    title:       text('title').notNull(),
    description: text('description'),
    assigneeId:  text('assignee_id')
      .references(() => technicians.id, { onDelete: 'set null' }),
    seq:         integer('seq').notNull().default(0),
    dueDate:     timestamp('due_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: text('completed_by')
      .references(() => technicians.id, { onDelete: 'set null' }),
    skipReason:  text('skip_reason'),
    reasonCode:  text('reason_code').$type<ReasonCode>(),
    payload:     jsonb('payload'),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy:   text('created_by'),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (tbl) => ({
    byWorkOrder:      index('tasks_work_order_id_idx').on(tbl.workOrderId),
    byRoleStatus:     index('tasks_role_status_idx').on(tbl.role, tbl.status),
    byAssigneeStatus: index('tasks_assignee_status_idx').on(tbl.assigneeId, tbl.status),
  }),
)

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    id:            text('id').primaryKey(),
    predecessorId: text('predecessor_id').notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    successorId:   text('successor_id').notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    depType:       text('dep_type').$type<DependencyType>().notNull().default('finish_to_start'),
    lagMinutes:    integer('lag_minutes').notNull().default(0),
  },
  (tbl) => ({
    uniquePair: unique('task_dep_pair_unique').on(tbl.predecessorId, tbl.successorId),
  }),
)

export const taskTemplateEdges = pgTable(
  'task_template_edges',
  {
    id:             text('id').primaryKey(),
    fromTemplateId: text('from_template_id').notNull()
      .references(() => taskTemplates.id, { onDelete: 'cascade' }),
    toTemplateId:   text('to_template_id').notNull()
      .references(() => taskTemplates.id, { onDelete: 'cascade' }),
    depType:        text('dep_type').$type<DependencyType>().notNull().default('finish_to_start'),
    autoCreate:     boolean('auto_create').notNull().default(false),
  },
  (tbl) => ({
    uniqueEdge: unique('task_template_edge_unique').on(tbl.fromTemplateId, tbl.toTemplateId),
  }),
)

export const workOrderLinks = pgTable(
  'work_order_links',
  {
    id:              text('id').primaryKey(),
    fromWorkOrderId: text('from_work_order_id').notNull()
      .references(() => workOrders.id, { onDelete: 'restrict' }),
    toWorkOrderId:   text('to_work_order_id').notNull()
      .references(() => workOrders.id, { onDelete: 'restrict' }),
    linkType:        text('link_type').$type<WorkOrderLinkType>().notNull(),
    reasonCode:      text('reason_code').$type<ReasonCode>(),
    note:            text('note'),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy:       text('created_by'),
  },
  (tbl) => ({
    uniqueLink: unique('work_order_link_unique').on(
      tbl.fromWorkOrderId, tbl.toWorkOrderId, tbl.linkType,
    ),
  }),
)

export const workOrderEvents = pgTable(
  'work_order_events',
  {
    id:          bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt:  timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    recordedAt:  timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    workOrderId: text('work_order_id').notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    taskId:      text('task_id')
      .references(() => tasks.id, { onDelete: 'set null' }),
    actorId:     text('actor_id'),
    eventType:   text('event_type').notNull(),
    payload:     jsonb('payload').notNull().default({}),
    clientId:    text('client_id'),
  },
  (tbl) => ({
    byWorkOrderTime: index('woe_work_order_occurred_at_idx').on(tbl.workOrderId, tbl.occurredAt),
    byTaskId:        index('woe_task_id_idx').on(tbl.taskId),
  }),
)
```

- [ ] **Step 4: Push schema to the database**

```bash
cd /mnt/data/bossuyt_service_next_staging && npm run db:push
```

Expected: output ends with `All changes applied` or similar success message.

- [ ] **Step 5: Verify the tables were created**

```bash
docker exec bossuyt-db-staging psql -U postgres -d bossuyt -c "\dt" 2>/dev/null | grep -E "task|work_order_link|work_order_event"
```

Expected: lines for `task_templates`, `tasks`, `task_dependencies`, `task_template_edges`, `work_order_links`, `work_order_events`.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /mnt/data/bossuyt_service_next_staging && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: 0 new errors.

- [ ] **Step 7: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add lib/db/schema.ts && git commit -m "feat: add 6 task-system tables to Drizzle schema and push"
```

---

## Task 3 — Pure business logic: `lib/tasks/transitions.ts`

**Files:**
- Create: `lib/tasks/transitions.ts`

This is a pure function — no database, no network, no side effects. It maps (currentStatus + action) → nextStatus. Being pure makes it trivially testable.

- [ ] **Step 1: Create `lib/tasks/transitions.ts`**

```ts
/**
 * lib/tasks/transitions.ts
 *
 * Pure function: maps (currentStatus, action) → nextStatus.
 * Returns null if the transition is not allowed.
 *
 * No database. No network. No side effects.
 * This makes it safe to call from both server and client code.
 */
import type { DbTaskStatus } from '@/types'

export type TaskAction = 'start' | 'complete' | 'skip' | 'block' | 'cancel' | 'reopen'

// All legal transitions in one table.
// Missing action = forbidden transition.
const TRANSITIONS: Record<DbTaskStatus, Partial<Record<TaskAction, DbTaskStatus>>> = {
  pending:     { cancel: 'cancelled' },
  ready:       { start: 'in_progress', cancel: 'cancelled' },
  in_progress: {
    complete: 'done',
    skip:     'skipped',
    block:    'blocked',
    cancel:   'cancelled',
  },
  done:        { reopen: 'in_progress' },
  skipped:     { reopen: 'in_progress' },
  blocked:     { start: 'in_progress', cancel: 'cancelled' },
  cancelled:   {},
}

/**
 * Returns the next status after applying `action` to `current`,
 * or null when the transition is not allowed.
 */
export function getNextStatus(
  current: DbTaskStatus,
  action: TaskAction,
): DbTaskStatus | null {
  return TRANSITIONS[current]?.[action] ?? null
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /mnt/data/bossuyt_service_next_staging && npx tsc --noEmit --skipLibCheck 2>&1 | grep "transitions" | head -5
```

Expected: no output (no errors in this file).

- [ ] **Step 3: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add lib/tasks/transitions.ts && git commit -m "feat: add pure task status transition function"
```

---

## Task 4 — Business logic: `lib/tasks/dependencies.ts`

**Files:**
- Create: `lib/tasks/dependencies.ts`

Three functions:
1. `isTaskReady` — are all predecessors satisfied?
2. `activateReadySuccessors` — flip pending successors to ready after a task completes
3. `createSuccessorFromTemplate` — auto-materialise a new task from a template edge

All three accept `dbOrTx` so they can run standalone or inside an existing `withAudit` transaction.

- [ ] **Step 1: Create `lib/tasks/dependencies.ts`**

```ts
/**
 * lib/tasks/dependencies.ts
 *
 * Business logic for task dependency management.
 *
 * Each function accepts a `dbOrTx` parameter (defaults to the global `db`)
 * so it can be called both standalone AND inside a withAudit transaction.
 * Pass the `tx` from withAudit to keep reads + writes in a single transaction.
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  taskDependencies,
  taskTemplates,
  tasks,
  workOrderEvents,
} from '@/lib/db/schema'
import type { DependencyType } from '@/types'

// Drizzle's transaction object shares the same CRUD API as `db`.
// We use `typeof db` as a practical type alias for both.
type DbOrTx = typeof db

/**
 * Returns true when ALL predecessors of `taskId` satisfy their dependency type.
 * Returns true immediately when the task has no predecessors at all.
 *
 * Dependency types:
 *   finish_to_start  — predecessor must be 'done'
 *   start_to_start   — predecessor must be 'in_progress' or 'done'
 *   finish_to_finish — predecessor must be 'done'
 */
export async function isTaskReady(
  taskId: string,
  dbOrTx: DbOrTx = db,
): Promise<boolean> {
  const deps = await dbOrTx
    .select()
    .from(taskDependencies)
    .where(eq(taskDependencies.successorId, taskId))

  if (deps.length === 0) return true

  const predecessorIds = deps.map(d => d.predecessorId)

  const predecessors = await dbOrTx
    .select({ id: tasks.id, status: tasks.status })
    .from(tasks)
    .where(inArray(tasks.id, predecessorIds))

  const statusMap = new Map(predecessors.map(p => [p.id, p.status]))

  return deps.every(dep => {
    const predStatus = statusMap.get(dep.predecessorId)
    if (!predStatus) return false

    switch (dep.depType as DependencyType) {
      case 'finish_to_start':
        return predStatus === 'done'
      case 'start_to_start':
        return predStatus === 'in_progress' || predStatus === 'done'
      case 'finish_to_finish':
        return predStatus === 'done'
      default:
        return false
    }
  })
}

/**
 * After a task is completed, scans its successors and promotes any that are
 * now ready from 'pending' → 'ready'.
 *
 * Emits a 'task_ready' event for each newly activated successor.
 * Returns the list of newly activated task IDs.
 */
export async function activateReadySuccessors(
  completedTaskId: string,
  dbOrTx: DbOrTx = db,
): Promise<string[]> {
  const successorDeps = await dbOrTx
    .select()
    .from(taskDependencies)
    .where(eq(taskDependencies.predecessorId, completedTaskId))

  if (successorDeps.length === 0) return []

  const activated: string[] = []
  const now = new Date()

  for (const dep of successorDeps) {
    const ready = await isTaskReady(dep.successorId, dbOrTx)
    if (!ready) continue

    const [successor] = await dbOrTx
      .select()
      .from(tasks)
      .where(eq(tasks.id, dep.successorId))

    // Only promote tasks that are still in 'pending' state.
    // (skip if already activated, cancelled, or in another terminal state)
    if (!successor || successor.status !== 'pending') continue

    await dbOrTx
      .update(tasks)
      .set({ status: 'ready', updatedAt: now })
      .where(eq(tasks.id, dep.successorId))

    await dbOrTx.insert(workOrderEvents).values({
      workOrderId: successor.workOrderId,
      taskId:      dep.successorId,
      actorId:     'system',
      eventType:   'task_ready',
      payload:     { triggeredBy: completedTaskId },
    })

    activated.push(dep.successorId)
  }

  return activated
}

/**
 * When a template edge has autoCreate = true, this function materialises a new
 * task from the successor template and links it to the completed task via a
 * task_dependency row.
 *
 * Call this after completing a task, once per template edge where
 * edge.fromTemplateId === completedTask.templateId AND edge.autoCreate === true.
 *
 * Returns the newly created task's id, or null if the template is missing/inactive.
 */
export async function createSuccessorFromTemplate(
  completedTask: {
    id: string
    workOrderId: string
    werkbonId: string | null
    templateId: string | null
  },
  edge: { toTemplateId: string; depType: string },
  dbOrTx: DbOrTx = db,
): Promise<{ id: string } | null> {
  const [template] = await dbOrTx
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.id, edge.toTemplateId))

  if (!template || !template.active) return null

  const newTaskId = crypto.randomUUID()
  const now = new Date()

  await dbOrTx.insert(tasks).values({
    id:          newTaskId,
    workOrderId: completedTask.workOrderId,
    werkbonId:   completedTask.werkbonId,
    templateId:  template.id,
    type:        template.defaultType,
    role:        template.defaultRole,
    status:      'pending',
    title:       template.name,
    description: template.description,
    seq:         0,
    createdBy:   'system',
    updatedAt:   now,
  })

  await dbOrTx.insert(taskDependencies).values({
    id:            crypto.randomUUID(),
    predecessorId: completedTask.id,
    successorId:   newTaskId,
    depType:       edge.depType as DependencyType,
    lagMinutes:    0,
  })

  await dbOrTx.insert(workOrderEvents).values({
    workOrderId: completedTask.workOrderId,
    taskId:      newTaskId,
    actorId:     'system',
    eventType:   'task_created',
    payload:     {
      source:     'auto_chain',
      fromTaskId: completedTask.id,
      templateId: template.id,
    },
  })

  // If the newly created task has no other predecessors, it's immediately ready.
  const ready = await isTaskReady(newTaskId, dbOrTx)
  if (ready) {
    await dbOrTx
      .update(tasks)
      .set({ status: 'ready', updatedAt: now })
      .where(eq(tasks.id, newTaskId))
  }

  return { id: newTaskId }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /mnt/data/bossuyt_service_next_staging && npx tsc --noEmit --skipLibCheck 2>&1 | grep "dependencies" | head -5
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add lib/tasks/dependencies.ts && git commit -m "feat: add task dependency business logic (isTaskReady, activateReadySuccessors, createSuccessorFromTemplate)"
```

---

## Task 5 — Business logic: `lib/tasks/queue.ts`

**Files:**
- Create: `lib/tasks/queue.ts`

Role queue and technician queue, both sorted by urgency → due date (nulls last) → seq.

- [ ] **Step 1: Create `lib/tasks/queue.ts`**

```ts
/**
 * lib/tasks/queue.ts
 *
 * Queue queries: returns tasks that are actionable right now.
 *
 * Sort order: urgent work orders first, then by due date (nulls last), then
 * by the display-order seq column within the work order.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, workOrders } from '@/lib/db/schema'
import type { DbTask, TaskRole } from '@/types'

// All task columns we need — defined once so both queries stay in sync.
const TASK_COLS = {
  id:          tasks.id,
  workOrderId: tasks.workOrderId,
  werkbonId:   tasks.werkbonId,
  templateId:  tasks.templateId,
  type:        tasks.type,
  role:        tasks.role,
  status:      tasks.status,
  title:       tasks.title,
  description: tasks.description,
  assigneeId:  tasks.assigneeId,
  seq:         tasks.seq,
  dueDate:     tasks.dueDate,
  completedAt: tasks.completedAt,
  completedBy: tasks.completedBy,
  skipReason:  tasks.skipReason,
  reasonCode:  tasks.reasonCode,
  payload:     tasks.payload,
  createdAt:   tasks.createdAt,
  createdBy:   tasks.createdBy,
  updatedAt:   tasks.updatedAt,
} as const

/** Returns all 'ready' or 'in_progress' tasks for the given role. */
export async function getQueueForRole(role: TaskRole): Promise<DbTask[]> {
  const rows = await db
    .select(TASK_COLS)
    .from(tasks)
    .innerJoin(workOrders, eq(tasks.workOrderId, workOrders.id))
    .where(
      and(
        eq(tasks.role, role),
        inArray(tasks.status, ['ready', 'in_progress']),
      ),
    )
    .orderBy(
      desc(workOrders.isUrgent),
      asc(sql`${tasks.dueDate} NULLS LAST`),
      asc(tasks.seq),
    )

  return rows.map(toDbTask)
}

/**
 * Returns tasks for a specific technician:
 *   - Tasks assigned to them (ready or in_progress)
 *   - Unassigned tasks in the 'technician' role that are ready
 *
 * Duplicate rows (a technician might appear in both sets) are deduplicated.
 */
export async function getQueueForTechnician(technicianId: string): Promise<DbTask[]> {
  // Assigned tasks in progress or ready
  const assigned = await db
    .select(TASK_COLS)
    .from(tasks)
    .innerJoin(workOrders, eq(tasks.workOrderId, workOrders.id))
    .where(
      and(
        eq(tasks.assigneeId, technicianId),
        inArray(tasks.status, ['ready', 'in_progress']),
      ),
    )
    .orderBy(
      desc(workOrders.isUrgent),
      asc(sql`${tasks.dueDate} NULLS LAST`),
      asc(tasks.seq),
    )

  // Unassigned technician-role tasks that are ready (open pool)
  const unassigned = await db
    .select(TASK_COLS)
    .from(tasks)
    .innerJoin(workOrders, eq(tasks.workOrderId, workOrders.id))
    .where(
      and(
        eq(tasks.role, 'technician'),
        isNull(tasks.assigneeId),
        eq(tasks.status, 'ready'),
      ),
    )
    .orderBy(
      desc(workOrders.isUrgent),
      asc(sql`${tasks.dueDate} NULLS LAST`),
      asc(tasks.seq),
    )

  // Merge and deduplicate by id (assigned tasks take precedence)
  const seen = new Set<string>()
  const result: DbTask[] = []
  for (const row of [...assigned, ...unassigned]) {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      result.push(toDbTask(row))
    }
  }
  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toDbTask(row: any): DbTask {
  return {
    id:          row.id,
    workOrderId: row.workOrderId,
    werkbonId:   row.werkbonId ?? null,
    templateId:  row.templateId ?? null,
    type:        row.type,
    role:        row.role,
    status:      row.status,
    title:       row.title,
    description: row.description ?? null,
    assigneeId:  row.assigneeId ?? null,
    seq:         row.seq ?? 0,
    dueDate:     toIso(row.dueDate),
    completedAt: toIso(row.completedAt),
    completedBy: row.completedBy ?? null,
    skipReason:  row.skipReason ?? null,
    reasonCode:  row.reasonCode ?? null,
    payload:     row.payload ?? null,
    createdAt:   toIso(row.createdAt) ?? new Date().toISOString(),
    createdBy:   row.createdBy ?? null,
    updatedAt:   toIso(row.updatedAt) ?? new Date().toISOString(),
  }
}

function toIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /mnt/data/bossuyt_service_next_staging && npx tsc --noEmit --skipLibCheck 2>&1 | grep "queue" | head -5
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add lib/tasks/queue.ts && git commit -m "feat: add role and technician queue queries"
```

---

## Task 6 — API: `GET /api/tasks` and `POST /api/tasks`

**Files:**
- Create: `app/api/tasks/route.ts`

- [ ] **Step 1: Create `app/api/tasks/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { SQL, and, asc, eq, inArray, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { taskDependencies, tasks, workOrderEvents } from '@/lib/db/schema'
import { isTaskReady } from '@/lib/tasks/dependencies'
import { toDbTask } from '@/lib/tasks/queue'
import { withAudit } from '@/lib/db/with-audit'
import type { DbTaskStatus, DbTaskType, ReasonCode, TaskRole } from '@/types'

// ── GET /api/tasks ─────────────────────────────────────────────────────────────
// Query params (all optional, combinable): work_order_id, role, status, assignee_id
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const workOrderId = url.searchParams.get('work_order_id')
  const role        = url.searchParams.get('role')
  const status      = url.searchParams.get('status')
  const assigneeId  = url.searchParams.get('assignee_id')

  try {
    const conditions: SQL[] = []
    if (workOrderId) conditions.push(eq(tasks.workOrderId, workOrderId))
    if (role)        conditions.push(eq(tasks.role, role as TaskRole))
    if (status)      conditions.push(eq(tasks.status, status as DbTaskStatus))
    if (assigneeId)  conditions.push(eq(tasks.assigneeId, assigneeId))

    const rows = await db
      .select()
      .from(tasks)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(tasks.seq), asc(tasks.createdAt))

    // Attach predecessor/successor IDs for each returned task
    const taskIds = rows.map(r => r.id)
    const deps = taskIds.length
      ? await db
          .select()
          .from(taskDependencies)
          .where(
            or(
              inArray(taskDependencies.predecessorId, taskIds),
              inArray(taskDependencies.successorId, taskIds),
            ),
          )
      : []

    const result = rows.map(row => ({
      ...toDbTask(row),
      predecessorIds: deps.filter(d => d.successorId   === row.id).map(d => d.predecessorId),
      successorIds:   deps.filter(d => d.predecessorId === row.id).map(d => d.successorId),
    }))

    return NextResponse.json({ tasks: result })
  } catch (error) {
    console.error('[api/tasks GET]', error)
    return NextResponse.json({ error: 'Kon taken niet laden' }, { status: 500 })
  }
}

// ── POST /api/tasks ────────────────────────────────────────────────────────────
// Body shape:
// {
//   work_order_id: string            (required)
//   werkbon_id?: string
//   type: DbTaskType                 (required)
//   role: TaskRole                   (required)
//   title: string                    (required)
//   description?: string
//   assignee_id?: string
//   due_date?: string                (ISO 8601)
//   payload?: object
//   predecessor_task_ids?: string[]
//   client_id?: string               (idempotency key)
//   changed_by?: string
// }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const workOrderId        = body.work_order_id as string
    const werkbonId          = (body.werkbon_id as string)          || null
    const type               = body.type          as DbTaskType
    const role               = body.role          as TaskRole
    const title              = (body.title as string)?.trim()
    const description        = (body.description  as string)?.trim() || null
    const assigneeId         = (body.assignee_id  as string)        || null
    const dueDate            = body.due_date ? new Date(body.due_date as string) : null
    const payload            = (body.payload as Record<string, unknown>) || null
    const predecessorTaskIds = (body.predecessor_task_ids as string[]) || []
    const clientId           = (body.client_id as string)           || null
    const changedBy          = (body.changed_by as string)          || null

    if (!workOrderId || !type || !role || !title) {
      return NextResponse.json(
        { error: 'work_order_id, type, role en title zijn verplicht' },
        { status: 400 },
      )
    }

    // Idempotency: if we already processed this client_id, return the existing task
    if (clientId) {
      const [existing] = await db
        .select({ taskId: workOrderEvents.taskId })
        .from(workOrderEvents)
        .where(
          and(
            eq(workOrderEvents.clientId, clientId),
            eq(workOrderEvents.eventType, 'task_created'),
          ),
        )
        .limit(1)

      if (existing?.taskId) {
        const [existingTask] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, existing.taskId))

        if (existingTask) {
          return NextResponse.json({ task: toDbTask(existingTask) })
        }
      }
    }

    const taskId = crypto.randomUUID()

    await withAudit(changedBy, async (tx) => {
      await tx.insert(tasks).values({
        id:          taskId,
        workOrderId,
        werkbonId,
        type,
        role,
        status:      'pending',
        title,
        description,
        assigneeId,
        dueDate,
        payload,
        seq:         0,
        createdBy:   changedBy,
        updatedAt:   new Date(),
      })

      // Create dependency rows for each predecessor
      for (const predId of predecessorTaskIds) {
        await tx.insert(taskDependencies).values({
          id:            crypto.randomUUID(),
          predecessorId: predId,
          successorId:   taskId,
          depType:       'finish_to_start',
          lagMinutes:    0,
        })
      }

      // Emit creation event (carries client_id for dedup)
      await tx.insert(workOrderEvents).values({
        workOrderId,
        taskId,
        actorId:   changedBy ?? 'unknown',
        eventType: 'task_created',
        payload:   { type, role, title },
        clientId,
      })
    })

    // Check if this task is immediately ready (no unfinished predecessors)
    const ready = await isTaskReady(taskId)
    if (ready) {
      await db
        .update(tasks)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(eq(tasks.id, taskId))
    }

    const [created] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    return NextResponse.json({ task: toDbTask(created) }, { status: 201 })
  } catch (error) {
    console.error('[api/tasks POST]', error)
    return NextResponse.json({ error: 'Kon taak niet aanmaken' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Test POST with curl**

```bash
curl -s -X POST http://localhost:3080/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"work_order_id":"<a-real-id>","type":"internal_note","role":"office","title":"Test taak","changed_by":"test"}' \
  | jq .
```

Replace `<a-real-id>` with a real work order ID from:
```bash
docker exec bossuyt-db-staging psql -U postgres -d bossuyt -c "SELECT id FROM work_orders LIMIT 1;"
```

Expected: `{ "task": { "id": "...", "status": "ready", ... } }` (ready because no predecessors)

- [ ] **Step 3: Test GET**

```bash
curl -s "http://localhost:3080/api/tasks?role=office" | jq '.tasks | length'
```

Expected: 1 (the task just created).

- [ ] **Step 4: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add app/api/tasks/route.ts && git commit -m "feat: add GET and POST /api/tasks"
```

---

## Task 7 — API: `PATCH /api/tasks/[id]` and `GET /api/tasks/queue`

**Files:**
- Create: `app/api/tasks/[id]/route.ts`
- Create: `app/api/tasks/queue/route.ts`

- [ ] **Step 1: Create `app/api/tasks/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, workOrderEvents } from '@/lib/db/schema'
import { toDbTask } from '@/lib/tasks/queue'
import { withAudit } from '@/lib/db/with-audit'

type RouteContext = { params: Promise<{ id: string }> }

// ── PATCH /api/tasks/[id] ──────────────────────────────────────────────────────
// Allowed fields: title, description, assignee_id, due_date, payload, seq
// Body: Partial<above> + changed_by
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const body        = await req.json()
    const changedBy   = (body.changed_by as string) || null

    // Collect only the fields the caller explicitly sent
    const changedFields: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updatedAt: new Date() }

    if (body.title !== undefined) {
      updates.title = (body.title as string).trim()
      changedFields.push('title')
    }
    if (body.description !== undefined) {
      updates.description = (body.description as string)?.trim() || null
      changedFields.push('description')
    }
    if (body.assignee_id !== undefined) {
      updates.assigneeId = (body.assignee_id as string) || null
      changedFields.push('assigneeId')
    }
    if (body.due_date !== undefined) {
      updates.dueDate = body.due_date ? new Date(body.due_date as string) : null
      changedFields.push('dueDate')
    }
    if (body.payload !== undefined) {
      updates.payload = body.payload as Record<string, unknown>
      changedFields.push('payload')
    }
    if (body.seq !== undefined) {
      updates.seq = body.seq as number
      changedFields.push('seq')
    }

    if (changedFields.length === 0) {
      return NextResponse.json({ error: 'Geen velden om bij te werken' }, { status: 400 })
    }

    // Verify task exists
    const [current] = await db.select().from(tasks).where(eq(tasks.id, id))
    if (!current) {
      return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 })
    }

    await withAudit(changedBy, async (tx) => {
      await tx.update(tasks).set(updates).where(eq(tasks.id, id))

      await tx.insert(workOrderEvents).values({
        workOrderId: current.workOrderId,
        taskId:      id,
        actorId:     changedBy ?? 'unknown',
        eventType:   'task_updated',
        payload:     { changedFields },
      })
    })

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id))
    return NextResponse.json({ task: toDbTask(updated) })
  } catch (error) {
    console.error('[api/tasks/[id] PATCH]', error)
    return NextResponse.json({ error: 'Kon taak niet bijwerken' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `app/api/tasks/queue/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getQueueForRole, getQueueForTechnician } from '@/lib/tasks/queue'
import type { TaskRole } from '@/types'

// ── GET /api/tasks/queue ───────────────────────────────────────────────────────
// Query params (provide one or the other):
//   role=warehouse              → role queue
//   technician_id=tech-001      → personal technician queue
export async function GET(req: NextRequest) {
  const url          = new URL(req.url)
  const role         = url.searchParams.get('role')
  const technicianId = url.searchParams.get('technician_id')

  try {
    if (technicianId) {
      const items = await getQueueForTechnician(technicianId)
      return NextResponse.json({ tasks: items, count: items.length })
    }

    if (role) {
      const items = await getQueueForRole(role as TaskRole)
      return NextResponse.json({ tasks: items, count: items.length })
    }

    return NextResponse.json(
      { error: 'Geef role of technician_id op als query parameter' },
      { status: 400 },
    )
  } catch (error) {
    console.error('[api/tasks/queue GET]', error)
    return NextResponse.json({ error: 'Kon wachtrij niet laden' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Test PATCH**

```bash
# Use the task id from Task 6's curl response
TASK_ID="<task-id-from-task-6>"
curl -s -X PATCH "http://localhost:3080/api/tasks/${TASK_ID}" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Bijgewerkte testtaak","changed_by":"test"}' | jq .
```

Expected: `{ "task": { "title": "Bijgewerkte testtaak", ... } }`

- [ ] **Step 4: Test queue**

```bash
curl -s "http://localhost:3080/api/tasks/queue?role=office" | jq '.count'
```

Expected: 1

- [ ] **Step 5: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add app/api/tasks/[id]/route.ts app/api/tasks/queue/route.ts && git commit -m "feat: add PATCH /api/tasks/[id] and GET /api/tasks/queue"
```

---

## Task 8 — API: `POST /api/tasks/[id]/transition` (the complex one)

**Files:**
- Create: `app/api/tasks/[id]/transition/route.ts`

This route:
1. Validates the transition via `getNextStatus`
2. Updates the task status
3. On 'complete': runs `activateReadySuccessors` and `createSuccessorFromTemplate` (for auto_create edges)
4. Emits a `work_order_events` row
5. Returns `{ task, activated_task_ids }`

- [ ] **Step 1: Create `app/api/tasks/[id]/transition/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { taskTemplateEdges, tasks, workOrderEvents } from '@/lib/db/schema'
import { getNextStatus, type TaskAction } from '@/lib/tasks/transitions'
import {
  activateReadySuccessors,
  createSuccessorFromTemplate,
} from '@/lib/tasks/dependencies'
import { toDbTask } from '@/lib/tasks/queue'
import { withAudit } from '@/lib/db/with-audit'
import type { ReasonCode } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

// ── POST /api/tasks/[id]/transition ───────────────────────────────────────────
// Body:
// {
//   action: 'start' | 'complete' | 'skip' | 'cancel' | 'reopen'
//   skip_reason?: string      (required when action = 'skip')
//   reason_code?: ReasonCode
//   completed_by?: string
//   client_id?: string        (idempotency)
//   changed_by?: string
// }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const body        = await req.json()
    const action      = body.action      as TaskAction
    const skipReason  = (body.skip_reason  as string) || null
    const reasonCode  = (body.reason_code  as ReasonCode) || null
    const completedBy = (body.completed_by as string) || null
    const clientId    = (body.client_id   as string) || null
    const changedBy   = (body.changed_by  as string) || null

    if (!action) {
      return NextResponse.json({ error: 'action is verplicht' }, { status: 400 })
    }

    if (action === 'skip' && !skipReason) {
      return NextResponse.json(
        { error: 'skip_reason is verplicht bij actie "skip"' },
        { status: 400 },
      )
    }

    // Idempotency: if client_id already processed, return existing task state
    if (clientId) {
      const [existing] = await db
        .select({ taskId: workOrderEvents.taskId })
        .from(workOrderEvents)
        .where(
          and(
            eq(workOrderEvents.clientId, clientId),
            eq(workOrderEvents.eventType, `task_${action}`),
          ),
        )
        .limit(1)

      if (existing?.taskId) {
        const [existingTask] = await db.select().from(tasks).where(eq(tasks.id, existing.taskId))
        if (existingTask) {
          return NextResponse.json({ task: toDbTask(existingTask), activated_task_ids: [] })
        }
      }
    }

    // Load current task
    const [current] = await db.select().from(tasks).where(eq(tasks.id, id))
    if (!current) {
      return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 })
    }

    // Validate the transition
    const nextStatus = getNextStatus(current.status, action)
    if (!nextStatus) {
      return NextResponse.json(
        {
          error: `Ongeldige transitie: ${current.status} → actie "${action}" is niet toegestaan`,
        },
        { status: 422 },
      )
    }

    const now = new Date()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {
      status:    nextStatus,
      updatedAt: now,
    }

    if (nextStatus === 'done') {
      updates.completedAt = now
      updates.completedBy = completedBy ?? changedBy
    }

    if (action === 'skip') {
      updates.skipReason  = skipReason
      updates.reasonCode  = reasonCode
    }

    if (action === 'reopen') {
      updates.completedAt = null
      updates.completedBy = null
      updates.skipReason  = null
    }

    let activatedTaskIds: string[] = []

    await withAudit(changedBy, async (tx) => {
      await tx.update(tasks).set(updates).where(eq(tasks.id, id))

      await tx.insert(workOrderEvents).values({
        workOrderId: current.workOrderId,
        taskId:      id,
        actorId:     changedBy ?? completedBy ?? 'unknown',
        eventType:   `task_${action}`,
        payload:     { from: current.status, to: nextStatus, reasonCode, skipReason },
        clientId,
      })
    })

    // After completing: activate successors and spawn auto-chain tasks
    if (nextStatus === 'done') {
      activatedTaskIds = await activateReadySuccessors(id)

      // Check if this task was created from a template with outgoing auto_create edges
      if (current.templateId) {
        const edges = await db
          .select()
          .from(taskTemplateEdges)
          .where(
            and(
              eq(taskTemplateEdges.fromTemplateId, current.templateId),
              eq(taskTemplateEdges.autoCreate, true),
            ),
          )

        for (const edge of edges) {
          const newTask = await createSuccessorFromTemplate(
            {
              id:          current.id,
              workOrderId: current.workOrderId,
              werkbonId:   current.werkbonId,
              templateId:  current.templateId,
            },
            { toTemplateId: edge.toTemplateId, depType: edge.depType },
          )
          if (newTask) activatedTaskIds.push(newTask.id)
        }
      }
    }

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id))
    return NextResponse.json({ task: toDbTask(updated), activated_task_ids: activatedTaskIds })
  } catch (error) {
    console.error('[api/tasks/[id]/transition POST]', error)
    return NextResponse.json({ error: 'Kon taakstatus niet wijzigen' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Test the happy path — start then complete**

```bash
TASK_ID="<task-id-from-task-6>"

# Start the task (pending → ready already, so start from ready)
curl -s -X POST "http://localhost:3080/api/tasks/${TASK_ID}/transition" \
  -H 'Content-Type: application/json' \
  -d '{"action":"start","changed_by":"test"}' | jq '{status: .task.status}'
# Expected: {"status": "in_progress"}

# Complete the task
curl -s -X POST "http://localhost:3080/api/tasks/${TASK_ID}/transition" \
  -H 'Content-Type: application/json' \
  -d '{"action":"complete","completed_by":"test"}' | jq '{status: .task.status, activated: .activated_task_ids}'
# Expected: {"status": "done", "activated": []}
```

- [ ] **Step 3: Test invalid transition**

```bash
# Trying to start a completed task should fail
curl -s -X POST "http://localhost:3080/api/tasks/${TASK_ID}/transition" \
  -H 'Content-Type: application/json' \
  -d '{"action":"start","changed_by":"test"}' | jq .error
# Expected: "Ongeldige transitie: done → actie \"start\" is niet toegestaan"
```

- [ ] **Step 4: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add app/api/tasks/[id]/transition/route.ts && git commit -m "feat: add POST /api/tasks/[id]/transition with auto-chain on complete"
```

---

## Task 9 — API: timeline and work-order links

**Files:**
- Create: `app/api/work-orders/[id]/timeline/route.ts`
- Create: `app/api/work-orders/[id]/link/route.ts`
- Create: `app/api/work-orders/[id]/links/route.ts`

- [ ] **Step 1: Create `app/api/work-orders/[id]/timeline/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, workOrderEvents } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/work-orders/[id]/timeline ────────────────────────────────────────
// Returns all events for a work order, most recent first, with task title joined.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    // Fetch events + join task title (left join so events without a task still appear)
    const rows = await db
      .select({
        id:          workOrderEvents.id,
        occurredAt:  workOrderEvents.occurredAt,
        recordedAt:  workOrderEvents.recordedAt,
        workOrderId: workOrderEvents.workOrderId,
        taskId:      workOrderEvents.taskId,
        actorId:     workOrderEvents.actorId,
        eventType:   workOrderEvents.eventType,
        payload:     workOrderEvents.payload,
        clientId:    workOrderEvents.clientId,
        taskTitle:   tasks.title,
      })
      .from(workOrderEvents)
      .leftJoin(tasks, eq(workOrderEvents.taskId, tasks.id))
      .where(eq(workOrderEvents.workOrderId, id))
      .orderBy(asc(workOrderEvents.occurredAt))

    const events = rows.map(row => ({
      ...row,
      occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : row.occurredAt,
      recordedAt: row.recordedAt instanceof Date ? row.recordedAt.toISOString() : row.recordedAt,
    }))

    return NextResponse.json({ events })
  } catch (error) {
    console.error('[api/work-orders/[id]/timeline GET]', error)
    return NextResponse.json({ error: 'Kon tijdlijn niet laden' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `app/api/work-orders/[id]/link/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { workOrderEvents, workOrderLinks } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'
import type { ReasonCode, WorkOrderLinkType } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

// ── POST /api/work-orders/[id]/link ───────────────────────────────────────────
// Body:
// {
//   to_work_order_id: string       (required)
//   link_type: WorkOrderLinkType   (required)
//   reason_code?: ReasonCode
//   note?: string
//   changed_by?: string
// }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: fromWorkOrderId } = await params

  try {
    const body            = await req.json()
    const toWorkOrderId   = body.to_work_order_id as string
    const linkType        = body.link_type         as WorkOrderLinkType
    const reasonCode      = (body.reason_code as ReasonCode) || null
    const note            = (body.note as string) || null
    const changedBy       = (body.changed_by as string) || null

    if (!toWorkOrderId || !linkType) {
      return NextResponse.json(
        { error: 'to_work_order_id en link_type zijn verplicht' },
        { status: 400 },
      )
    }

    const linkId = crypto.randomUUID()

    await withAudit(changedBy, async (tx) => {
      await tx.insert(workOrderLinks).values({
        id: linkId,
        fromWorkOrderId,
        toWorkOrderId,
        linkType,
        reasonCode,
        note,
        createdBy: changedBy,
      })

      // Emit an event on BOTH work orders so both timelines reflect the link
      await tx.insert(workOrderEvents).values({
        workOrderId: fromWorkOrderId,
        taskId:      null,
        actorId:     changedBy ?? 'unknown',
        eventType:   'follow_up_linked',
        payload:     { linkId, toWorkOrderId, linkType, reasonCode },
      })

      await tx.insert(workOrderEvents).values({
        workOrderId: toWorkOrderId,
        taskId:      null,
        actorId:     changedBy ?? 'unknown',
        eventType:   'follow_up_linked',
        payload:     { linkId, fromWorkOrderId, linkType, reasonCode },
      })
    })

    return NextResponse.json({ ok: true, linkId }, { status: 201 })
  } catch (error: unknown) {
    // Unique constraint = link already exists
    if (error instanceof Error && error.message.includes('work_order_link_unique')) {
      return NextResponse.json({ error: 'Link bestaat al' }, { status: 409 })
    }
    console.error('[api/work-orders/[id]/link POST]', error)
    return NextResponse.json({ error: 'Kon link niet aanmaken' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create `app/api/work-orders/[id]/links/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { or, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrderLinks, workOrders } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/work-orders/[id]/links ───────────────────────────────────────────
// Returns all links where this work order is the source OR the target.
// Joins basic work_order info for each linked order.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const links = await db
      .select()
      .from(workOrderLinks)
      .where(
        or(
          eq(workOrderLinks.fromWorkOrderId, id),
          eq(workOrderLinks.toWorkOrderId, id),
        ),
      )

    const result = links.map(link => ({
      ...link,
      createdAt: link.createdAt instanceof Date ? link.createdAt.toISOString() : link.createdAt,
    }))

    return NextResponse.json({ links: result })
  } catch (error) {
    console.error('[api/work-orders/[id]/links GET]', error)
    return NextResponse.json({ error: 'Kon links niet laden' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Test timeline**

```bash
WORK_ORDER_ID="<id-of-work-order-from-task-6>"
curl -s "http://localhost:3080/api/work-orders/${WORK_ORDER_ID}/timeline" | jq '.events | length'
```

Expected: 3 or more (task_created, task_start, task_complete events from Tasks 6–8).

- [ ] **Step 5: Test link**

```bash
# Get a second work order ID for the target
WORK_ORDER_ID_2=$(docker exec bossuyt-db-staging psql -U postgres -d bossuyt -t -c "SELECT id FROM work_orders WHERE id != '${WORK_ORDER_ID}' LIMIT 1;" | tr -d ' \n')

curl -s -X POST "http://localhost:3080/api/work-orders/${WORK_ORDER_ID}/link" \
  -H 'Content-Type: application/json' \
  -d "{\"to_work_order_id\":\"${WORK_ORDER_ID_2}\",\"link_type\":\"follow_up\",\"changed_by\":\"test\"}" | jq .
```

Expected: `{"ok": true, "linkId": "..."}`

- [ ] **Step 6: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add app/api/work-orders/[id]/timeline/route.ts app/api/work-orders/[id]/link/route.ts app/api/work-orders/[id]/links/route.ts && git commit -m "feat: add timeline, link, and links endpoints for work orders"
```

---

## Task 10 — ERP surface (Phase 4)

**Files:**
- Create: `app/api/erp/work-orders/route.ts`
- Create: `app/api/erp/work-orders/[id]/external-ref/route.ts`
- Create: `app/api/erp/parts-pending/route.ts`
- Create: `app/api/erp/parts-pending/[task_id]/fulfil/route.ts`

All ERP routes validate the `X-ERP-Key` header against `process.env.ERP_API_KEY`.

- [ ] **Step 1: Create `app/api/erp/work-orders/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, werkbonnen, workOrderAssignments, workOrders } from '@/lib/db/schema'
import type { InterventionStatus } from '@/types'

function requireErpKey(req: NextRequest): Response | null {
  const key = req.headers.get('x-erp-key')
  if (!process.env.ERP_API_KEY || key !== process.env.ERP_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// ── GET /api/erp/work-orders ──────────────────────────────────────────────────
// Query params: since=ISO (default: last 30 days), status=, site_id=
export async function GET(req: NextRequest) {
  const authError = requireErpKey(req)
  if (authError) return authError

  try {
    const url    = new URL(req.url)
    const since  = url.searchParams.get('since')
    const status = url.searchParams.get('status')
    const siteId = url.searchParams.get('site_id')

    const defaultSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const sinceDate    = since ? new Date(since) : defaultSince

    const conditions = [gte(workOrders.plannedDate, sinceDate)]
    if (status) conditions.push(eq(workOrders.status, status as InterventionStatus))
    if (siteId) conditions.push(eq(workOrders.siteId, siteId))

    const orders = await db
      .select()
      .from(workOrders)
      .where(and(...conditions))

    // For each work order, fetch its tasks and latest werkbon
    const result = await Promise.all(orders.map(async wo => {
      const woTasks = await db
        .select({
          id:      tasks.id,
          type:    tasks.type,
          role:    tasks.role,
          status:  tasks.status,
          payload: tasks.payload,
        })
        .from(tasks)
        .where(eq(tasks.workOrderId, wo.id))

      const [latestWerkbon] = await db
        .select()
        .from(werkbonnen)
        .where(eq(werkbonnen.workOrderId, wo.id))
        .orderBy(werkbonnen.completedAt)
        .limit(1)

      return {
        id:           wo.id,
        external_ref: wo.externalRef,
        site_id:      wo.siteId,
        status:       wo.status,
        type:         wo.type,
        planned_date: wo.plannedDate instanceof Date ? wo.plannedDate.toISOString() : wo.plannedDate,
        completed_at: wo.completedAt instanceof Date ? wo.completedAt.toISOString() : wo.completedAt,
        is_urgent:    wo.isUrgent,
        tasks:        woTasks,
        werkbon:      latestWerkbon
          ? { parts: latestWerkbon.parts, notes: latestWerkbon.notes, work_start: latestWerkbon.workStart, work_end: latestWerkbon.workEnd }
          : null,
      }
    }))

    return NextResponse.json({ work_orders: result })
  } catch (error) {
    console.error('[api/erp/work-orders GET]', error)
    return NextResponse.json({ error: 'Intern serverfout' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `app/api/erp/work-orders/[id]/external-ref/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrders } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

function requireErpKey(req: NextRequest): Response | null {
  const key = req.headers.get('x-erp-key')
  if (!process.env.ERP_API_KEY || key !== process.env.ERP_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// ── POST /api/erp/work-orders/[id]/external-ref ───────────────────────────────
// Body: { external_ref: string }
// Navision/Odoo stamps its own reference back onto the work order.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const authError = requireErpKey(req)
  if (authError) return authError

  const { id } = await params

  try {
    const { external_ref } = await req.json()

    if (!external_ref || typeof external_ref !== 'string') {
      return NextResponse.json({ error: 'external_ref is verplicht' }, { status: 400 })
    }

    const [wo] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, id))
    if (!wo) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

    await db
      .update(workOrders)
      .set({ externalRef: external_ref })
      .where(eq(workOrders.id, id))

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/erp/work-orders/[id]/external-ref POST]', error)
    return NextResponse.json({ error: 'Intern serverfout' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create `app/api/erp/parts-pending/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks } from '@/lib/db/schema'
import { toDbTask } from '@/lib/tasks/queue'

function requireErpKey(req: NextRequest): Response | null {
  const key = req.headers.get('x-erp-key')
  if (!process.env.ERP_API_KEY || key !== process.env.ERP_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// ── GET /api/erp/parts-pending ────────────────────────────────────────────────
// Returns all order_part tasks that are not yet done.
// ERP reads this to know which parts the warehouse needs to order.
export async function GET(req: NextRequest) {
  const authError = requireErpKey(req)
  if (authError) return authError

  try {
    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.type, 'order_part'),
          ne(tasks.status, 'done'),
          ne(tasks.status, 'cancelled'),
        ),
      )

    return NextResponse.json({ parts_pending: rows.map(toDbTask) })
  } catch (error) {
    console.error('[api/erp/parts-pending GET]', error)
    return NextResponse.json({ error: 'Intern serverfout' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Create `app/api/erp/parts-pending/[task_id]/fulfil/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, workOrderEvents } from '@/lib/db/schema'
import { activateReadySuccessors } from '@/lib/tasks/dependencies'
import { withAudit } from '@/lib/db/with-audit'

type RouteContext = { params: Promise<{ task_id: string }> }

function requireErpKey(req: NextRequest): Response | null {
  const key = req.headers.get('x-erp-key')
  if (!process.env.ERP_API_KEY || key !== process.env.ERP_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// ── POST /api/erp/parts-pending/[task_id]/fulfil ──────────────────────────────
// ERP marks a part as ordered or received.
// Body: { erp_order_ref: string, eta?: string, status: 'ordered' | 'received' }
//
// When status = 'received': the task is completed and successors are activated
// (e.g. the plan_revisit task becomes 'ready' in the office queue).
export async function POST(req: NextRequest, { params }: RouteContext) {
  const authError = requireErpKey(req)
  if (authError) return authError

  const { task_id: taskId } = await params

  try {
    const body          = await req.json()
    const erpOrderRef   = body.erp_order_ref as string
    const eta           = (body.eta as string) || null
    const fulfilStatus  = body.status as 'ordered' | 'received'

    if (!erpOrderRef || !['ordered', 'received'].includes(fulfilStatus)) {
      return NextResponse.json(
        { error: 'erp_order_ref en status ("ordered"|"received") zijn verplicht' },
        { status: 400 },
      )
    }

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    if (!task) return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 })

    const now = new Date()
    // Merge ERP data into the existing payload object
    const updatedPayload = { ...(task.payload ?? {}), erp_order_ref: erpOrderRef, eta }

    let activatedTaskIds: string[] = []

    await withAudit('erp', async (tx) => {
      const updates: Record<string, unknown> = { payload: updatedPayload, updatedAt: now }

      if (fulfilStatus === 'received') {
        updates.status      = 'done'
        updates.completedAt = now
        updates.completedBy = 'erp'
      }

      await tx.update(tasks).set(updates).where(eq(tasks.id, taskId))

      await tx.insert(workOrderEvents).values({
        workOrderId: task.workOrderId,
        taskId,
        actorId:     'erp',
        eventType:   'part_fulfilled',
        payload:     { erpOrderRef, eta, fulfilStatus },
      })
    })

    if (fulfilStatus === 'received') {
      activatedTaskIds = await activateReadySuccessors(taskId)
    }

    return NextResponse.json({ ok: true, activated_task_ids: activatedTaskIds })
  } catch (error) {
    console.error('[api/erp/parts-pending/[task_id]/fulfil POST]', error)
    return NextResponse.json({ error: 'Intern serverfout' }, { status: 500 })
  }
}
```

- [ ] **Step 5: Verify compilation**

```bash
cd /mnt/data/bossuyt_service_next_staging && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: 0 new errors.

- [ ] **Step 6: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add app/api/erp/ && git commit -m "feat: add ERP API surface (work-orders, external-ref, parts-pending, fulfil)"
```

---

## Task 11 — Offline sync: extend `lib/idb.ts` and create `lib/tasks/sync.ts`

**Files:**
- Modify: `lib/idb.ts`
- Create: `lib/tasks/sync.ts`

The IDB version bumps from **2 → 3**. The `upgrade` function uses `if (!contains)` guards (existing pattern), so the upgrade is non-destructive — existing stores are preserved.

- [ ] **Step 1: Add the `TaskCommand` type and `task_commands` store to `lib/idb.ts`**

Open `lib/idb.ts`. Make the following changes:

**1a. Add `TaskCommand` interface** (after the existing `DayMeta` interface):

```ts
export interface TaskCommand {
  clientId:  string    // crypto.randomUUID() — doubles as idempotency key
  endpoint:  string    // e.g. '/api/tasks'
  method:    string    // 'POST' | 'PATCH'
  body:      Record<string, unknown>
  createdAt: string    // ISO — replay in this order
  synced:    boolean
  error?:    string    // set on permanent 4xx failure
}
```

**1b. Add `task_commands` to the `BossuytDB` schema interface** (inside the `interface BossuytDB extends DBSchema` block, after `dayMeta`):

```ts
  task_commands: {
    key:   string       // clientId
    value: TaskCommand
  }
```

**1c. Bump the version and add the store in the `upgrade` callback**:

Change:
```ts
  if (!dbPromise) {
    dbPromise = openDB<BossuytDB>('bossuyt-service', 2, {
```

To:
```ts
  if (!dbPromise) {
    dbPromise = openDB<BossuytDB>('bossuyt-service', 3, {
```

And add at the end of the `upgrade` callback body (after the `dayMeta` block):

```ts
        if (!db.objectStoreNames.contains('task_commands')) {
          db.createObjectStore('task_commands', { keyPath: 'clientId' })
        }
```

**1d. Add helper functions** (at the end of `lib/idb.ts`):

```ts
// ---------- Task commands (offline task queue) ----------

/** Queue a task API call for later sync if the device is offline. */
export async function enqueueTaskCommand(
  command: Omit<TaskCommand, 'createdAt' | 'synced'>,
): Promise<void> {
  const db = await getDB()
  await db.put('task_commands', {
    ...command,
    createdAt: new Date().toISOString(),
    synced:    false,
  })
}

/** Get all unsynced task commands in creation order. */
export async function getUnsyncedTaskCommands(): Promise<TaskCommand[]> {
  const db   = await getDB()
  const all  = await db.getAll('task_commands')
  return all
    .filter(c => !c.synced)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Mark a task command as successfully synced. */
export async function markTaskCommandSynced(clientId: string): Promise<void> {
  const db  = await getDB()
  const cmd = await db.get('task_commands', clientId)
  if (cmd) await db.put('task_commands', { ...cmd, synced: true })
}

/** Mark a task command as permanently failed (4xx response). */
export async function markTaskCommandFailed(clientId: string, error: string): Promise<void> {
  const db  = await getDB()
  const cmd = await db.get('task_commands', clientId)
  if (cmd) await db.put('task_commands', { ...cmd, error })
}
```

- [ ] **Step 2: Create `lib/tasks/sync.ts`**

```ts
/**
 * lib/tasks/sync.ts
 *
 * Offline-first sync for the task system.
 *
 * queueTaskCommand  — writes a command to IndexedDB and tries to send it
 *                     immediately. Falls back silently if offline.
 *
 * flushTaskQueue    — replays all unsynced commands in order. Called:
 *                     • on the browser "online" event
 *                     • on app foreground (visibilitychange → visible)
 *                     • after any successful online sync
 */

import {
  enqueueTaskCommand,
  getUnsyncedTaskCommands,
  markTaskCommandFailed,
  markTaskCommandSynced,
} from '@/lib/idb'
import type { TaskCommand } from '@/lib/idb'

/**
 * Write a task API call to IndexedDB, then attempt to send it immediately.
 * If the request fails (network error / offline), it stays in the queue
 * and will be replayed by flushTaskQueue when the device comes back online.
 *
 * The `body` must already contain a `client_id` field that matches the
 * `clientId` you pass here — the server uses it for idempotency.
 */
export async function queueTaskCommand(
  endpoint: string,
  method: string,
  body: Record<string, unknown> & { client_id: string },
): Promise<void> {
  const clientId = body.client_id

  await enqueueTaskCommand({ clientId, endpoint, method, body })

  // Attempt immediate send — ignore failure, flushTaskQueue handles retries
  try {
    await sendCommand({ clientId, endpoint, method, body, createdAt: '', synced: false })
    await markTaskCommandSynced(clientId)
  } catch {
    // offline or server error — will be retried on next flush
  }
}

/**
 * Replay all unsynced commands in chronological order.
 * Stops on the first 5xx or network error (will retry next flush).
 * Marks 4xx responses as permanently failed (don't retry broken requests).
 */
export async function flushTaskQueue(): Promise<void> {
  const commands = await getUnsyncedTaskCommands()

  for (const cmd of commands) {
    try {
      const res = await sendCommand(cmd)

      if (res.ok || res.status === 409) {
        // 200 = success, 409 = duplicate (idempotency) — both mean done
        await markTaskCommandSynced(cmd.clientId)
        continue
      }

      if (res.status >= 400 && res.status < 500) {
        // Permanent failure — bad request, don't retry
        const text = await res.text()
        await markTaskCommandFailed(cmd.clientId, `HTTP ${res.status}: ${text}`)
        continue
      }

      // 5xx or unexpected status — stop and retry later
      break
    } catch {
      // Network error — stop and retry later
      break
    }
  }
}

async function sendCommand(cmd: Pick<TaskCommand, 'endpoint' | 'method' | 'body'>): Promise<Response> {
  return fetch(cmd.endpoint, {
    method:  cmd.method,
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(cmd.body),
  })
}

/** Register global event listeners to flush the queue automatically. */
export function registerSyncListeners(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('online', () => { void flushTaskQueue() })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void flushTaskQueue()
    }
  })
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd /mnt/data/bossuyt_service_next_staging && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: 0 new errors.

- [ ] **Step 4: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add lib/idb.ts lib/tasks/sync.ts && git commit -m "feat: add task_commands IndexedDB store and offline sync queue"
```

---

## Task 12 — Migration from localStorage: `lib/tasks/migrate.ts`

**Files:**
- Create: `lib/tasks/migrate.ts`

One-shot migration. Reads `bossuyt-service:tasks` from localStorage, POSTs each task to `/api/tasks`, then clears the key. Safe to call multiple times (idempotent via client_id).

- [ ] **Step 1: Create `lib/tasks/migrate.ts`**

```ts
/**
 * lib/tasks/migrate.ts
 *
 * One-shot migration of localStorage tasks → PostgreSQL.
 *
 * Call migrateLocalStorageTasks() once on app load (client-side only)
 * when the localStorage key exists AND the user is authenticated.
 *
 * The migration is idempotent: each old task id is used as client_id,
 * so if the browser crashes mid-way, re-running is safe.
 */

const LEGACY_KEY = 'bossuyt-service:tasks'

interface LegacyTask {
  id: string
  type: string
  title: string
  description?: string
  assigneeType: string
  assigneeUserId?: string
  assigneeRole?: string
  createdByUserId: string
  priority: string
  status: string
  werkbonId?: string
  interventionId?: string
  dueDate?: string
  createdAt: string
}

/** Map old localStorage task types to new DbTaskType values. */
function mapType(legacyType: string): string {
  const MAP: Record<string, string> = {
    bestelling: 'order_part',
    todo:       'internal_note',
    email:      'contact_customer',
    bellen:     'contact_customer',
    bericht:    'contact_customer',
    afspraak:   'plan_revisit',
    offerte:    'other',
  }
  return MAP[legacyType] ?? 'other'
}

/** Map old role values to new TaskRole values. */
function mapRole(assigneeRole?: string): string {
  const MAP: Record<string, string> = {
    technician: 'technician',
    warehouse:  'warehouse',
    office:     'office',
    admin:      'admin',
    hr:         'office',
  }
  return assigneeRole ? (MAP[assigneeRole] ?? 'office') : 'office'
}

export interface MigrationResult {
  migrated: number
  failed:   number
  skipped:  number
}

/**
 * Migrate all tasks from localStorage to PostgreSQL.
 *
 * Returns a summary of the migration. Shows a toast via the browser
 * notification API — callers should show this to the user.
 */
export async function migrateLocalStorageTasks(): Promise<MigrationResult> {
  if (typeof window === 'undefined') return { migrated: 0, failed: 0, skipped: 0 }

  const raw = window.localStorage.getItem(LEGACY_KEY)
  if (!raw) return { migrated: 0, failed: 0, skipped: 0 }

  let tasks: LegacyTask[]
  try {
    tasks = JSON.parse(raw) as LegacyTask[]
  } catch {
    console.warn('[migrate] Kon localStorage taken niet parsen, verwijder sleutel')
    window.localStorage.removeItem(LEGACY_KEY)
    return { migrated: 0, failed: 0, skipped: 0 }
  }

  if (!Array.isArray(tasks) || tasks.length === 0) {
    window.localStorage.removeItem(LEGACY_KEY)
    return { migrated: 0, failed: 0, skipped: 0 }
  }

  let migrated = 0
  let failed   = 0
  let skipped  = 0

  for (const task of tasks) {
    // Skip tasks not linked to a work order (legacy tasks could be standalone)
    if (!task.interventionId) {
      skipped++
      continue
    }

    try {
      const res = await fetch('/api/tasks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_order_id: task.interventionId,
          werkbon_id:    task.werkbonId ?? null,
          type:          mapType(task.type),
          role:          mapRole(task.assigneeRole),
          title:         task.title,
          description:   task.description ?? null,
          due_date:      task.dueDate ?? null,
          client_id:     task.id,  // original id as idempotency key
          changed_by:    task.createdByUserId,
        }),
      })

      if (res.ok || res.status === 409) {
        migrated++
      } else {
        console.warn(`[migrate] Taak ${task.id} mislukt: HTTP ${res.status}`)
        failed++
      }
    } catch (err) {
      console.error(`[migrate] Taak ${task.id} netwerk fout:`, err)
      failed++
    }
  }

  // Remove the localStorage key when fully done (even on partial failure —
  // client_id idempotency means safe to re-run on next load if needed)
  if (failed === 0) {
    window.localStorage.removeItem(LEGACY_KEY)
  }

  console.info(`[migrate] Migratie klaar: ${migrated} gesynchroniseerd, ${failed} mislukt, ${skipped} overgeslagen`)
  return { migrated, failed, skipped }
}
```

- [ ] **Step 2: Wire the migration into the app boot sequence**

In `components/AppProviders.tsx` (the client provider wrapper), add this `useEffect` after the component is mounted. If `AppProviders.tsx` doesn't exist yet, add the effect in `app/layout.tsx`'s client wrapper or the root client component.

Find the `AppProviders.tsx` or equivalent client entry file and add:

```ts
import { useEffect } from 'react'
import { migrateLocalStorageTasks } from '@/lib/tasks/migrate'
import { registerSyncListeners } from '@/lib/tasks/sync'

// Inside the component, add:
useEffect(() => {
  // Register offline sync listeners once on mount
  registerSyncListeners()

  // Run localStorage → PostgreSQL migration once (idempotent)
  void migrateLocalStorageTasks().then(result => {
    if (result.migrated > 0) {
      // Show a simple browser notification (no toast library required)
      console.info(`${result.migrated} taken gesynchroniseerd naar server`)
      // TODO: replace with your toast component when available
    }
  })
}, [])
```

- [ ] **Step 3: Verify compilation**

```bash
cd /mnt/data/bossuyt_service_next_staging && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: 0 new errors.

- [ ] **Step 4: Verify a full build passes**

```bash
cd /mnt/data/bossuyt_service_next_staging && npm run build 2>&1 | tail -20
```

Expected: Build succeeds (`✓ Compiled successfully` or similar).

- [ ] **Step 5: Commit**

```bash
cd /mnt/data/bossuyt_service_next_staging && git add lib/tasks/migrate.ts components/AppProviders.tsx && git commit -m "feat: add localStorage → PostgreSQL task migration and sync listener wiring"
```

---

## Self-review against spec

### Spec coverage check

| Spec requirement | Task(s) |
|---|---|
| `tasks` table | Task 2 |
| `task_dependencies` table | Task 2 |
| `task_templates` table | Task 2 |
| `task_template_edges` table | Task 2 |
| `work_order_links` table | Task 2 |
| `work_order_events` table | Task 2 |
| `externalRef` on work_orders | Task 2 |
| All new enums in types/index.ts | Task 1 |
| `getNextStatus` pure function | Task 3 |
| `isTaskReady` | Task 4 |
| `activateReadySuccessors` | Task 4 |
| `createSuccessorFromTemplate` | Task 4 |
| `getQueueForRole` | Task 5 |
| `getQueueForTechnician` | Task 5 |
| `POST /api/tasks` with client_id idempotency | Task 6 |
| `GET /api/tasks` with filters | Task 6 |
| `PATCH /api/tasks/[id]` | Task 7 |
| `GET /api/tasks/queue` | Task 7 |
| `POST /api/tasks/[id]/transition` | Task 8 |
| `GET /api/work-orders/[id]/timeline` | Task 9 |
| `POST /api/work-orders/[id]/link` | Task 9 |
| `GET /api/work-orders/[id]/links` | Task 9 |
| `GET /api/erp/work-orders` | Task 10 |
| `POST /api/erp/work-orders/[id]/external-ref` | Task 10 |
| `GET /api/erp/parts-pending` | Task 10 |
| `POST /api/erp/parts-pending/[id]/fulfil` | Task 10 |
| `task_commands` IndexedDB store | Task 11 |
| `queueTaskCommand` + `flushTaskQueue` | Task 11 |
| `migrateLocalStorageTasks` | Task 12 |
| localStorage fallback preserved | Rule: task-store.tsx untouched |
| No modification to work_orders/werkbonnen/assignments tables | ✓ Only externalRef added |
| All PKs use crypto.randomUUID() | ✓ Tasks 2–10 |
| All timestamps are timestamptz | ✓ Task 2 (`withTimezone: true`) |

### Success criteria from spec

| Criterion | Implemented by |
|---|---|
| Technician creates 'order_part' task on a work order | `POST /api/tasks` (Task 6) |
| Task appears in warehouse queue | `GET /api/tasks/queue?role=warehouse` (Task 7) |
| When ERP fulfils the part, plan_revisit task becomes ready | `fulfil` route → `activateReadySuccessors` (Tasks 4 + 10) |
| Timeline shows all events in order | `GET /api/work-orders/[id]/timeline` (Task 9) |
| Revisit work order can be linked to original | `POST /api/work-orders/[id]/link` (Task 9) |
| Works offline, syncs when back online | Tasks 11 + 12 |
| Navision/Odoo can consume /api/erp/work-orders | Task 10 |
| ERP can push back external_ref | Task 10 |
