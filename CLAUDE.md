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

## Deployment
- Docker + nginx on Hetzner
- Target: bossuyt-service.fixassistant.com
- `docker compose up --build` to run locally on port 3080
