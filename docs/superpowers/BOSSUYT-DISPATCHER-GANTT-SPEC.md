# Bossuyt Dispatcher & Planning Console: Microsoft Dynamics 365 Universal Resource Scheduling (URS) Pattern

**Document Reference:** `docs/superpowers/BOSSUYT-DISPATCHER-GANTT-SPEC.md`  
**Enterprise:** Bossuyt Grootkeuken NV (Kuurne Central Operations)  
**Role Scope:** Dispatcher / Planner & Service Coordinator  
**Status:** Architecture Specification & Visual Mockup (No code changes)  

---

## 1. Visual Interface Architecture

Below is the rendered interface for the Bossuyt Planning & Dispatch Console, modeled after the Microsoft Dynamics 365 Universal Resource Scheduling (URS) engine:

![Bossuyt Planning & Dispatch Console](/mnt/data/bossuyt_service_next_staging/docs/mockups/dispatcher-gantt-board.jpg)
*Local Project Path:* [`docs/mockups/dispatcher-gantt-board.jpg`](file:///mnt/data/bossuyt_service_next_staging/docs/mockups/dispatcher-gantt-board.jpg)

### Key Functional Sections in the UI:
1. **Unassigned Incident Pool (`Ongeplande Pool`) — Left Panel (28%):**
   * Sorted by priority: 🔴 **Warm / Dringend** (active restaurant failure) ➔ 🟡 **Gepland** (follow-up) ➔ 🔵 **Montage** (new kitchen install) ➔ 🟢 **Preventief** (routine maintenance).
   * Displays required skills, machine type, customer name, and locality.
2. **Multi-Resource Timeline Gantt — Main Panel (72%):**
   * 15-minute fractional grid columns from 07:30 to 18:00.
   * Technician rows display name, van number, home zone (*W-VL, Gent, Kust*), and certified competencies (`[Cerga Gas, Combi-steamer]`, `[Vaatwas, Elektrisch]`, `[Koeling F-Gas Cat.1]`).
   * **Dynamic Travel Duration Cards:** Auto-calculated travel buffers (`🚗 25 min (E17)`) injected between consecutive customer sites.
   * **2-Tech Crew Synchronization:** Linked visual booking badge showing Lead Technician Bart V. and Apprentice Luc P. scheduled together for heavy kitchen montages.
3. **Telematics & Live Map Bar (Bottom):**
   * Displays real-time GPS coordinates, vehicle ignition status, and geofence ETA telemetry.

---

## 2. Computer Science Lecture: Implementing the Scheduling Engine

As your bachelor-level mentor, let's analyze how to write the core algorithms that power this dispatch board.

### A. Skill Matrix Matching Algorithm (Proficiency-Aware Validation)
* **The "Why":** Under Belgian safety law, a technician without a **Cerga Gas Certification** is legally prohibited from opening a gas fryer control block, while handling refrigerants requires an **F-Gas Category 1 certificate** (VLAREM II).
* **How You Implement It:** When an operator drags a ticket from the unassigned pool over a technician row, execute a validation check:

```typescript
// lib/dispatch/skills-validator.ts
export interface SkillRequirement {
  skillCode: string     // 'gas_cerga', 'f_gas_cat1', 'rational_combi'
  minProficiency: 1 | 2 | 3 // 1: Junior, 2: Competent, 3: Expert / Inspector
}

export interface TechnicianCompetency {
  skillCode: string
  proficiency: number
  validUntil: Date
}

export function validateTechnicianSkillMatch(
  requirements: SkillRequirement[],
  techSkills: TechnicianCompetency[]
): { isEligible: boolean; missingSkills: string[]; expiredSkills: string[] } {
  const missingSkills: string[] = []
  const expiredSkills: string[] = []
  const now = new Date()

  for (const req of requirements) {
    const match = techSkills.find(s => s.skillCode === req.skillCode)
    if (!match) {
      missingSkills.push(req.skillCode)
    } else if (new Date(match.validUntil) < now) {
      expiredSkills.push(req.skillCode)
    } else if (match.proficiency < req.minProficiency) {
      missingSkills.push(`${req.skillCode} (Requires level ${req.minProficiency}, has ${match.proficiency})`)
    }
  }

  return {
    isEligible: missingSkills.length === 0 && expiredSkills.length === 0,
    missingSkills,
    expiredSkills,
  }
}
```

* **Frontend UI Behavior:**
  * If `isEligible === true` $\implies$ Drag target turns subtle brand green (`bg-emerald-50/50`).
  * If `isEligible === false` $\implies$ Target turns cautionary red (`border-brand-red`), and dropping the card prompts an **Explicit Dispatcher Override Modal** requiring a manager reason code.

---

### B. Dynamic Travel Buffer Calculation (OSRM Distance Matrix)
* **The "Why":** If a dispatcher schedules Job A in Kortrijk until 11:30 and Job B in Brugge at 11:45, the technician is physically guaranteed to be late, frustrating the customer and violating SLA deadlines.
* **How You Implement It:** Use the Open Source Routing Machine (OSRM) or TomTom API:

```typescript
// lib/server/routing.ts
export async function computeTravelBufferMinutes(
  originLat: number, originLng: number,
  destLat: number, destLng: number
): Promise<{ durationMinutes: number; distanceKm: number }> {
  const url = `http://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`
  const res = await fetch(url)
  const data = await res.json()

  if (!data.routes || data.routes.length === 0) {
    return { durationMinutes: 30, distanceKm: 20 } // Safe fallback
  }

  const durationMinutes = Math.ceil(data.routes[0].duration / 60)
  const distanceKm = Math.round(data.routes[0].distance / 1000)

  return { durationMinutes, distanceKm }
}
```

* When Job B is dragged to 12:00 following Job A ending at 11:30, the system automatically injects a non-billable **Travel Block** (`🚗 25 min (E17) · 32 km`) occupying the 11:30–11:55 gap.

---

### C. Multi-Resource Crew Scheduling (2-Technician Lockstep Booking)
* **The "Why":** Unloading a 400kg rack conveyor dishwasher (*Meiko Bandautomaat*) or servicing a commercial hood fan motor requires two technicians working simultaneously. If the dispatcher moves the appointment for the lead technician, the secondary technician's schedule must move synchronously.
* **How You Implement It in PostgreSQL (Drizzle ORM):**

```typescript
// lib/db/schema-dispatch.ts
import { pgTable, text, timestamp, boolean, integer, pgEnum } from 'drizzle-orm/pg-core'

export const assignmentRoleEnum = pgEnum('assignment_role', [
  'lead_technician',
  'assisting_technician',
  'apprentice',
])

export const dispatchAssignments = pgTable('dispatch_assignments', {
  id: text('id').primaryKey(),
  workOrderId: text('work_order_id').notNull(),
  technicianId: text('technician_id').notNull(),
  crewGroupId: text('crew_group_id'), // Shared UUID for multi-resource bookings
  role: assignmentRoleEnum('role').default('lead_technician').notNull(),
  scheduledStart: timestamp('scheduled_start', { withTimezone: true }).notNull(),
  scheduledEnd: timestamp('scheduled_end', { withTimezone: true }).notNull(),
  travelBufferMinutesBefore: integer('travel_buffer_minutes_before').default(0).notNull(),
  isLocked: boolean('is_locked').default(false).notNull(),
})
```

* **Synchronous Drag Mutation:** When dragging any assignment with an active `crewGroupId`, the update query moves all sibling assignments sharing that `crewGroupId`:
```sql
UPDATE dispatch_assignments
SET 
  scheduled_start = scheduled_start + interval '1 hour',
  scheduled_end = scheduled_end + interval '1 hour'
WHERE crew_group_id = 'CREW-8941';
```

---

## 3. Direct Visual Links on Hetzner Server

* **Direct IP Link:** http://77.42.68.133:3000/api/uploads/mockups/dispatcher-gantt-board.jpg
* **HTTPS Domain Link:** https://staging.bossuyt.fixassistant.com/api/uploads/mockups/dispatcher-gantt-board.jpg
* **Local Project File:** [`docs/mockups/dispatcher-gantt-board.jpg`](file:///mnt/data/bossuyt_service_next_staging/docs/mockups/dispatcher-gantt-board.jpg)
