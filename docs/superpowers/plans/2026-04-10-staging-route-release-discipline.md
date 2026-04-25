# Staging Route And Release Discipline Implementation Plan

> **Execution note:** Subagents are disabled for this repo unless the user explicitly re-enables them. Execute this plan inline task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the staging app's visible routes and release workflow consistent, with one repo-owned version source driving the badge and service-app changenotes while keeping hidden future pages out of the active staging UX.

**Architecture:** Introduce a single release metadata module in this repo and make all visible version surfaces read from it. Keep `/interventions/[id]` in the active staging flow, leave `/werkbon/nieuw` directly reachable but unlinked, and preserve `/architecture` as an internal workspace route. This plan deliberately does not duplicate the shared PostgreSQL work already captured in `docs/superpowers/plans/2026-04-10-plan-c-shared-postgres.md`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, ESLint

---

### Task 1: Create One Repo-Owned Release Source

**Files:**
- Create: `lib/releases.ts`
- Modify: `components/VersionBadge.tsx`
- Modify: `app/changenotes/page.tsx`

- [ ] **Step 1: Define the release data shape**

Create `lib/releases.ts` with the smallest shared types needed:
- `ChangeLabel = 'Nieuw' | 'Verbeterd' | 'Fix'`
- `ReleaseChange`
- `ReleaseEntry`

Also export:
- `RELEASES`
- `CURRENT_RELEASE`
- `CURRENT_VERSION`

- [ ] **Step 2: Move the current changelog data into the shared module**

Copy the existing `v1.7` through `v1.4` entries out of `app/changenotes/page.tsx` and into `lib/releases.ts` without changing their visible text.

- [ ] **Step 3: Make the version badge read from the shared source**

Update `components/VersionBadge.tsx` so it imports `CURRENT_VERSION` from `lib/releases.ts` instead of hardcoding `APP_VERSION = 'v1.7'`.

- [ ] **Step 4: Make the changenotes page read from the shared source**

Update `app/changenotes/page.tsx` so it imports `RELEASES` from `lib/releases.ts` and removes the duplicated in-file version array and duplicate type declarations.

- [ ] **Step 5: Verify the shared release source**

Run:
```bash
npm run lint -- lib/releases.ts components/VersionBadge.tsx app/changenotes/page.tsx
```

Expected:
- lint passes
- the badge and changelog both compile against the same version source

### Task 2: Lock The Active Versus Hidden Route Policy

**Files:**
- Modify: `app/interventions/[id]/page.tsx`
- Modify: `app/werkbon/nieuw/page.tsx`
- Modify: `app/architecture/page.tsx`
- Reference: `components/DayView/DayView.tsx`
- Reference: `components/DayTimeline/DayTimeline.tsx`

- [ ] **Step 1: Verify the existing visible flow into `/interventions/[id]`**

Run:
```bash
rg -n "/interventions/\\$\\{|router.push\\(`/interventions/" components/DayView/DayView.tsx components/DayTimeline/DayTimeline.tsx
```

Expected:
- matches exist in the visible day view flow
- the current staging UI still routes job cards into `/interventions/[id]`

- [ ] **Step 2: Leave `/werkbon/nieuw` reachable but unlinked**

Run:
```bash
rg -n "werkbon/nieuw" app components
```

Expected:
- the route exists in `app/werkbon/nieuw/page.tsx`
- no visible navigation or call-to-action from the active staging UI points to it
- do not add redirects, auth gates, or `notFound()` behavior in this phase

- [ ] **Step 3: Add a short intent comment to the hidden future route**

Add a brief comment near the top of `app/werkbon/nieuw/page.tsx` explaining:
- this route is future workflow scaffolding
- it is intentionally not linked from the active staging UI yet

- [ ] **Step 4: Add a short intent comment to the architecture page**

Add a brief comment near the top of `app/architecture/page.tsx` explaining:
- this page is an internal planning/workspace route
- it does not represent the public Bossuyt demo site

- [ ] **Step 5: Verify route policy changes stay type-safe**

Run:
```bash
npm run lint -- app/interventions/[id]/page.tsx app/werkbon/nieuw/page.tsx app/architecture/page.tsx
```

Expected:
- lint passes
- `/interventions/[id]` remains part of the visible staging flow
- `/werkbon/nieuw` remains present in code but unlinked

### Task 3: Encode The Human-Controlled Release Workflow

**Files:**
- Modify: `CLAUDE.md`
- Possibly modify: `README.md`

- [ ] **Step 1: Add a repo rule for version decisions**

Update `CLAUDE.md` with a concise project rule stating:
- when the user asks for changes, the assistant must ask whether this is a new version or a refinement of the current version
- the assistant must not bump versions on its own

- [ ] **Step 2: Add a repo rule for release completion**

In the same instructions block, add:
- when a version is finished, the assistant must ask whether to commit and push it to GitHub

- [ ] **Step 3: Keep the rule scoped to visible staging changes**

Make the wording explicit that:
- visible staging changes can require a version decision
- `/architecture`-only edits and hidden-route edits do not force a release entry by themselves

- [ ] **Step 4: Verify the documentation edits**

Run:
```bash
rg -n "new version|refinement|commit and push|GitHub" CLAUDE.md README.md
```

Expected:
- the agreed release workflow text exists in repo documentation
- no spec file is modified as part of implementation

### Task 4: Make The Current Internal Architecture Page Match The Approved Direction

**Files:**
- Modify: `app/architecture/page.tsx`
- Reference: `docs/superpowers/specs/2026-04-10-staging-route-release-discipline-design.md`
- Reference: `docs/superpowers/plans/2026-04-10-plan-c-shared-postgres.md`

- [ ] **Step 1: Review the current architecture page against the approved direction**

Check whether the current `/architecture` content still matches:
- frozen production demo
- active staging development
- plan-site as explanation layer
- shared PostgreSQL as the next backend foundation

- [ ] **Step 2: Remove stale one-off decision framing if needed**

If the page still reads like a past one-time option comparison instead of an internal working page, update it so it reflects the current approved direction rather than presenting obsolete alternatives as equally open.

- [ ] **Step 3: Keep the page internal and explanatory**

Preserve the page as a place to explain:
- what we are building next
- how staging fits against production demo and plan site
- how the shared PostgreSQL work connects to the service app

- [ ] **Step 4: Verify the architecture page**

Run:
```bash
npm run lint -- app/architecture/page.tsx
```

Expected:
- lint passes
- `/architecture` reads like an internal workspace page, not a public product page

### Task 5: Record The Release Update Procedure For Future Features

**Files:**
- Modify: `lib/releases.ts`
- Modify: `app/changenotes/page.tsx`
- Reference: `components/VersionBadge.tsx`
- Create: `docs/releases/plan-site-sync.md`

- [ ] **Step 1: Add a small maintainer comment near the release source**

In `lib/releases.ts`, add a brief comment stating:
- every visible staging release must update this file
- the badge and `/changenotes` are expected to stay aligned with it

- [ ] **Step 2: Write the plan-site sync procedure as a concrete artifact**

Create `docs/releases/plan-site-sync.md` with the exact release sequence:
- ask the user whether the change is a new version or a refinement
- if it is a new version, update `lib/releases.ts`
- verify the new version is visible on staging
- update `plan.bossuyt.fixassistant.com/changenotes` only after staging matches
- ask the user whether to commit and push the finished version to GitHub

- [ ] **Step 3: Verify no duplicate version constants remain**

Run:
```bash
rg -n "APP_VERSION|version: 'v|CURRENT_VERSION|RELEASES" components app lib
```

Expected:
- one shared current-version source remains
- historical entries live in `lib/releases.ts`

- [ ] **Step 4: Run the final app verification for this slice**

Run:
```bash
npm run build
```

Expected:
- Next.js build succeeds
- visible app routes and shared release metadata compile together

### Task 6: Handoff To The Shared PostgreSQL Plan

**Files:**
- Reference: `docs/superpowers/plans/2026-04-10-plan-c-shared-postgres.md`
- Reference: `app/interventions/[id]/page.tsx`
- Reference: `lib/sync.ts`
- Create: `docs/releases/handoff-notes.md`

- [ ] **Step 1: Record the DB handoff in a concrete note**

Create `docs/releases/handoff-notes.md` with:
- this plan does not implement the PostgreSQL slice
- `docs/superpowers/plans/2026-04-10-plan-c-shared-postgres.md` remains the source for DB-backed migration work

- [ ] **Step 2: Record which visible route is transitional**

In the same handoff note, add:
- `/interventions/[id]` stays visible now
- it will later be reworked to consume the DB/sync-backed intervention payload

- [ ] **Step 3: End with a clean checkpoint**

Before moving into PostgreSQL work, verify:
- version source is centralized
- staging route visibility rules match the approved design
- architecture page is aligned with the current direction

- [ ] **Step 4: Ask for release completion approval**

Ask the user:
- whether this work is a new version or a refinement
- if treated as a finished version, whether they want it committed and pushed to GitHub

```bash
git add CLAUDE.md README.md lib/releases.ts components/VersionBadge.tsx app/changenotes/page.tsx app/architecture/page.tsx app/werkbon/nieuw/page.tsx docs/releases/plan-site-sync.md docs/releases/handoff-notes.md docs/superpowers/plans/2026-04-10-staging-route-release-discipline.md
git commit -m "chore: align staging routes and release metadata"
```

Expected:
- no commit happens until the user explicitly approves it
