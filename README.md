# Bossuyt Service Next

Field service app for Bossuyt technicians, built with Next.js 16, React 19, TypeScript, PostgreSQL, and Docker.

## Read first

Before making changes, read:

- `ARCHITECTURE.md` for the data model, offline sync strategy, and deployment topology
- `PLANNING.md` for the current build phases and known issues
- `CLAUDE.md` for project-specific assistant instructions and workflow rules

## Local development

Run the app locally:

```bash
npm run dev
```

Useful validation commands:

```bash
npm run lint
npm run build
```

The local production-like Docker stack is:

```bash
docker compose up --build
```

That stack serves the app behind Traefik on the main hostname and should only be used when you intentionally want the production-shaped setup.

## Deployment structure

This repository has two Docker Compose entrypoints on the server:

| Target | Branch source | Compose file | Hostname | Purpose |
|---|---|---|---|---|
| Production | `production` | `docker-compose.yml` | `bossuyt-service.fixassistant.com` | Live app |
| Staging | `main` | `docker-compose.staging.yml` | `staging.bossuyt.fixassistant.com` | Safe pre-release testing |

### Important rule

Do **not** rebuild the production stack when the goal is only to update staging.

Use the correct compose file for the correct hostname:

```bash
# Staging
docker compose -f docker-compose.staging.yml up --build -d

# Production
docker compose up --build -d
```

If you are on the server, confirm the target hostname first and then rebuild only that stack.

For staging, use a checkout or worktree that points at `main`. Do not rebuild staging from a `production` checkout and assume it will contain the newest app changes.

## CLI instructions

When an AI CLI or coding assistant works in this repository, it should follow this order:

1. Read `ARCHITECTURE.md` and `PLANNING.md` before making assumptions.
2. Check whether the task is for local development, staging, or production.
3. Use a `main` checkout or worktree for staging builds.
4. Use `docker-compose.staging.yml` for `staging.bossuyt.fixassistant.com`.
5. Use `docker-compose.yml` only for `bossuyt-service.fixassistant.com`.
6. Run `npm run lint` and `npm run build` after code changes.

## Tech overview

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- PostgreSQL + Drizzle ORM
- NextAuth beta
- IndexedDB + offline-first sync flow
- Web Push notifications
