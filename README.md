# Bossuyt Service Staging

Mobiele service-app voor Bossuyt-techniekers, gebouwd met Next.js 16, React 19, TypeScript, Drizzle ORM en PostgreSQL.

## Doel

Deze app ondersteunt techniekers in het veld:

- dagplanning en open interventies
- werkbonnen met onderdelen, foto's en handtekening
- offline caching via IndexedDB
- synchronisatie naar de API
- magazijn- en opvolgtaken

## Belangrijkste stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Drizzle ORM + PostgreSQL
- PWA/offline via IndexedDB en service worker

## Belangrijke documenten

- `ARCHITECTURE.md` — datamodel, flows en projectstructuur
- `PLANNING.md` — huidige fase, gekende issues en roadmap

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm test
```

## Staging en deployment

- Actieve omgeving: `staging.bossuyt.fixassistant.com`
- Actieve branch: `main`
- Deploytarget: staging only

Lokale Docker-start:

```bash
docker compose up --build
```

## Opmerking

Dit repository bevat nog overgangscode tussen oudere mock/local-state flows en nieuwere database/API-flows. Zie `PLANNING.md` voor de huidige technische schuld en prioriteiten.
