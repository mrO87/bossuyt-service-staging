# Offline Reorder Conflict Design

Date: 2026-04-11
Status: approved in chat

## Goal

Let the technician reorder planned jobs offline, immediately see updated driving times, persist that order locally first, and then sync it to the shared database when online again.

If dispatch changed the planning in the meantime, dispatch wins. On reconnect the technician immediately sees the dispatch version and gets a clear message:

`Planning gewijzigd, gelieve je planning opnieuw te ordenen`

## Scope

In scope:
- local offline persistence of reordered planning
- pending write queue entry for sequence changes
- server-side persistence of technician reorder when no conflict exists
- conflict detection using a planning version
- dispatch-wins behavior on reconnect
- replacing local planning with the server planning on conflict
- visible conflict message in the technician app

Out of scope:
- merge strategies between technician and dispatch reorders
- per-job conflict explanation
- chat
- admin/dispatcher UI for reordering

## Design

### Versioning

Each day planning needs one server-owned version marker. For this phase a simple day-level version is enough.

Use:
- `planningVersion` as an integer on each work order row for the relevant day
- all work orders in the same day planning are updated to the same incremented version when dispatch changes order

This keeps conflict detection simple:
- client sends the last known `planningVersion`
- server accepts reorder only when that version still matches the current server planning version for that technician/day

### Client Flow

1. Technician drags jobs in the route timeline.
2. UI updates immediately.
3. IndexedDB updates immediately so refresh/offline keeps the same order.
4. A pending write of type `update_sequence` is queued.
5. Route times recalculate live from the local order.
6. When online, `syncPendingWrites()` sends the reorder write.
7. If accepted:
   - server persists the new order
   - local pending write is removed
8. If rejected because dispatch changed planning:
   - server returns conflict plus the latest server planning
   - client replaces local planning with that latest planning
   - client removes the stale reorder write
   - client shows the conflict message

### Server Flow

Add `POST /api/sync/write`.

For `update_sequence`:
- request includes:
  - `technicianId`
  - `date`
  - `planningVersion`
  - ordered list of work order ids
- server loads current planning for that technician/day
- server computes current planning version
- if request version mismatches:
  - return `409 conflict`
  - include latest planning payload for that day
- if request version matches:
  - update `plannedOrder`
  - bump planning version
  - return success and the new version

### Conflict Rule

Dispatch always wins.

If the server planning changed while the technician was offline:
- the technician does not keep their local order
- the app replaces local data with the dispatch version immediately
- the app shows:
  - `Planning gewijzigd, gelieve je planning opnieuw te ordenen`

### Future Chat Note

Later, add chat as a separate shared service for all apps instead of coupling it to one app only.

Planned chat contexts:
- planning
- work order
- general

Likely shape:
- separate Docker service
- shared auth/integration with all apps
- context-linked threads
