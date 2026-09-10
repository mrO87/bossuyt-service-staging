# Bossuyt Warehouse Architecture: Orders Structure, Technician Part Finder & Multi-Day Stock Counting

**Document Reference:** `docs/superpowers/BOSSUYT-WAREHOUSE-ORDERS-LOCATOR-COUNT-SPEC.md`  
**Enterprise:** Bossuyt Grootkeuken NV (Kuurne Central Depot)  
**Role Scope:** Magazijnier & Technieker Self-Picking / Voorraadbeheer  
**Status:** Architectural Specification & Design System Visuals (No code changes)  

---

## 1. Visual Interface Artifacts

### 1.1 Interface 1: Technician Part Finder, Warehouse Shelf Locator & Order Station

Designed for technicians entering the depot and warehouse pickers staging orders. Technicians search for any part, see its exact shelf coordinates, view a highlighted aisle mini-map, and click **"Neem uit magazijn naar Bus 14"** to self-pick:

![Bossuyt Part Finder, Shelf Locator & Order Station](/mnt/data/bossuyt_service_next_staging/docs/mockups/technician-part-finder-orders.jpg)
*Local Project Path:* [`docs/mockups/technician-part-finder-orders.jpg`](file:///mnt/data/bossuyt_service_next_staging/docs/mockups/technician-part-finder-orders.jpg)

#### Key Architectural Capabilities:
* **Instant Physical Coordinates:** Displays `GANG A · REK 04 · NIVEAU 1 · BAK 12` in high-contrast orange badges.
* **Aisle Mini-Map:** Visual representation of Gang A highlighting the exact shelf location (`04-1-12`).
* **Machine Cross-Compatibility:** Informs technician that this part fits both *Rational iCombi Pro* and *Rational SCC 101*.
* **One-Tap Self-Picking:** Deducts central depot inventory and increments the technician's van ledger in an atomic database transaction.
* **Order Status Sidebar:** Real-time visibility into supplier purchase orders and technician staging boxes.

---

### 1.2 Interface 2: Annual Multi-Day Stock Counting & Inventory Valuation Console

Designed for the annual audit conducted over several days (e.g. rack-by-rack), with support for spot/test counts and automated loss estimation:

![Annual Stock Count & Valuation Audit Dashboard](/mnt/data/bossuyt_service_next_staging/docs/mockups/annual-stock-count-valuation.jpg)
*Local Project Path:* [`docs/mockups/annual-stock-count-valuation.jpg`](file:///mnt/data/bossuyt_service_next_staging/docs/mockups/annual-stock-count-valuation.jpg)

#### Key Architectural Capabilities:
* **Executive Summary KPIs:**
  * **Total Stock Value:** € 142.850 (Current asset value in Kuurne depot).
  * **Counting Progress:** 78% Voltooid (Dag 3 van 4).
  * **Estimated Shrinkage/Loss:** € -1.240 (0.8% of inventory value).
  * **Discrepancies:** 12 items flagged for manager review.
* **Rack-by-Rack Snapshot Freeze:** Allows counting Rek A-01 on Monday, Rek A-02 on Tuesday, without freezing warehouse dispatches.
* **Test Count ("Test tellen") Action:** Trigger spontaneous spot checks on high-value components.
* **Variance Reconciliation Table:** Displays System Stock vs Physical Count, Discrepancy Cost, Reason Code (*Breuk, Administratief, Diefstal*), with **Keur Verschil Goed** and **Her-tel** controls.

---

## 2. Computer Science Lecture: Implementing the Multi-Day Count Algorithm

### The "Why": The Problem of Concurrent Inventory Movement
If an annual inventory count takes 4 days to complete, what happens when Rek A-01 is counted on Monday afternoon, but on Tuesday morning Technician Bart takes 2 heating elements from Rek A-01 for an emergency hospital kitchen repair?
* **Naive Approach (Bug):** When the manager finalizes the count on Thursday, the system compares Thursday's live balance against Monday's physical count, reporting a false discrepancy (-2 missing parts).
* **Engineering Solution: Snapshot Freeze with Delta Compensation.**

### The Snapshot Algorithm
When a warehouse worker clicks **"Start telling voor Rek A-01"**:
1. The database captures a frozen baseline: $Q_{\text{frozen}} = Q_{\text{system}}(t_0)$.
2. The worker performs the physical count: $Q_{\text{physical}}$.
3. The raw count variance is established immediately at timestamp $t_0$:
   $$\Delta_{\text{audit}} = Q_{\text{physical}} - Q_{\text{frozen}}$$
4. Any stock transactions occurring at $t > t_0$ write their standard ledger movements without altering $\Delta_{\text{audit}}$.
5. When the full warehouse count is closed on Day 4:
   $$\text{Final Balance} = Q_{\text{physical}} + \sum_{t_0}^{t_{\text{close}}} \text{Movements}$$

```typescript
// Algorithm: Reconciling Multi-Day Count Lines
export interface StockCountSnapshot {
  rackId: string
  articleCode: string
  frozenAt: Date
  frozenQuantity: number
  physicalCount: number
  variance: number // physicalCount - frozenQuantity
  costPriceEur: number
  lossEstimatedEur: number // variance * costPriceEur
}

export function computeRackValuation(lines: StockCountSnapshot[]) {
  const totalValuationEur = lines.reduce((acc, l) => acc + (l.physicalCount * l.costPriceEur), 0)
  const totalShrinkageEur = lines.filter(l => l.variance < 0)
                                 .reduce((acc, l) => acc + Math.abs(l.lossEstimatedEur), 0)
  const discrepancyCount = lines.filter(l => l.variance !== 0).length

  return { totalValuationEur, totalShrinkageEur, discrepancyCount }
}
```

---

## 3. Technician Self-Picking Engine (Atomic Van Transfer)

When a technician is at the Kuurne warehouse and clicks **"Neem uit magazijn naar Bus 14"**, execute an atomic PostgreSQL transaction:

```typescript
// POST /api/warehouse/self-pick
export async function executeTechnicianSelfPick(tx: DrizzleTransaction, input: {
  articleCode: string
  technicianId: string
  quantity: number
  reason: 'work_order' | 'van_replenish'
  workOrderId?: string
}) {
  // 1. Check available stock in warehouse
  const whBalance = await tx.query.inventoryBalances.findFirst({
    where: and(
      eq(inventoryBalances.locationScope, 'WAREHOUSE_KUURNE'),
      eq(inventoryBalances.articleCode, input.articleCode)
    )
  })

  if (!whBalance || whBalance.quantityOnHand < input.quantity) {
    throw new Error('Onvoldoende voorraad in magazijn')
  }

  // 2. Decrement central warehouse
  await tx.update(inventoryBalances)
    .set({ quantityOnHand: sql`${inventoryBalances.quantityOnHand} - ${input.quantity}` })
    .where(and(
      eq(inventoryBalances.locationScope, 'WAREHOUSE_KUURNE'),
      eq(inventoryBalances.articleCode, input.articleCode)
    ))

  // 3. Increment technician's van stock
  await tx.insert(vanInventory)
    .values({
      technicianId: input.technicianId,
      articleCode: input.articleCode,
      quantityOnHand: input.quantity,
    })
    .onConflictDoUpdate({
      target: [vanInventory.technicianId, vanInventory.articleCode],
      set: { quantityOnHand: sql`${vanInventory.quantityOnHand} + ${input.quantity}` },
    })

  // 4. Log immutable movement for audit trail
  await tx.insert(inventoryMovements).values({
    articleCode: input.articleCode,
    fromScope: 'WAREHOUSE_KUURNE',
    toScope: `VAN_${input.technicianId}`,
    quantity: input.quantity,
    movementType: 'self_pick',
    performedBy: input.technicianId,
    workOrderId: input.workOrderId ?? null,
  })
}
```

---

## 4. Summary of Supported Capabilities

1. **Flexible Location Nomenclature:** Supports arbitrary codes (`A-04-12` or future zone-based schemes) with barcode scanning.
2. **Multi-Day Annual Count:** Racks can be frozen and audited independently over several days with snapshot isolation.
3. **Spontaneous Spot/Test Counting:** Technicians and managers can trigger single-rack audits anytime without launching an enterprise-wide count.
4. **Financial Inventory Report:** Automated calculation of Total Stock Value (€ 142.850) and shrinkage losses (€ -1.240) broken down by cause.
5. **Technician Self-Picking:** Direct search with aisle mini-map and atomic van stock transfer.
