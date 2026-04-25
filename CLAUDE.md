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
- `main` — de ENIGE actieve branch. Alle nieuwe features gaan hier naartoe.
- **NOOIT** de `production` branch aanraken. **NOOIT** iets deployen naar `bossuyt-service.fixassistant.com` of `service.bossuyt.fixassistant.com` — dat zijn oude demo's, afblijven.
- De enige deployment target is `staging.bossuyt.fixassistant.com`.

## Release Workflow
- Voor zichtbare wijzigingen op `staging.bossuyt.fixassistant.com`, eerst vragen of het een nieuwe versie of een verfijning van de huidige versie is.
- `/architecture`-only edits en hidden-route edits vereisen geen versiervraag.
- Versies nooit zelf verhogen; versiewijzigingen zijn door de gebruiker gestuurd.
- Als de gebruiker bevestigt dat het een nieuwe versie is, update dan alleen de versiemetadata als onderdeel van die versie.
- Als die versie klaar is, vragen of het gecommit en gepusht moet worden naar GitHub.

## Deployment
- Docker + nginx op Hetzner
- Enige actieve site: `staging.bossuyt.fixassistant.com` — deployt vanuit `main`
- `docker compose up --build` om lokaal te draaien op poort 3000

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
