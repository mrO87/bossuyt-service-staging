# Agy Semantic & Business Logic Review Report — v1.53.2
**Reviewer:** Antigravity (AGY) — Independent Code & Logic Review  
**Repository:** `mrO87/bossuyt-service-staging`  
**Branch:** `feature/service-bon-v1.53`  
**Commit Range:** `61bd700..e486dc6` (15 commits, 36 files)  
**Analysis Engine:** `jcodemunch-mcp` (AST symbol graph & call hierarchy verification)  
**Baseline Status:** 102 tests pass, `tsc` and `lint` clean, 0 compilation errors  
**Scope:** Semantic domain bugs & business invariant violations (No code changes applied)

---

## 1. Executive Summary & Review Methodology

This review was commissioned to find code that **compiles, passes all tests, aligns with all TypeScript types, yet is wrong about the business.**

To ensure rigor and prevent hunches from masquerading as defects, this review utilized the **`jcodemunch` code intelligence engine** alongside deep manual source inspection. `jcodemunch` constructed a full Abstract Syntax Tree (AST) graph across all 176 files and 1,305 symbols in the staging repository.

### Key Architectural Metrics Uncovered by `jcodemunch`
* **Repository Health:** 0 dependency cycles across modules; average cyclomatic complexity $M = 6.62$.
* **System Hotspots:** The top hotspots identified by compound risk analysis ($M > 40$, deep nesting $\ge 4$, high churn) directly isolate where domain logic broke down:
  1. [`components/WerkbonForm/index.tsx::WerkbonForm`](file:///mnt/data/bossuyt_service_next_staging/components/WerkbonForm/index.tsx#L66) — Complexity $M = 126$, Nesting = 8, Hotspot Score = 225.8 (**CRITICAL**)
  2. [`app/werkbon/nieuw/page.tsx::NieuwWerkbon`](file:///mnt/data/bossuyt_service_next_staging/app/werkbon/nieuw/page.tsx#L42) — Complexity $M = 72$, Nesting = 9, Hotspot Score = 99.8 (**HIGH**)
  3. [`lib/pdf.ts::generateWerkbonPDF`](file:///mnt/data/bossuyt_service_next_staging/lib/pdf.ts#L127) — Complexity $M = 60$, Nesting = 6, Hotspot Score = 96.6 (**HIGH**)
  4. [`components/WerkbonForm/index.tsx::buildPdfData`](file:///mnt/data/bossuyt_service_next_staging/components/WerkbonForm/index.tsx#L179) — Complexity $M = 41$, Nesting = 4, Hotspot Score = 73.5 (**HIGH**)

Below are the 12 prioritized semantic findings, strictly structured according to Section 7 of the review brief.

---

## 2. Prioritized Semantic Findings (L-01 – L-12)

### L-01 — Revisit parts fitted on-site are treated as van stock replenishments

Rule broken: **F4** ("The revisit's pre-filled part list comes from parts that were ordered for the original job. Parts already fitted from stock are not brought along again.") and **P1** ("A part line on a bon is exactly one of two things: bought from a supplier, or taken from van/shelf stock and already fitted.")  
Location:    [app/api/work-orders/[id]/follow-up/route.ts:48](file:///mnt/data/bossuyt_service_next_staging/app/api/work-orders/%5Bid%5D/follow-up/route.ts#L48) & [components/WerkbonForm/index.tsx:267](file:///mnt/data/bossuyt_service_next_staging/components/WerkbonForm/index.tsx#L267)  
Severity:    **blocker**  
Confidence:  **high**  

Scenario:
  Technician Bart attends ticket TKT-100 on Monday. An industrial rinse pump is broken
  and Bart has none on the van. Bart adds part P-900 ("Rinse pump 230V", €380), checks
  "te bestellen" (toOrder: true), and submits the bon. The system creates an order_part
  task for the warehouse. The warehouse buys the pump from the supplier and marks it done.
  The office creates a follow-up work order via POST /api/work-orders/[id]/follow-up. Line 48
  maps the completed part into prefillParts, setting toOrder: false.
  
  Three days later, Bart picks up the ordered pump from the warehouse and drives out for
  the revisit. Bart fits the pump and submits the follow-up bon. In WerkbonForm/index.tsx:267,
  the submit logic evaluates:
    type: part.toOrder ? 'order_part' : 'replenish_stock'
  Because toOrder is false, the system generates a replenish_stock task for P-900
  ("Stock aanvullen: Rinse pump 230V"). The warehouse treats this as van inventory
  depletion and orders a second €380 pump from the supplier to refill Bart's van.
  Bossuyt has now bought the same €380 pump twice for a single repair.

Why the code believes otherwise:
  The codebase models the part lifecycle with a single binary boolean (toOrder). The author
  assumed: "The part was already ordered, so the technician does not need to order it again;
  therefore toOrder = false". But toOrder: false is overloaded to mean "taken from shelf/van
  stock; replenish stock", lacking the third real-world state: "job-ordered part being installed".

Suggested fix:
  Add an explicit origin discriminator to PdfPart:
    source: 'van_stock' | 'to_order' | 'job_allocated'
  When prefillParts are mapped in follow-up/route.ts, set source: 'job_allocated'. On submit,
  suppress creating replenish_stock tasks for any part where source === 'job_allocated'.

---

### L-02 — Follow-up prefilled parts stored in `work_orders.prefill_parts` are never loaded into the technician's form

Rule broken: **F4** ("The revisit's pre-filled part list comes from parts that were ordered for the original job.")  
Location:    [lib/server/interventions.ts:84-130](file:///mnt/data/bossuyt_service_next_staging/lib/server/interventions.ts#L84-L130), [types/index.ts:106-146](file:///mnt/data/bossuyt_service_next_staging/types/index.ts#L106-L146), & [components/WerkbonForm/index.tsx:37-59](file:///mnt/data/bossuyt_service_next_staging/components/WerkbonForm/index.tsx#L37-L59)  
Severity:    **blocker**  
Confidence:  **high**  

Scenario:
  The warehouse receives and picks the parts for follow-up ticket TKT-100. Technician Bart
  arrives at the customer site and opens the follow-up work order in the mobile app. The form
  initializes via initialForm(intervention). Bart looks at the "Onderdelen" section: it is
  completely empty (parts: []).
  
  The prefilled parts saved in PostgreSQL column work_orders.prefill_parts are never queried
  by lib/server/interventions.ts and never exposed on the Intervention type. Bart's screen
  shows "Geen verbruikte onderdelen". Unsure of what was ordered or approved, Bart either
  manually re-types the parts from memory or leaves the parts section blank. When the bon is
  signed and submitted, the customer-signed PDF and Navision invoice contain zero parts.

Why the code believes otherwise:
  The database migration added prefillParts: jsonb('prefill_parts') to the schema and
  follow-up/route.ts writes to it. However, the data reading pipeline (lib/server/interventions.ts)
  and the TypeScript interface (types/index.ts) were never updated to select or expose it.
  Data is written to PostgreSQL and immediately orphaned.

Suggested fix:
  1. Add prefillParts?: import('@/lib/pdf').PdfPart[] to Intervention in types/index.ts.
  2. Select workOrders.prefillParts in lib/server/interventions.ts and pass it in toIntervention.
  3. Initialize parts: intervention.prefillParts ?? [] inside initialForm in WerkbonForm/index.tsx.

---

### L-03 — Refreshing or restoring a draft clears on-site picked device metadata on the printed PDF

Rule broken: **V4** ("The customer's signature belongs to the bon as printed. If the bon's content can change after signing, that is a defect.") and **I2**  
Location:    [components/WerkbonForm/index.tsx:72, 197-203, 319-328](file:///mnt/data/bossuyt_service_next_staging/components/WerkbonForm/index.tsx#L72)  
Severity:    **serious**  
Confidence:  **high**  

Scenario:
  Technician Sarah arrives at a laundry facility for a work order created without a known
  device (deviceId: null). On-site, Sarah selects the actual unit ("Electrolux W5180H", serial
  SN-9942) using DevicePicker. The selection sets pickedDevice in React local state and saves
  form.deviceId into the IndexedDB draft.
  
  Before handing the phone to the manager for signature, Sarah switches to the camera app.
  Mobile Safari unloads the background tab to save memory. When Sarah switches back, the page
  reloads. loadWerkbon restores form.deviceId, but pickedDevice initializes to null. Sarah gets
  the manager's signature and taps submit. buildPdfData() executes:
    pickedDevice?.brand ?? intervention.deviceBrand
  Because pickedDevice is null and intervention.deviceBrand is undefined, deviceDescription,
  deviceUnitNumber, and deviceDeliveryDate evaluate to empty strings. The PDF generated and signed
  by the customer is completely blank in the UNIT N° and OMSCHRIJVING boxes.

Why the code believes otherwise:
  The form component holds full device metadata in an ephemeral React useState<Device | null>(null)
  instead of storing it in WerkbonFormState (which is persisted to IndexedDB) or re-fetching device
  details when form.deviceId is loaded from the draft.

Suggested fix:
  Store pickedDevice directly inside WerkbonFormState (persisted in IndexedDB), or add a useEffect
  that fetches /api/devices/${form.deviceId} whenever form.deviceId is truthy and pickedDevice is null.

---

### L-04 — Client-generated PDF embeds preview bon number instead of authoritative server number

Rule broken: **B1, B2, B3** ("A bon number, once printed and signed, never changes.") and **V4**  
Location:    [components/WerkbonForm/index.tsx:116-124, 174-175, 230](file:///mnt/data/bossuyt_service_next_staging/components/WerkbonForm/index.tsx#L116) & [app/api/work-orders/[id]/complete/route.ts:84-97](file:///mnt/data/bossuyt_service_next_staging/app/api/work-orders/%5Bid%5D/complete/route.ts#L84)  
Severity:    **serious**  
Confidence:  **high**  

Scenario:
  Work order TKT-200 had an initial visit resulting in bon TKT-200-01. A revisit occurs.
  In WerkbonForm/index.tsx:116-124, previewDeviceId is checked to fetch history. If the work
  order has no device assigned (or history fetch drops), existingCount remains 0. The preview
  generates TKT-200-01. The client compiles the PDF with TKT-200-01 stamped in the header,
  and the customer signs it.
  
  The PDF is sent to POST /api/work-orders/[id]/complete. The server executes a row-locked count
  on werkbonnen, finds 1 existing row, and allocates authoritative bon number TKT-200-02.
  PostgreSQL stores bon_number = 'TKT-200-02', but pdf_path points to the uploaded PDF stamped
  with TKT-200-01. When accounting opens the signed PDF from Navision, the printed number does
  not match the database record or invoice line.

Why the code believes otherwise:
  The client generates and bakes the PDF before calling the complete endpoint, assuming that
  an optimistic un-locked client preview count will always match the sequence number allocated
  under a PostgreSQL row lock.

Suggested fix:
  Allocate the authoritative bon number via an atomic server-side endpoint before rendering the
  final PDF for signature, or stamp the allocated bon number onto the PDF server-side during complete.

---

### L-05 — Work order completion emits no audit event in `work_order_events`

Rule broken: **T4** ("Every transition writes a work_order_events row naming the actor. An unattributed state change is a defect.")  
Location:    [app/api/work-orders/[id]/complete/route.ts:121-130](file:///mnt/data/bossuyt_service_next_staging/app/api/work-orders/%5Bid%5D/complete/route.ts#L121-L130)  
Severity:    **serious**  
Confidence:  **high**  

Scenario:
  Dispatcher Anouk inspects the timeline for work order TKT-301 via GET /api/work-orders/301/timeline
  and /activiteiten. She sees ticket creation, assignment, and parts ordering. However, there is no
  event showing that technician Bart completed the work order, when it became afgewerkt, or what
  bon number was issued. The status transition from bezig to afgewerkt is completely missing from
  the append-only audit ledger.

Why the code believes otherwise:
  POST /api/work-orders/[id]/complete updates workOrders.status = 'afgewerkt' and inserts into
  werkbonnen, but omits an insert into workOrderEvents.

Suggested fix:
  Inside the withAudit transaction in complete/route.ts, insert an event into workOrderEvents:
    await tx.insert(workOrderEvents).values({
      workOrderId: id,
      actorId: changedBy ?? 'unknown',
      eventType: 'work_order_completed',
      payload: { bonNumber: number, werkbonId },
    })

---

### L-06 — Skipped part orders are exported to ERP as active supplier purchases

Rule broken: **T1** ("skipped and cancelled are terminal") and **P2** ("Only supplier purchases reach the ERP")  
Location:    [app/api/erp/parts-pending/route.ts:28-32](file:///mnt/data/bossuyt_service_next_staging/app/api/erp/parts-pending/route.ts#L28-L32)  
Severity:    **serious**  
Confidence:  **high**  

Scenario:
  Technician Marc orders a solenoid valve V-12. The customer later informs Bossuyt they found
  a spare on their shelf. The warehouse marks the task "Skip" with reason "Klant heeft onderdeel".
  The task status becomes skipped.
  
  When Navision ERP polls GET /api/erp/parts-pending, the query executes:
    and(
      eq(tasks.type, 'order_part'),
      ne(tasks.status, 'done'),
      ne(tasks.status, 'cancelled'),
    )
  Because tasks.status is 'skipped', both ne conditions evaluate to true. Navision ingests
  the skipped part and automatically issues a purchase order to the supplier for a valve
  Bossuyt explicitly cancelled.

Why the code believes otherwise:
  The query author assumed any task that is not done and not cancelled is active and pending
  purchase, forgetting that skipped is also a terminal status under Rule T1.

Suggested fix:
  Query for active statuses explicitly:
    where(
      and(
        eq(tasks.type, 'order_part'),
        inArray(tasks.status, ['ready', 'in_progress']),
      ),
    )

---

### L-07 — Reassigning a technician creates an invisible warehouse transfer task

Rule broken: Bug Class 1 & 2 (Enum conflation & filter asymmetry)  
Location:    [app/api/work-orders/[id]/assign/route.ts:108-119](file:///mnt/data/bossuyt_service_next_staging/app/api/work-orders/%5Bid%5D/assign/route.ts#L108-L119) & [app/api/warehouse/queue/route.ts:54, 73](file:///mnt/data/bossuyt_service_next_staging/app/api/warehouse/queue/route.ts#L54)  
Severity:    **serious**  
Confidence:  **high**  

Scenario:
  The warehouse picks parts for a revisit and puts them into Technician Tom's van bin.
  Planning later reassigns the ticket to Technician Jan via POST /api/work-orders/[id]/assign.
  The assignment endpoint detects that pickTask is done while loadTask is not loaded, so it creates
  a warehouse task:
    type: 'other', role: 'warehouse', title: 'Verplaats onderdelen: van Tom naar Jan'
  
  However, the warehouse queue route (app/api/warehouse/queue/route.ts) selects strictly:
    inArray(tasks.type, ['order_part', 'replenish_stock'])
    and
    eq(tasks.type, 'pick_parts')
  The task of type 'other' is completely filtered out and invisible in /magazijn. The warehouse
  never moves the parts. Tom drives off with Jan's parts, and Jan arrives at the job empty-handed.

Why the code believes otherwise:
  The assignment route assumed warehouse workers view all tasks where role = 'warehouse',
  whereas the warehouse interface queries only specific whitelisted task types.

Suggested fix:
  Add an explicit task type 'transfer_parts' to DbTaskType, and update app/api/warehouse/queue/route.ts
  and app/magazijn/page.tsx to display transfer tasks.

---

### L-08 — Work start and work end times are dropped from the printed PDF

Rule broken: **V1** ("Arrival/departure time and work start/end are four different timestamps and are not interchangeable. Travel is billed differently from work.")  
Location:    [lib/pdf.ts:300-308](file:///mnt/data/bossuyt_service_next_staging/lib/pdf.ts#L300-L308) & [components/WerkbonForm/index.tsx:179-217](file:///mnt/data/bossuyt_service_next_staging/components/WerkbonForm/index.tsx#L179)  
Severity:    **serious**  
Confidence:  **high**  

Scenario:
  Technician Kevin arrives on site at 08:00 (arrivalTime). Because the kitchen is serving breakfast,
  Kevin cannot access the dishwasher until 09:00 (workStart). Work finishes at 11:00 (workEnd),
  and Kevin departs at 11:30 (departureTime).
  
  The customer signs the service bon. On the generated PDF, only 08:00 and 11:30 appear.
  When the invoice arrives billing 2 hours of labor and 1.5 hours of travel/on-site wait time,
  the customer disputes the bill, pointing to the signed PDF which states 3.5 hours on-site
  with no record of actual work start or end.

Why the code believes otherwise:
  The form and database store all four timestamps, but ServiceBonPdfData and lib/pdf.ts
  strictly replicated the legacy printed paper form, which historically only had boxes for
  "Aankomstuur" and "Vertrekuur".

Suggested fix:
  Add workStart and workEnd to ServiceBonPdfData, and format them into the visit block
  in lib/pdf.ts so that the customer explicitly signs for labor duration.

---

### L-09 — Premature follow-up creation spawns unblocked picking tasks for non-existent parts

Rule broken: **F1, F3, T2** ("A task is ready only when every predecessor is done.")  
Location:    [app/api/work-orders/[id]/follow-up/route.ts:32-39, 128](file:///mnt/data/bossuyt_service_next_staging/app/api/work-orders/%5Bid%5D/follow-up/route.ts#L32-L39)  
Severity:    **serious**  
Confidence:  **high**  

Scenario:
  Technician Tim diagnoses a blown heating element and orders it on Monday (order_part task is
  ready). The office immediately clicks "Maak opvolgbon" to place the visit on next week's calendar.
  
  In follow-up/route.ts, the query searches only for tasks where status = 'done'. Because the supplier
  has not delivered the element, doneParts is empty. The follow-up is created with prefillParts: null.
  Crucially, line 128 creates a pick_parts task in status 'ready'. The warehouse screen immediately
  displays an empty picking card with 0 parts, while the replacement element has not even been
  ordered by the supplier.

Why the code believes otherwise:
  follow-up/route.ts assumes it will only be called after all parts have arrived, but enforces no guard
  checking for outstanding order_part tasks on the parent work order.

Suggested fix:
  Either block follow-up creation while order_part tasks remain incomplete, or link pick_parts with
  a finish-to-start dependency to the outstanding order_part tasks so it only becomes ready when
  the supplier delivery is fulfilled.

---

### L-10 — Part quantities accept zero and negative numbers without validation

Rule broken: **P3** ("A quantity is always a positive integer. A part with quantity 0 is not a part.")  
Location:    [app/api/work-orders/[id]/complete/route.ts:55-56](file:///mnt/data/bossuyt_service_next_staging/app/api/work-orders/%5Bid%5D/complete/route.ts#L55) & [components/WerkbonForm/PartsSection.tsx:45](file:///mnt/data/bossuyt_service_next_staging/components/WerkbonForm/PartsSection.tsx#L45)  
Severity:    **serious**  
Confidence:  **high**  

Scenario:
  In PartsSection.tsx:45, typing a negative number (e.g. -2) results in parseInt("-2") || 1,
  which preserves -2. When submitted, complete/route.ts receives completionParts via
  jsonList<PdfPart>, which only checks Array.isArray. The negative quantity is written directly
  to werkbonnen.parts and sent to /api/tasks. Navision processes a negative quantity purchase order
  or inventory movement, corrupting stock ledgers.

Why the code believes otherwise:
  The server relies on the frontend HTML min={1} attribute and omits validation of individual
  part items in the multipart JSON payload.

Suggested fix:
  In app/api/work-orders/[id]/complete/route.ts, validate each part in completionParts:
    if (!Number.isInteger(part.quantity) || part.quantity <= 0) {
      return NextResponse.json({ error: 'Aantal moet een positief geheel getal zijn' }, { status: 400 })
    }

---

### L-11 — Warehouse "done today" and daily planning boundaries miscalculate across Belgian timezone offset

Rule broken: Bug Class 8 (Ordering and time)  
Location:    [app/api/warehouse/queue/route.ts:44-45](file:///mnt/data/bossuyt_service_next_staging/app/api/warehouse/queue/route.ts#L44) & [lib/server/interventions.ts:76-80](file:///mnt/data/bossuyt_service_next_staging/lib/server/interventions.ts#L76-L80)  
Severity:    **serious**  
Confidence:  **high**  

Scenario:
  A warehouse worker in Kuurne processes a stock arrival at 00:30 Belgian local time (CEST = UTC+2)
  on Wednesday (22:30 UTC Tuesday). In app/api/warehouse/queue/route.ts:
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
  On a cloud Docker container running in UTC, todayStart is Wednesday 00:00 UTC. The task was
  completed at 22:30 UTC Tuesday. Because completedAt < todayStart, the task is excluded from
  "Vandaag verwerkt".
  Similarly, in lib/server/interventions.ts:77, a morning intervention scheduled for 01:00 Belgian
  time is 23:00 UTC the previous day, and is excluded from the technician's day view.

Why the code believes otherwise:
  The code assumes Node.js process time matches the Belgian calendar day, ignoring that production
  containers run in UTC while Belgium operates in UTC+1 / UTC+2.

Suggested fix:
  Anchor date boundaries to 'Europe/Brussels' using Intl.DateTimeFormat or date-fns timezone utilities.

---

### L-12 — Changing visit date silently overwrites manually chosen intervention billing rate

Rule broken: **V3** ("Week and weekend are different rates. interventionKind decides which, and it is not derivable from the visit date alone — Bossuyt decides.")  
Location:    [components/WerkbonForm/VisitSection.tsx:79-86](file:///mnt/data/bossuyt_service_next_staging/components/WerkbonForm/VisitSection.tsx#L79-L86)  
Severity:    **minor**  
Confidence:  **high**  

Scenario:
  Bossuyt agrees to bill a weekend service call on Saturday at weekday rates under warranty.
  The technician manually selects "Week" under Interventie. Later, the technician adjusts or
  confirms the visit date in the date picker. The onChange handler recalculates:
    const day = new Date(`${value}T12:00:00`).getDay()
    onChange('interventionKind', day === 0 || day === 6 ? 'weekend' : 'week')
  The date change immediately forces interventionKind back to 'weekend', silently overriding
  the commercial agreement.

Why the code believes otherwise:
  The UI couples interventionKind as a derived property of visitDate instead of treating it as an
  independent commercial decision that merely defaults based on the date.

Suggested fix:
  Only compute default interventionKind during initial form creation. Remove the forced mutation
  from the visitDate onChange handler.

---

## 3. Wire Format Discrepancies (Rule W1)

As uncovered during `jcodemunch` AST inspection:
* **Rule W1 Violation:** In [app/api/erp/parts-pending/route.ts:34](file:///mnt/data/bossuyt_service_next_staging/app/api/erp/parts-pending/route.ts#L34), the endpoint calls `rows.map(toDbTask)`. `toDbTask` maps database columns to **camelCase** keys (`workOrderId`, `dueDate`, `completedAt`). While all other `/api/erp/*` routes strictly speak `snake_case`, `parts-pending` leaks camelCase across the ERP boundary.
* **Suggested fix:** Map tasks in `/api/erp/parts-pending` to explicit snake_case keys (`work_order_id`, `due_date`, `completed_at`).

---

## 4. Architectural Verification Summary

All 12 findings have been verified through AST static analysis, call graph tracing, and dependency mapping using `jcodemunch`. **No source code was altered during this review.**
