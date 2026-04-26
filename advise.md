# Project Analyse & Advies — Bossuyt Service Next

Dit document bevat een gedetailleerde analyse van de huidige implementatie van het Bossuyt Service Next project, uitgevoerd op vrijdag 24 april 2026.

## 1. Architectuur & Tech Stack
De gekozen stack is modern en zeer geschikt voor een performante, offline-first applicatie:
- **Frontend**: Next.js 16, React 19, Tailwind 4.
- **Offline-First**: Gebruik van Service Workers (`sw.js`) en IndexedDB (`idb.ts`) zorgt voor een uitstekende gebruikerservaring in gebieden met slechte verbinding.
- **Data**: Drizzle ORM biedt sterke type-safety en een heldere mapping naar de PostgreSQL database.

## 2. Sterke Punten (Best Practices)
- **Synchronisatie-logica**: De "Morning Sync" in `lib/sync.ts` is slim opgezet. Het beperkt de hoeveelheid data die over de lijn gaat en zorgt dat de technieker 's ochtends meteen alle benodigde info (interventies, route, handleidingen) lokaal heeft.
- **Conflictbeheer**: Het gebruik van `planningVersion` in de planning-volgorde voorkomt dat wijzigingen van verschillende bronnen (planner vs technieker) elkaar onbedoeld overschrijven.
- **Testen**: Er is een sterke focus op automatische testen (`vitest`), wat essentieel is voor een systeem waar business logica (zoals taak-transities) complex is.
- **PDF Generatie**: De handmatige opbouw van werkbonnen via `jsPDF` zorgt voor een professioneel en consistent resultaat, onafhankelijk van de browser-print-instellingen.

## 3. Aandachtspunten & Aanbevelingen

### Component Opsplitsing (Refactoring)
De component `components/WerkbonForm/index.tsx` is momenteel erg groot (> 1.500 regels). 
- **Advies**: Splits deze op in kleinere, herbruikbare componenten zoals:
    - `PartsSection.tsx`
    - `PhotoUploadSection.tsx`
    - `TaskManager.tsx`
    - `SignatureSection.tsx`

### Database Transacties
In `lib/server/interventions.ts` worden meerdere updates parallel uitgevoerd zonder transactie.
- **Advies**: Gebruik `db.transaction` van Drizzle om te garanderen dat als één update faalt, de hele operatie wordt teruggedraaid. Dit voorkomt inconsistente data in de database.

### Gebruik van JSONB
In het schema worden velden zoals `parts` en `follow_up` opgeslagen als `text` (waarschijnlijk JSON strings).
- **Advies**: Wijzig deze velden naar `jsonb` in PostgreSQL. Dit maakt het mogelijk om direct vanuit de database te zoeken en filteren op specifieke data binnen deze velden (bijv. alle werkbonnen zoeken waar een specifiek onderdeel is gebruikt).

### Error Handling in Sync
De huidige sync-logica stopt bij de eerste fout (`break` in de loop).
- **Advies**: Voor sommige acties (zoals foto-uploads) zou het beter zijn om door te gaan met de rest van de wachtrij en alleen de gefaalde actie te markeren, mits de volgorde niet kritiek is.

## 4. Conclusie
De basis van dit project is zeer solide. De offline-capaciteiten en de moderne stack maken het een toekomstbestendige applicatie. Door de bovenstaande optimalisaties door te voeren, zal de code gemakkelijker te onderhouden zijn naarmate het project verder groeit.

## 5. Kritische Review (Post-Migratie JSONB)

Na de implementatie van de JSONB-migratie en de component-refactoring op zaterdag 25 april, zijn de volgende risico's en verificatiepunten geïdentificeerd:

### 🚩 Risico Lijst

1. **[CRITIEK] Ongecontroleerde `JSON.parse` Uitzonderingen:**
   - **Locatie:** `app/api/work-orders/[id]/complete/route.ts`
   - **Risico:** `JSON.parse` wordt direct uitgevoerd op FormData waarden zonder `try-catch`. Als de client ongeldige JSON stuurt (bijv. een lege string), crasht het volledige API-endpoint met een 500 error.
   - **Impact:** Techniekers kunnen mogelijk geen werkbonnen opslaan als de offline-sync wachtrij corrupt is geraakt.

2. **[HOOG] Verminderde Type Safety in Drizzle Schema:**
   - **Locatie:** `lib/db/schema.ts`
   - **Risico:** De nieuwe `jsonb` kolommen missen `$type<...>()` overrides. Drizzle behandelt deze nu als `unknown` of `any`.
   - **Impact:** Verhoogd risico op runtime errors bij het benaderen van geneste properties zonder expliciete casting.

3. **[MEDIUM] `inArray` Lege Array Risico:**
   - **Locatie:** `lib/server/interventions.ts`
   - **Risico:** Als `orderedWorkOrderIds` een lege array is, kan `inArray` afhankelijk van de Drizzle-versie ongeldige SQL genereren.

4. **[MEDIUM] Incomplete Component Types:**
   - **Locatie:** `components/DevicePanel/index.tsx`
   - **Risico:** De `HistoryEntry` interface in dit bestand is handmatig bijgewerkt maar mist nog velden zoals `id`, `toOrder` en `urgent` die wel in `PdfPart` zitten.

### 🛠️ Verificatie Commando's & Testen

Voer de volgende stappen uit om de stabiliteit te garanderen:

**1. Type Integrity Check**
Controleer of de schema-wijzigingen geen verborgen type-fouten in de server-logica hebben veroorzaakt:
```bash
npx tsc --noEmit
```

**2. Database Migration Preview**
Genereer een preview van de SQL die Drizzle naar Postgres wil sturen. Controleer specifiek op de `USING column::jsonb` casts:
```bash
npx drizzle-kit generate
```

**3. Automated Schema & API Validation**
Voer de bestaande testen uit:
```bash
npx vitest tests/schema.test.ts tests/api.tasks.test.ts
```

**4. Handmatige "Crash Test" voor JSON Parsing**
Gebruik `curl` om te verifiëren of de API veilig omgaat met malformed data:
```bash
curl -X POST http://localhost:3000/api/work-orders/test-id/complete \
  -F "changedBy=test" \
  -F "completionParts=GEEN_JSON"
```

---

## 6. Volledige Codebase Review — 26 april 2026

Algehele kwaliteit: **7.5/10** — Solide basis met geavanceerde offline-sync, maar een aantal scherpe pijnpunten die aandacht verdienen voor de app naar echte gebruikers gaat.

### 🔴 Kritiek (kan data verloren laten gaan)

**1. Stille JSON parse fout bij werkbon-afwerking**
- **Locatie:** `app/api/work-orders/[id]/complete/route.ts` regels 22–23
- **Probleem:** `JSON.parse` fouten worden opgevangen maar de data wordt dan als `null` opgeslagen zonder de technieker te waarschuwen. De technieker denkt dat zijn onderdelenlijst opgeslagen is — dat is hij niet.
- **Fix:** Geef een `400` fout terug in plaats van stilzwijgend te falen:
  ```typescript
  if (partsRaw) {
    try { parts = JSON.parse(partsRaw) }
    catch { return NextResponse.json({ error: 'Ongeldige onderdelenlijst' }, { status: 400 }) }
  }
  ```

**2. Geen detectie van circulaire task-afhankelijkheden**
- **Locatie:** `lib/tasks/dependencies.ts`
- **Probleem:** Als taak A afhankelijk is van B en B van A, loopt `isTaskReady()` in een oneindige lus. Eén verkeerde klik van een gebruiker kan de server blokkeren.
- **Fix:** Voeg een DFS cycle-detectie toe in de POST `/api/tasks` route vóór een nieuwe dependency wordt opgeslagen.

---

### 🟠 Hoog (verbergen problemen in productie)

**3. Geen gestructureerde logging**
- **Locatie:** alle `/app/api/` routes (~23 `console.error()` calls)
- **Probleem:** In Docker gaat alles naar stderr zonder request ID, user context of correlatie. Productiefouten zijn niet traceerbaar.
- **Fix:** Installeer `pino`, maak `lib/logging.ts`, vervang alle `console.error` door `logger.error({ route, userId }, 'omschrijving')`.

**4. IndexedDB opslaglimiet wordt niet bewaakt**
- **Locatie:** `lib/idb.ts`
- **Probleem:** Foto's worden als blobs gecached zonder te controleren of de browser-quota vol raakt. Als die vol is, stopt het cachen stil — geen waarschuwing voor de technieker.
- **Fix:** Voeg `navigator.storage.estimate()` check toe in `lib/sync.ts`, waarschuw bij >80% gebruik.

**5. Geen input validatie bibliotheek**
- **Locatie:** alle API routes
- **Probleem:** Elke route valideert handmatig op een andere manier. Inconsistent en foutgevoelig.
- **Fix:** Voeg `zod` toe. Maak schema's per route — TypeScript types komen er gratis bij.

---

### 🟡 Medium (code kwaliteit & UX)

**6. `AssigneeSelect` aangemaakt binnen component — verliest focus**
- **Locatie:** `components/WerkbonForm/TaskManager.tsx` regel 405
- **Probleem:** De `AssigneeSelect` functie staat *binnen* `TaskManager`. React ziet bij elke render een nieuw component type en mount de dropdown volledig opnieuw — inclusief verlies van toetsenbord-focus.
- **Fix:** Verplaats `AssigneeSelect` naar buiten de `TaskManager` functie (één niveau hoger in het bestand).

**7. Task-aanmaak niet atomisch bij fout in successors**
- **Locatie:** `app/api/tasks/[id]/transition/route.ts` regels 142–154
- **Probleem:** Als het aanmaken van opvolger-taken halverwege mislukt, zijn de eerste al aangemaakt. Geen rollback.
- **Fix:** Wikkel de hele flow in een `withAudit` transactie.

**8. Geen error boundaries in React**
- **Locatie:** `components/DayTimeline/`, `components/WerkbonForm/`
- **Probleem:** Een JavaScript-fout in een sub-component gooit de hele pagina plat — witte scherm, geen uitleg.
- **Fix:** Maak een `ErrorBoundary` component en wikkel de grote componenten erin.

**9. Sync foutmeldingen te generiek**
- **Locatie:** `lib/sync.ts`
- **Probleem:** Netwerk time-out, server down, en IndexedDB vol — allemaal dezelfde `'Onbekende fout'`. De technieker weet niet wat hij moet doen.
- **Fix:** Categoriseer fouten: `NetworkError`, `ServerError`, `StorageError` met specifieke boodschappen.

**10. Drizzle config crasht niet vroeg genoeg**
- **Locatie:** `drizzle.config.ts`
- **Probleem:** `process.env.DATABASE_URL ?? ''` geeft een lege string als de variabele ontbreekt → cryptische fout diep in de code.
- **Fix:** `if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is niet ingesteld')`

**11. Geen paginering op geschiedenis-endpoints**
- **Locatie:** `/api/devices/[id]/history/route.ts`
- **Probleem:** Geeft alle records terug in één response. Toestellen met jaren service-geschiedenis → trage laadtijden.
- **Fix:** Voeg `?page=1&limit=20` query parameters toe.

---

### 🟢 Klein (nice to have)

**12. Release notes worden nooit ingevuld**
- `STAGING-TODO.md` heeft 30+ versies met onafgewerkte "Changenotes invullen" TO-DO's.
- Overweeg een GitHub Actions check die een merge blokkeert als `lib/releases.ts` niet bijgewerkt is.

**13. NextAuth is onvolledig geconfigureerd**
- Rollen zijn gedefinieerd in de types, maar API-routes worden niet beschermd door auth-middleware.
- Belangrijk vóór de app naar echte gebruikers gaat.

---

### Aanbevolen volgorde

| Prioriteit | Taak | Geschatte tijd |
|---|---|---|
| 1 | Silent JSON parse fix (complete route) | 1 uur |
| 2 | Circular dependency detectie | 2 uur |
| 3 | `AssigneeSelect` buiten component verplaatsen | 15 min |
| 4 | Structured logging met Pino | 4 uur |
| 5 | IndexedDB quota monitoring | 2 uur |
| 6 | Zod validatie toevoegen | 1 dag |
| 7 | Error boundaries | 2 uur |
