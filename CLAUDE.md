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

## CLI Workflow
- Start by reading `ARCHITECTURE.md` and `PLANNING.md`
- Confirm whether the task targets local dev, staging, or production
- Use a `main` checkout or worktree when rebuilding staging
- Use the `production` checkout only for the live stack
- Never assume `docker compose up --build` is safe for staging
- After code changes, run `npm run lint` and `npm run build`

## Project Rules
- UI language: Dutch (Belgium) — nl-BE
- Code, comments, variable names: English
- Mobile-first — design for phone in the field
- High contrast, large touch targets (used with dirty hands/gloves)
- Offline-first — every write goes to IndexedDB before API

## Deployment
- Docker + nginx on Hetzner
- Production hostname: `bossuyt-service.fixassistant.com`
- Staging hostname: `staging.bossuyt.fixassistant.com`
- Production branch source: `production`
- Staging branch source: `main`
- Production stack file: `docker-compose.yml`
- Staging stack file: `docker-compose.staging.yml`
- Production deploy: `docker compose up --build -d`
- Staging deploy: `docker compose -f docker-compose.staging.yml up --build -d`
- For staging, rebuild from a `main` checkout or worktree instead of the live checkout
- Always match the compose file to the hostname before rebuilding containers
- `docker compose up --build` can affect the production-shaped stack, so do not use it for staging by accident

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
