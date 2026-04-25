# Offline Reorder Conflict Implementation Plan

Date: 2026-04-11
Execution: inline only, no subagents

## Goal

Implement offline-first technician reordering with server sync and dispatch-wins conflict handling.

## Steps

### 1. Extend the data contract
- add `planningVersion` to the intervention shape
- include it in DB mapping and sync payloads

### 2. Persist local reorder immediately
- update the route timeline reorder flow
- write updated plannedOrder values into IndexedDB
- enqueue an `update_sequence` pending write with version + ordered ids

### 3. Add server write endpoint
- implement `POST /api/sync/write`
- handle `update_sequence`
- validate version
- return `409` with latest planning on conflict

### 4. Handle reconnect sync behavior
- update `syncPendingWrites()`
- on success remove the pending reorder
- on conflict replace local planning with server planning
- expose a conflict signal/message for the UI

### 5. Show the technician message
- add a visible banner/toast state in the day view
- message:
  - `Planning gewijzigd, gelieve je planning opnieuw te ordenen`

### 6. Verify
- lint relevant files
- build
- redeploy staging
- verify:
  - local reorder updates live times
  - refresh keeps local order
  - sync persists when no conflict
  - conflict reloads dispatch order and shows the message
