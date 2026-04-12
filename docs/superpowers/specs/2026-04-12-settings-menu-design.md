# Settings Menu — Ontwerp Spec

**Datum:** 2026-04-12  
**Status:** Goedgekeurd  
**Feature:** Settings panel onder de OP-badge in de DayView header

---

## Samenvatting

Als een technieker op de OP-badge tikt in de header van de DayView, schuift een **bottom sheet** omhoog met drie secties:
1. Startlocatie (atelier of thuis met adres-autocomplete)
2. Gewenst startuur
3. Overuren-widget (gecombineerd: vandaag + saldo)

Alle instellingen worden opgeslagen in **localStorage** — geen database nodig voor de persoonlijke voorkeuren.

---

## Sectie 1 — Startlocatie

### Gedrag
- Een toggle met twee knoppen: **Atelier** (standaard) en **Thuis**
- Bij **Atelier**: toont vast label "Bossuyt Kitchen, Noordlaan 19, 8520 Kuurne" — geen invoer nodig
- Bij **Thuis**: toont een adres-invoerveld met autocomplete
  - Minimum 3 tekens voor de eerste API-call
  - Debounce: 400ms na de laatste toetsaanslag
  - Autocomplete via **Nominatim (OpenStreetMap)** — geen API-sleutel nodig
  - Endpoint: `https://nominatim.openstreetmap.org/search?format=json&countrycodes=be&q=<query>`
  - Suggesties verschijnen als een lijst onder het veld (max 5 resultaten)
  - Bij selectie: volledig adres opgeslagen in localStorage
  - Vereist `User-Agent` header met app-naam (Nominatim policy)

### localStorage-sleutels
- `settings.startLocation`: `"atelier"` | `"thuis"`
- `settings.homeAddress`: `{ display: string, lat: number, lon: number }`

---

## Sectie 2 — Gewenst startuur

### Gedrag
- Native `<input type="time">` — krijgt het klavier van het OS, werkt goed op mobiel
- Standaardwaarde: `07:30`
- Opgeslagen direct bij elke wijziging

### localStorage-sleutel
- `settings.startTime`: `"07:30"` (string HH:MM)

---

## Sectie 3 — Overuren-widget

### Design
Gecombineerd: **vandaag** (links) + **saldo** (rechts) in één widget.

```
┌─────────────────────────────────┐
│ Vandaag          Saldo          │
│ 6u47 / 7u45      +12u34         │
│ ████████████░░                  │
│ Nog 58 min tot einde dag        │
│                                 │
│ * Berekende tijden —            │
│   nog niet goedgekeurd          │
└─────────────────────────────────┘
```

### Berekening "Vandaag"
- Starttijd = `settings.startTime` (uit localStorage)
- Elapsed = `now - startTime` (live, tikt elke minuut)
- Doeluren = vast op 7u45 (later configureerbaar via DB)
- Voortgangsbalk = `elapsed / target * 100%`, geplafonneerd op 100%

### "Saldo"
- Placeholder `--u--` totdat DB-koppeling er is
- Kleur: groen bij positief saldo, rood bij negatief

### Disclaimer
Onderaan de widget, in `text-xs italic text-ink-soft`:  
*"Berekende tijden — nog niet goedgekeurd"*

### Toekomstige DB-koppeling
Het saldo wordt later opgehaald via een API-route `/api/user/overtime` die de kalender- en verlof-database raadpleegt. De widget-component accepteert al een optionele `saldo`-prop zodat de koppeling later kan worden ingestoken zonder de component te herschrijven.

---

## Technische structuur

```
components/
  SettingsSheet/
    index.tsx          ← bottom sheet container, open/close animatie, overlay
    AddressSearch.tsx  ← Nominatim autocomplete input + dropdown
    OvertimeWidget.tsx ← gecombineerde timer (vandaag + saldo)

lib/
  hooks/
    useSettings.ts     ← localStorage lezen/schrijven voor alle settings
```

### SettingsSheet — gedrag
- Opent via `onClick` op de OP-badge in `DayView.tsx`
- Animatie: `translate-y-full` → `translate-y-0` (Tailwind transition)
- Sluit via: (a) klik op overlay, (b) swipe omlaag, (c) sluit-knop bovenaan
- `z-index` boven alles, donkere overlay (`bg-black/40`) over de pagina

### useSettings hook
```ts
interface Settings {
  startLocation: 'atelier' | 'thuis'
  homeAddress: { display: string; lat: number; lon: number } | null
  startTime: string  // "HH:MM"
}
```
- Leest bij mount uit localStorage
- Schrijft direct bij elke wijziging
- Exporteert `settings` en `updateSetting(key, value)`

### AddressSearch — Nominatim
- Direct browser-fetch naar `https://nominatim.openstreetmap.org/search`
- Parameters: `format=json`, `countrycodes=be`, `limit=5`, `q=<query>`
- Geen custom `User-Agent` nodig — browsers blokkeren dit. Nominatim accepteert aanvragen zonder voor low-volume apps.
- Resultaten: `display_name`, `lat`, `lon`
- Bij offline: veld blijft bruikbaar als vrij tekstveld (geen crash)

---

## Wat dit niet doet (buiten scope)

- Geen server-side opslag van instellingen (localStorage is voldoende voor persoonlijke prefs)
- Geen overuren-goedkeuringsflow (komt later met de DB-koppeling)
- Geen gebruikersbeheer (de "OP" initialen zijn voorlopig hardcoded)
- Geen profielfoto of andere gebruikersgegevens

---

## Succescriteria

- [ ] Tikken op OP-badge opent de bottom sheet
- [ ] Startlocatie toggle werkt en wordt onthouden na herstart
- [ ] Thuis-adres autocomplete toont Belgische suggesties via Nominatim
- [ ] Startuur wordt opgeslagen en weergegeven
- [ ] Overuren-widget tikt live (elke minuut) vanaf het ingestelde startuur
- [ ] Disclaimer "Berekende tijden — nog niet goedgekeurd" zichtbaar
- [ ] Saldo toont placeholder `--u--` (DB-koppeling later)
- [ ] Sheet sluit bij swipe omlaag of klik op overlay
