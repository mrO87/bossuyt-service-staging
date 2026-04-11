# Handoff Notes

This release handoff does **not** implement the PostgreSQL slice.

The source of truth for DB-backed migration work remains `docs/superpowers/plans/2026-04-10-plan-c-shared-postgres.md`.

`/interventions/[id]` stays visible for now, and it will later be reworked to consume the DB/sync-backed intervention payload instead of the current mock-driven shape.
