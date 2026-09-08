# Plan: Unified Keycloak Portal voor Fixassistant

**Geschreven:** 26 april 2026  
**Status:** In planning  
**Scope:** Keycloak, portal app, vanventory-app, bossuyt-service

---

## Wat willen we bouwen?

```
┌─────────────────────────────────────────────────────────┐
│          auth.fixassistant.com  (Keycloak 26)           │
│          ──────────────────────────────────             │
│          Één login voor alle apps                        │
└────────────────────┬────────────────────────────────────┘
                     │ SSO (1x inloggen = overal toegang)
          ┌──────────┴──────────┐
          ▼                     ▼
┌─────────────────┐   ┌─────────────────────────────────┐
│  portal.fixass… │   │  Elke app authenticeert via      │
│                 │   │  hetzelfde Keycloak token         │
│  App-launcher   │   │                                  │
│  ┌───┐  ┌───┐  │   │  vanventory.fixassistant.com     │
│  │ S │  │ V │  │   │  staging.bossuyt.fixassistant.com│
│  └───┘  └───┘  │   │  (toekomstige apps...)           │
└─────────────────┘   └─────────────────────────────────┘
```

**Eén Keycloak login → je ziet het portaal → je klikt een app aan → geen tweede login nodig.**  
Dat is SSO (Single Sign-On).

---

## Technische basis: hoe werkt SSO?

**Keycloak** is een "Identity Provider" — hij beheert wie jij bent. Elke app vertrouwt hem blindelings. Technisch werkt het zo:

1. Jij gaat naar `portal.fixassistant.com`
2. Portal zegt: "ik ken je niet" → stuurt je naar `auth.fixassistant.com`
3. Je logt in bij Keycloak → Keycloak zet een **session cookie** op `auth.fixassistant.com`
4. Keycloak geeft een **JWT access token** terug aan de portal
5. Je klikt op "Vanventory" → vanventory-app start en vraagt aan Keycloak: "ken je deze browser?"
6. Keycloak ziet zijn eigen cookie → **ja, dit is Olivier** → geeft token terug **zonder login scherm**
7. Idem voor de service app

De sleutel: **de Keycloak session cookie** overbrugt alle apps. Zolang die cookie geldig is, worden apps automatisch ingelogd.

---

## Realm strategie — cruciaal besluit

Op dit moment heeft Keycloak een `vanventory` realm. Een **realm** is een volledig afgeschermde omgeving (eigen users, clients, thema).

**Probleem met de huidige aanpak:** de vanventory realm houdt de service app buiten. SSO werkt alleen *binnen* één realm.

**Aanbeveling: maak één gedeelde realm `fixassistant`**

```
Keycloak 26
├── realm: fixassistant          ← nieuw, gedeeld
│   ├── client: portal           ← app-launcher
│   ├── client: vanventory-app   ← inventory app
│   ├── client: bossuyt-service  ← service app
│   ├── users: Olivier, Tom, ...
│   └── roles: admin, technician, warehouse, office, planner, inventory_user
│
└── realm: vanventory            ← oud, bewaren tijdens migratie
```

Zo werkt SSO tussen alle apps. De vanventory realm kan later worden verwijderd na migratie.

---

## Fase 1: Keycloak — nieuwe realm instellen

### Wat te doen in de Keycloak admin console (`https://auth.fixassistant.com/admin`)

**1.1 Nieuwe realm aanmaken**
- Realm name: `fixassistant`
- Display name: `Fixassistant`
- Login thema: `fixassistant` (nieuw thema, zie fase 5)
- Supported locales: `nl`, `en` — default: `nl`

**1.2 Drie clients aanmaken**

| Client ID | Type | Redirect URIs | Gebruik |
|---|---|---|---|
| `portal` | Public + PKCE | `https://portal.fixassistant.com/*`, `http://localhost:5174/*` | App-launcher |
| `vanventory-app` | Public + PKCE | `https://vanventory.fixassistant.com/*`, `http://localhost:5173/*` | Inventory |
| `bossuyt-service` | **Confidential** | `https://staging.bossuyt.fixassistant.com/*`, `http://localhost:3000/*` | Service app |

> **Waarom is bossuyt-service "confidential"?** De service app is een Next.js server-side app — de server kan een geheim bewaren. Vanventory is een pure client-side SPA, die kan geen geheim bewaren (iedereen kan de code inzien). Voor een server-side app is een client secret veiliger.

**1.3 Rollen aanmaken op realm-niveau**
```
fixassistant realm roles:
├── admin           → toegang tot alles
├── technician      → service app (veld)
├── office          → service app (kantoor)
├── warehouse       → service app (magazijn)
├── planner         → service app (planning)
└── inventory_user  → vanventory app
```

**1.4 Gebruikers aanmaken en rollen toewijzen**
- Olivier → `admin`
- Tom → `technician`
- Magazijn medewerker → `warehouse`

**1.5 Realm exporteren als JSON bewaren**

Na configuratie: Realm Settings → Export → sla op als:
```
/mnt/data/keycloak/fixassistant-realm.json
```
Zo kan de realm automatisch hersteld worden bij een herstart (mount als import volume).

---

## Fase 2: Portal app bouwen

### Wat is het portaal precies?

Een **kleine, snelle app** die:
1. Controleert of je ingelogd bent bij Keycloak (silent SSO check)
2. Zo niet → stuurt je naar de Keycloak login pagina
3. Zo ja → toont de apps waartoe je toegang hebt (op basis van je rollen)
4. Je klikt een app aan → die opent met SSO (geen tweede login)

### Tech stack

**React + Vite** — zelfde als vanventory-app. Het portaal heeft geen server-side rendering nodig. Licht en snel.

### Projectstructuur

```
/mnt/data/portal/
├── src/
│   ├── auth/
│   │   ├── keycloak.ts          ← Keycloak instance config
│   │   └── AuthProvider.tsx     ← Wacht tot auth klaar is, render dan app
│   ├── components/
│   │   └── AppTile.tsx          ← Klikbare app-kaart
│   ├── App.tsx                  ← Grid van AppTiles
│   └── main.tsx
├── public/
│   └── silent-check-sso.html   ← Vereist voor silent SSO check via iframe
├── .env.example
├── Dockerfile
└── docker-compose.yml
```

### Kerncomponenten

**`src/auth/keycloak.ts`**
```typescript
import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
})

export default keycloak
```

**`src/components/AppTile.tsx`**
```tsx
interface AppTileProps {
  name: string
  description: string
  url: string
  icon: string
  requiredRole?: string
  userRoles: string[]
}

function AppTile({ name, description, url, icon, requiredRole, userRoles }: AppTileProps) {
  const hasAccess = !requiredRole || userRoles.includes(requiredRole)
  if (!hasAccess) return null

  return (
    <a href={url} className="...">
      <span>{icon}</span>
      <h2>{name}</h2>
      <p>{description}</p>
    </a>
  )
}
```

**App-definitie in `App.tsx`**
```typescript
const APPS = [
  {
    name: 'Service',
    description: 'Werkbonnen, planning, interventies',
    url: 'https://staging.bossuyt.fixassistant.com',
    icon: '🔧',
    requiredRole: 'technician',
  },
  {
    name: 'Vanventory',
    description: 'Magazijn en voorraad',
    url: 'https://vanventory.fixassistant.com',
    icon: '📦',
    requiredRole: 'inventory_user',
  },
]
```

**`public/silent-check-sso.html`**
```html
<!DOCTYPE html>
<html>
  <body>
    <script>parent.postMessage(location.href, location.origin)</script>
  </body>
</html>
```
> Dit bestand is vereist: Keycloak gebruikt een verborgen `<iframe>` om stil te controleren of je al ingelogd bent. Zonder dit bestand werkt silent SSO niet.

### Docker voor het portaal

```yaml
# /mnt/data/portal/docker-compose.yml
services:
  portal:
    build: .
    networks:
      - traefik
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik"
      - "traefik.http.routers.portal.rule=Host(`portal.fixassistant.com`)"
      - "traefik.http.routers.portal.entrypoints=websecure"
      - "traefik.http.routers.portal.tls.certresolver=lets-encrypt"
      - "traefik.http.services.portal.loadbalancer.server.port=80"

networks:
  traefik:
    external: true
```

### Omgevingsvariabelen

```env
# .env.example
VITE_KEYCLOAK_URL=https://auth.fixassistant.com
VITE_KEYCLOAK_REALM=fixassistant
VITE_KEYCLOAK_CLIENT_ID=portal
```

---

## Fase 3: Vanventory — Keycloak integratie

De spec staat al klaar in `/mnt/data/vanventory-app/docs/superpowers/specs/2026-03-20-keycloak-login-design.md`.  
We volgen die, maar passen de realm aan van `vanventory` naar `fixassistant`.

### Stap 3.1 — installeer keycloak-js

```bash
cd /mnt/data/vanventory-app
npm install keycloak-js
```

### Stap 3.2 — maak `src/auth/keycloak.ts`

```typescript
import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,   // fixassistant
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID, // vanventory-app
})

export default keycloak
```

### Stap 3.3 — maak `src/auth/AuthProvider.tsx`

Initialiseert Keycloak met `check-sso` mode:
- Stil controleren of er al een sessie is
- Als er geen sessie is → redirect naar Keycloak login
- App rendert pas nadat auth opgelost is

### Stap 3.4 — voeg `public/silent-check-sso.html` toe

Zelfde bestand als bij de portal (zie fase 2).

### Stap 3.5 — AuthGuard in AppRouter

```tsx
// src/AppRouter.tsx
function AppRouter() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <LoadingScreen />
  return <RouterProvider router={router} />
}
```

### Stap 3.6 — update `.env`

```env
VITE_KEYCLOAK_URL=https://auth.fixassistant.com
VITE_KEYCLOAK_REALM=fixassistant
VITE_KEYCLOAK_CLIENT_ID=vanventory-app
```

---

## Fase 4: Service app (bossuyt) — Keycloak via NextAuth 5

De service app gebruikt Next.js — hier kiezen we voor **NextAuth 5 + Keycloak als OIDC provider**.

### Stap 4.1 — maak de auth route

**Nieuw bestand:** `app/api/auth/[...nextauth]/route.ts`

```typescript
import NextAuth from 'next-auth'
import type { NextAuthConfig } from 'next-auth'

const config: NextAuthConfig = {
  providers: [
    {
      id: 'keycloak',
      name: 'Keycloak',
      type: 'oidc',
      issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
      clientId: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    }
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        token.roles = (profile as any).realm_access?.roles ?? []
        token.keycloakId = profile.sub
      }
      return token
    },
    async session({ session, token }) {
      session.user.roles = token.roles as string[]
      session.user.keycloakId = token.keycloakId as string
      return session
    }
  }
}

const { handlers } = NextAuth(config)
export const { GET, POST } = handlers
```

### Stap 4.2 — middleware voor routebeveiliging

**Nieuw bestand:** `middleware.ts` (root van het project)

```typescript
import { auth } from './auth'

export default auth((req) => {
  if (!req.auth) {
    return Response.redirect(new URL('/api/auth/signin', req.url))
  }
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
```

### Stap 4.3 — SessionProvider in AppProviders

```tsx
// components/AppProviders.tsx
import { SessionProvider } from 'next-auth/react'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TaskProvider>
        {children}
      </TaskProvider>
    </SessionProvider>
  )
}
```

### Stap 4.4 — omgevingsvariabelen

```env
KEYCLOAK_URL=https://auth.fixassistant.com
KEYCLOAK_REALM=fixassistant
KEYCLOAK_CLIENT_ID=bossuyt-service
KEYCLOAK_CLIENT_SECRET=<gegenereerd in Keycloak admin>
NEXTAUTH_URL=https://staging.bossuyt.fixassistant.com
NEXTAUTH_SECRET=<random string, min 32 chars>
```

### Stap 4.5 — gebruiker ophalen in componenten

```typescript
// Server component:
import { auth } from '@/auth'
const session = await auth()
const user = session?.user  // { name, email, roles, keycloakId }

// Client component:
import { useSession } from 'next-auth/react'
const { data: session } = useSession()
```

---

## Fase 5: Keycloak login thema uitbreiden

Op dit moment is er alleen een `vanventory` thema. We maken een `fixassistant` thema dat voor alle apps werkt.

```
/mnt/data/keycloak/themes/
├── vanventory/       ← bestaand, bewaren
└── fixassistant/     ← nieuw, gedeeld thema
    └── login/
        ├── login.ftl
        ├── theme.properties
        ├── messages/
        │   ├── messages_nl.properties
        │   └── messages_en.properties
        └── resources/
            └── css/
                └── login.css
```

Het bestaande `vanventory` thema (dark, oranje accenten) is een goede basis — CSS hergebruiken, logo en teksten aanpassen naar Fixassistant branding.

Update in `docker-compose.yml`:
```yaml
volumes:
  - ./themes/vanventory:/opt/keycloak/themes/vanventory:ro
  - ./themes/fixassistant:/opt/keycloak/themes/fixassistant:ro  # ← toevoegen
```

---

## Belangrijke aandachtspunten

### Uitloggen moet globaal zijn (backchannel logout)

Als je uitlogt uit één app, moet je ook uitgelogd zijn bij alle andere apps. Keycloak ondersteunt "backchannel logout" — hij stuurt een logout-signaal naar elke geregistreerde app. NextAuth 5 heeft hiervoor configuratie nodig.

### Token verversing

JWT access tokens verlopen (standaard na 5 minuten in Keycloak). Elke app moet automatisch een nieuw token ophalen:
- `keycloak-js` doet dit via `updateToken(30)` (ververs als minder dan 30 sec geldig)
- NextAuth beheert dit via refresh tokens in de JWT callback

### Lokale ontwikkeling

Voeg `localhost` redirect URIs toe aan elke Keycloak client:
- `http://localhost:5173/*` voor vanventory
- `http://localhost:3000/*` voor de service app
- `http://localhost:5174/*` voor het portaal

---

## Implementatievolgorde

| # | Stap | Geschatte tijd | Resultaat |
|---|---|---|---|
| 1 | Keycloak: `fixassistant` realm + clients aanmaken | 2 uur | Auth-infrastructuur klaar |
| 2 | Portaal app bouwen (React + Vite + keycloak-js) | 1 dag | `portal.fixassistant.com` online |
| 3 | Vanventory: keycloak-js integreren | 1 dag | Vanventory beveiligd |
| 4 | Service app: NextAuth 5 + Keycloak | 1.5 dag | Bossuyt service beveiligd |
| 5 | Fixassistant Keycloak thema bouwen | 4 uur | Branded login pagina |
| 6 | Gebruikers aanmaken + rollen toewijzen | 1 uur | Iedereen kan inloggen |
| 7 | Testen: SSO flow, uitloggen, rol-beveiliging | 2 uur | Productie-klaar |

**Totaal: ±5-6 werkdagen**

---

## Betrokken mappen & bestanden

| Locatie | Wat |
|---|---|
| `/mnt/data/keycloak/docker-compose.yml` | Keycloak container config — thema volumes toevoegen |
| `/mnt/data/keycloak/themes/fixassistant/` | Nieuw gedeeld login thema |
| `/mnt/data/keycloak/fixassistant-realm.json` | Realm export (backup + auto-import) |
| `/mnt/data/portal/` | Nieuwe portal app (nog aan te maken) |
| `/mnt/data/vanventory-app/src/auth/` | keycloak-js integratie (nog aan te maken) |
| `/mnt/data/bossuyt_service_next_staging/app/api/auth/` | NextAuth 5 route (nog aan te maken) |
| `/mnt/data/bossuyt_service_next_staging/middleware.ts` | Route-beveiliging (nog aan te maken) |
