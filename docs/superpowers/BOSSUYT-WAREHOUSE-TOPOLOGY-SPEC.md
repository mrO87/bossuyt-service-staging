# Bossuyt Warehouse Topology, Min/Max Inventory & Location System Specification

**Document Reference:** `docs/superpowers/BOSSUYT-WAREHOUSE-TOPOLOGY-SPEC.md`  
**Enterprise:** Bossuyt Grootkeuken NV (Kuurne Central Depot)  
**Role Scope:** Magazijnier & Voorraadbeheerder (Warehouse Manager & Logistics)  
**Status:** Architecture & Design Specification (No code changes)  

---

## 1. Visual Interface Architecture

The warehouse management interface is structured around three core operational pillars:
1. **Physical Spatial Topology:** Interactive 2D Warehouse floor plan with Aisles (*Gangen*), Racks (*Rekken*), and Bins (*Bakken*).
2. **Inventory Thresholds:** Real-time stock levels with Min/Max reorder indicators and automated procurement triggers.
3. **Cycle Counting (Stocktelling):** Discrepancy audits and inventory variance adjustments.

![Bossuyt Warehouse Management & Location Layout](/mnt/data/bossuyt_service_next_staging/docs/mockups/warehouse-layout-minmax.jpg)
*Local Project Path:* [`docs/mockups/warehouse-layout-minmax.jpg`](file:///mnt/data/bossuyt_service_next_staging/docs/mockups/warehouse-layout-minmax.jpg)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  bossuyt | magazijn & voorraad                                                      [📥 Goederenontvangst]  [+ Nieuwe Locatie]  [Sync ERP] │
├───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  [Overzicht]   [Picking voor Techniekers]   [Te Bestellen]   [Voorraad & Min/Max]   [Magazijn Locaties]   [Stocktelling]                  │
├─────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────┤
│ 🗺️ WAREHOUSE FLOOR MAP (INTERACTIEVE 2D PLATTEGROND) │ 📦 VOORRAAD, LOCATIES & MIN/MAX DREMPELS                                            │
├─────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │ 🔍 [Zoek op artikel, barcode, locatie...]  Filter: [Onder Minimum (6) ▼]           │
│ │ GANG A (Combi-steamers & Gas)                   │ ├─────────────────┬───────────────────┬─────────┬─────────┬──────────────┬────────────────┤
│ │ [A-01-01] [A-01-02] [A-01-03] ... [A-06-12]     │ │ ARTIKEL CODE    │ OMSCHRIJVING      │ LOCATIE │ VOORRAAD│ MIN / MAX    │ STATUS         │
│ │ (Bezetting: 88% · 14 onder min)                 │ ├─────────────────┼───────────────────┼─────────┼─────────┼──────────────┼────────────────┤
│ ├─────────────────────────────────────────────────┤ │ RAT-40.00.277   │ Branderautomaat   │ A-04-12 │ 1 stuks │ Min: 3 Max: 8│ 🔴 ONDER MIN   │
│ │ GANG B (Vaatwas, Pompen & Chemie)               │ │ HOB-01.240.11   │ Afvoerpomp 230V   │ B-02-04 │ 0 stuks │ Min: 2 Max: 5│ 🔴 CRITIEK (0) │
│ │ [B-01-01] [B-01-02] [B-01-03] ... [B-08-08]     │ │ MEI-9501234     │ Wasarm Koppeling  │ B-05-11 │ 6 stuks │ Min: 4 Max:10│ 🟢 OPTIMAAL    │
│ │ (Bezetting: 72% · 3 onder min)                  │ │ DAN-060-110     │ Pressostaat KP15  │ C-01-08 │ 14 stuks│ Min: 2 Max: 6│ 🟠 OVERSTOCK   │
│ ├─────────────────────────────────────────────────┤ ├─────────────────┴───────────────────┴─────────┴─────────┴──────────────┴────────────────┤
│ │ GANG C (Koeling, F-Gas & Compressoren)          │ │ SNELLE ACTIES VOOR GESELECTEERD ARTIKEL:                                            │
│ │ [C-01-01] [C-01-02] [C-01-03] ... [C-04-06]     │ │ [📍 Verplaats naar Nieuwe Locatie]  [🔢 Telling Corrigeren]  [🛒 Bestelbon Aanmaken]  │
│ └─────────────────────────────────────────────────┘ └─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Relational Data Modeling (Drizzle ORM)

To support spatial warehouse layout management, min/max policies, and stock counts without storing raw strings in JSON arrays, the database requires four normalized relational tables:

```typescript
// Proposed Schema Architecture: lib/db/schema-warehouse.ts
import { pgTable, text, integer, timestamp, boolean, numeric, pgEnum, primaryKey } from 'drizzle-orm/pg-core'

// ── 1. Warehouse Location Topology ──────────────────────────────────────────
export const warehouseZones = pgTable('warehouse_zones', {
  id: text('id').primaryKey(),         // 'ZONE-MAIN', 'ZONE-BULK', 'ZONE-EXPEDITION'
  name: text('name').notNull(),        // 'Hoofdmagazijn Kuurne'
  description: text('description'),
})

export const warehouseLocations = pgTable('warehouse_locations', {
  id: text('id').primaryKey(),         // Composite: 'A-04-12'
  zoneId: text('zone_id').notNull(),
  aisle: text('aisle').notNull(),      // 'A' (Gang A)
  rack: integer('rack').notNull(),     // 4   (Rek 4)
  shelf: integer('shelf').notNull(),   // 1   (Niveau 1)
  bin: integer('bin').notNull(),       // 2   (Bak 2)
  barcode: text('barcode').notNull().unique(), // 'LOC-A0412'
  pickSequence: integer('pick_sequence').notNull(), // 10412 (Sort order for single-pass picking)
  maxWeightKg: numeric('max_weight_kg', { precision: 8, scale: 2 }),
  isBlocked: boolean('is_blocked').default(false).notNull(),
})

// ── 2. Master Article Registry ──────────────────────────────────────────────
export const articles = pgTable('articles', {
  code: text('code').primaryKey(),     // 'RAT-40.00.277'
  ean: text('ean').unique(),           // '5412345678901'
  description: text('description').notNull(),
  brand: text('brand').notNull(),      // 'Rational', 'Hobart', 'Meiko', 'Danfoss'
  category: text('category').notNull(),// 'Gas', 'Elektrisch', 'Koeling', 'Water'
  primaryLocationId: text('primary_location_id').references(() => warehouseLocations.id),
  costPriceEur: numeric('cost_price_eur', { precision: 10, scale: 2 }).notNull(),
  salePriceEur: numeric('sale_price_eur', { precision: 10, scale: 2 }).notNull(),
  supplierId: text('supplier_id').notNull(),
})

// ── 3. Central & Van Inventory Balances (Min / Max Policies) ─────────────────
export const inventoryBalances = pgTable('inventory_balances', {
  locationScope: text('location_scope').notNull(), // 'WAREHOUSE_KUURNE' or technician ID (e.g. 'TECH-BART')
  articleCode: text('article_code').notNull().references(() => articles.code),
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  quantityAllocated: integer('quantity_allocated').notNull().default(0), // Reserved for scheduled visits
  quantityOnOrder: integer('quantity_on_order').notNull().default(0),     // In transit from supplier
  minStockLevel: integer('min_stock_level').notNull().default(1),        // Reorder point
  maxStockLevel: integer('max_stock_level').notNull().default(5),        // Replenish target ceiling
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.locationScope, t.articleCode] }),
}))

// ── 4. Cycle Counting & Discrepancy Reconciliation ──────────────────────────
export const stockCountSessions = pgTable('stock_count_sessions', {
  id: text('id').primaryKey(),          // 'COUNT-2026-Q3'
  zoneId: text('zone_id').notNull(),
  status: text('status').notNull(),     // 'open', 'review_pending', 'closed'
  startedBy: text('started_by').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
})

export const stockCountLines = pgTable('stock_count_lines', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => stockCountSessions.id),
  articleCode: text('article_code').notNull().references(() => articles.code),
  locationId: text('location_id').notNull().references(() => warehouseLocations.id),
  expectedQuantity: integer('expected_quantity').notNull(),
  countedQuantity: integer('counted_quantity').notNull(),
  discrepancy: integer('discrepancy').notNull(), // countedQuantity - expectedQuantity
  discrepancyCostEur: numeric('discrepancy_cost_eur', { precision: 10, scale: 2 }).notNull(),
  reconciliationReason: text('reconciliation_reason'), // 'breuk', 'diefstal', 'administratieve_fout'
  countedAt: timestamp('counted_at', { withTimezone: true }).defaultNow().notNull(),
})
```

---

## 3. Mathematical Foundations: Min/Max Inventory Replenishment

In industrial service, holding excess inventory wastes working capital, while running out of a critical component stops restaurant operations.

### 3.1 The Reorder Point Formula ($s$)
The **Minimum Stock Level ($s$)** triggers purchase replenishment:
$$s = (d \times L) + SS$$

Where:
* $d$: Average daily demand for this spare part (e.g. 0.5 units/day for Rational gas valves).
* $L$: Supplier lead time in working days (e.g. 4 days from Germany/Brussels).
* $SS$: Safety Stock to prevent stockouts during demand spikes:
  $$SS = Z \times \sigma_L = 1.65 \times \sqrt{L} \times \sigma_d$$
  *(For a 95% service SLA target, $Z = 1.65$)*.

### 3.2 The Target Maximum Level ($S$)
The **Maximum Stock Level ($S$)** is the capacity limit of the shelf bin:
$$S = s + EOQ$$

Where **EOQ** (Economic Order Quantity) minimizes combined ordering and holding costs:
$$EOQ = \sqrt{\frac{2 \times D \times K}{H}}$$
* $D$: Annual demand.
* $K$: Fixed cost per purchase order.
* $H$: Annual holding cost per unit.

### 3.3 Replenishment Trigger Query
When the inventory balance drops to or below the minimum threshold, the system computes the recommended reorder quantity $\Delta$:

```sql
SELECT 
  b.article_code,
  a.description,
  a.supplier_id,
  b.quantity_on_hand,
  b.quantity_on_order,
  b.min_stock_level,
  b.max_stock_level,
  -- Recommended order amount:
  (b.max_stock_level - (b.quantity_on_hand + b.quantity_on_order)) AS suggested_reorder_qty
FROM inventory_balances b
JOIN articles a ON b.article_code = a.code
WHERE b.locationScope = 'WAREHOUSE_KUURNE'
  AND (b.quantity_on_hand + b.quantity_on_order) <= b.min_stock_level;
```

---

## 4. Operational Workflows: Stock Counting & Location Reassignment

### Workflow 1: Organizing & Assigning Locations
1. The warehouse manager selects a rack in **Gang A**.
2. Scans the rack barcode label: `LOC-A0412`.
3. Scans the component box EAN barcode: `RAT-40.00.277`.
4. The system updates `articles.primaryLocationId = 'A-04-12'`, regenerating the optimal pick sequence integer (`10412`).

### Workflow 2: Cycle Counting (Stocktelling Discrepancy Reconciliation)
1. **Blind Count:** The manager walks with a mobile scanner through Gang B. The screen displays the location (`B-02-04`) and prompts: *"Scan parts and enter physical count"*, without displaying the expected system number to eliminate bias.
2. **Discrepancy Calculation:**
   $$\Delta = Q_{\text{physical}} - Q_{\text{system}}$$
3. **Ledger Adjustment:** If $\Delta \neq 0$:
   * A stock adjustment record is logged with timestamp, user ID, and monetary impact.
   * `inventory_balances.quantityOnHand` is atomically adjusted to reflect physical reality.
   * If adjusted below $s$, a replenishment warning is automatically queued.
