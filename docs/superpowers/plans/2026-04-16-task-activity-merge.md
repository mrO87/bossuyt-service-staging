# Task And Activity Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the task/activity subsystem that exists in `/mnt/data/bossuyt_service_next_staging_main` into the active checkout, while preserving the newer work-order photo work already present in this checkout.

**Architecture:** Reintroduce the missing task domain as a client-side provider-backed subsystem first, then reconnect the three UI entry points that depend on it: avatar/settings access, the dedicated `/activiteiten` route, and werkbon-linked activity editing. Treat the older checkout as the source of truth for task/activity behavior, but merge selectively into the current checkout so recent work-order and staging fixes remain intact.

**Tech Stack:** Next.js App Router, React 19, TypeScript, localStorage-backed context provider, existing mock-data layer, Docker compose staging deploy.

---

### Task 1: Restore The Task Domain Foundation

**Files:**
- Create: `components/AppProviders.tsx`
- Create: `lib/task-meta.ts`
- Create: `lib/task-store.tsx`
- Modify: `app/layout.tsx`
- Modify: `types/index.ts`
- Modify: `lib/mock-data.ts`

- [ ] **Step 1: Compare the old and current task foundation files**

Run:
```bash
diff -u /mnt/data/bossuyt_service_next_staging/types/index.ts /mnt/data/bossuyt_service_next_staging_main/types/index.ts
diff -u /mnt/data/bossuyt_service_next_staging_main/lib/task-meta.ts /dev/null
diff -u /mnt/data/bossuyt_service_next_staging_main/lib/task-store.tsx /dev/null
diff -u /mnt/data/bossuyt_service_next_staging/app/layout.tsx /mnt/data/bossuyt_service_next_staging_main/app/layout.tsx
```
Expected: current checkout is missing task types, task helper files, provider wiring, and mock-data users/tasks additions.

- [ ] **Step 2: Add the missing task types to `types/index.ts`**

Add:
- `User['role']` values `hr` and `warehouse`
- `TaskPriority`, `TaskStatus`, `TaskType`, `TaskAssignmentType`
- `Task` interface with assignment, linkage, due date, timestamps

- [ ] **Step 3: Merge task seed data and extra users into `lib/mock-data.ts`**

Bring over:
- `tasks` seed list
- `warehouse` and `hr` demo users
- any helper exports used by task routing (`getUserById`, `getCurrentUser`) if the current file diverged

- [ ] **Step 4: Add task helper modules**

Create `lib/task-meta.ts` with:
- task option lists
- label helpers
- `isTaskOpen`
- `isTaskAssignedToUser`
- `canManageTask`

Create `lib/task-store.tsx` with:
- `TaskProvider`
- localStorage persistence under `bossuyt-service:tasks`
- `createTask`, `updateTaskStatus`, `updateTask`, `getOpenTaskCountForUser`

- [ ] **Step 5: Add provider wiring**

Create `components/AppProviders.tsx` that wraps children with `TaskProvider`.

Update `app/layout.tsx` to wrap `{children}` with `<AppProviders>`.

- [ ] **Step 6: Verify the foundation compiles**

Run:
```bash
npx -y eslint app/layout.tsx components/AppProviders.tsx lib/task-meta.ts lib/task-store.tsx types/index.ts lib/mock-data.ts
```
Expected: PASS


### Task 2: Restore Task Navigation Entry Points

**Files:**
- Create: `components/AvatarMenu.tsx`
- Modify: `components/DayView/DayView.tsx`
- Modify: `components/SettingsSheet/index.tsx`

- [ ] **Step 1: Diff the old navigation entry points**

Run:
```bash
diff -u /mnt/data/bossuyt_service_next_staging/components/DayView/DayView.tsx /mnt/data/bossuyt_service_next_staging_main/components/DayView/DayView.tsx
diff -u /mnt/data/bossuyt_service_next_staging/components/SettingsSheet/index.tsx /mnt/data/bossuyt_service_next_staging_main/components/SettingsSheet/index.tsx
sed -n '1,260p' /mnt/data/bossuyt_service_next_staging_main/components/AvatarMenu.tsx
```
Expected: current checkout lacks avatar-menu task count access and open-activity quick links.

- [ ] **Step 2: Add `components/AvatarMenu.tsx`**

Bring over:
- current-user avatar button
- open-task badge
- dropdown panel with top 3 open activities
- links to `/activiteiten` or a deep-linked werkbon

- [ ] **Step 3: Merge DayView wiring without regressing current routing/settings behavior**

Update `components/DayView/DayView.tsx` to:
- use `useTasks()`
- show avatar initials + task count
- use `currentUser.id` when loading day data
- pass current `settings` into `DayTimeline` if that prop still exists in this checkout

- [ ] **Step 4: Merge the settings-sheet activity list**

Update `components/SettingsSheet/index.tsx` to:
- show open activity count
- expand/collapse open activity list
- route into `/interventions/[id]?activity=...#activiteiten` or `/activiteiten`

- [ ] **Step 5: Verify navigation entry points**

Run:
```bash
npx -y eslint components/AvatarMenu.tsx components/DayView/DayView.tsx components/SettingsSheet/index.tsx
```
Expected: PASS


### Task 3: Restore Activity Routes And Werkbon Integration

**Files:**
- Create: `app/activiteiten/page.tsx`
- Create: `app/taken/page.tsx`
- Modify: `app/interventions/[id]/page.tsx`
- Modify: `components/WerkbonForm/index.tsx`

- [ ] **Step 1: Add the dedicated activity routes**

Create:
- `app/activiteiten/page.tsx` from the older checkout
- `app/taken/page.tsx` redirecting to `/activiteiten`

Ensure imports still match the current codebase.

- [ ] **Step 2: Reconnect intervention deep-link behavior**

Update `app/interventions/[id]/page.tsx` to:
- read `activity` from search params
- include `AvatarMenu` in the header
- scroll to `#activiteiten` when present
- pass `initialActivityId` into `WerkbonForm`

- [ ] **Step 3: Merge the activity editor back into `components/WerkbonForm/index.tsx`**

Merge selectively from the older checkout:
- task imports and editor state helpers
- linked task derivation for `werkbonId`
- create/edit/done/cancel handlers
- `ACTIVITEITEN` section and deep-link target `id="activiteiten"`

Keep from the current checkout:
- work-order photo upload changes
- current PDF save flow
- any current server/integration fixes unrelated to activities

- [ ] **Step 4: Resolve the known merge conflict carefully**

Specific risk:
- older `WerkbonForm` version also reverts the smaller photo UI
- current `WerkbonForm` contains the latest photo work

Required result:
- task/activity subsystem restored
- current photo upload UI and behavior preserved

- [ ] **Step 5: Verify werkbon and route integration**

Run:
```bash
npx -y eslint app/activiteiten/page.tsx app/taken/page.tsx app/interventions/[id]/page.tsx components/WerkbonForm/index.tsx
npm run build
```
Expected: both PASS


### Task 4: Redeploy And Verify Staging

**Files:**
- Modify: none expected unless verification finds a merge issue

- [ ] **Step 1: Rebuild the staging stack with the existing host env values**

Run the same deployment pattern already used successfully in this session:
```bash
NEXTAUTH_SECRET='…' NEXTAUTH_URL='https://staging.bossuyt.fixassistant.com' NEXT_PUBLIC_VAPID_PUBLIC_KEY='…' VAPID_PRIVATE_KEY='…' ORS_API_KEY='…' POSTGRES_PASSWORD='…' docker compose -f docker-compose.staging.yml up --build -d
```

- [ ] **Step 2: Verify containers are up**

Run:
```bash
docker ps --filter name=bossuyt-staging --filter name=bossuyt-db-staging
docker logs --tail 20 bossuyt-staging
```
Expected:
- both containers `Up`
- app log includes `Ready`

- [ ] **Step 3: Smoke-check the restored paths**

Manual checks on staging:
- avatar button shows open activity badge
- settings sheet lists open activities
- `/activiteiten` renders
- activity link opens the correct werkbon and scrolls to `ACTIVITEITEN`
- current photo upload UI still looks like the tightened werkbon version

