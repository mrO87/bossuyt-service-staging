# Bossuyt Service — Project Conventions

## Read First
Before working on this project, read:
- `ARCHITECTURE.md` — data model, sync strategy, project structure
- `PLANNING.md` — feature list and build phases

## Tech Stack
- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4
- Drizzle ORM + PostgreSQL
- NextAuth (beta) for authentication
- next-pwa for service worker / offline
- idb for IndexedDB
- web-push for push notifications

## Commands
- `npm run dev` — development server (Turbopack)
- `npm run build` — production build
- `npm run lint` — eslint

## Project Rules
- UI language: Dutch (Belgium) — nl-BE
- Code, comments, variable names: English
- Mobile-first — design for phone in the field
- High contrast, large touch targets (used with dirty hands/gloves)
- Offline-first — every write goes to IndexedDB before API

## Branch Strategy — CRITICAL
- `main` — active development. All new features go here. Never deployed to production without explicit user approval.
- `production` — what Bossuyt sees at `bossuyt-service.fixassistant.com`. Only updated when the user explicitly says "deploy to production" or "push to production".
- **Never** suggest running `docker compose up --build` on the production server from `main`. Always ask which branch first.
- To promote a version to production: `git checkout production && git merge <commit> && git push origin production`, then rebuild on the server.

## Release Workflow
- For visible changes on `staging.bossuyt.fixassistant.com`, first ask whether the work is a new version or a refinement of the current version.
- `/architecture`-only edits and hidden-route edits do not require a version question by themselves.
- Do not bump versions on your own; version changes must be user-directed.
- If the user confirms the work is a new version, update version metadata only as part of that version.
- When that version is finished, ask whether to commit and push it to GitHub.

## Deployment
- Docker + nginx on Hetzner
- Production (`bossuyt-service.fixassistant.com`): deploys from `production` branch only
- Staging (`staging.bossuyt.fixassistant.com`): deploys from `main`
- `docker compose up --build` to run locally on port 3080

## Teaching Mode — ALWAYS ACTIVE
This project is a learning exercise. The user is learning to code.
Treat every session like a live classroom or Udemy course:

- **Before writing a function**, briefly explain what it's going to do and why we need it.
- **After writing a function**, explain every part of it — what each line does, why we wrote it that way, and what would happen if we did it differently.
- **If the next function is similar** to one we just wrote, say "this one is almost the same as X, the only difference is..." — don't repeat the full explanation from scratch.
- **Explain concepts** (React hooks, TypeScript types, async/await, etc.) the moment they appear — don't assume the user knows them.
- **Use simple language** — no jargon without explanation.
- **Be encouraging** — this is a safe learning environment.
- Never just silently write code and move on. Every piece of code we write together gets explained.
