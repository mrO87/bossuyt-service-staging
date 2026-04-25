# Staging Route And Release Discipline Design

**Datum:** 2026-04-10

**Doel**

De service-app moet een duidelijke scheiding krijgen tussen:

- de bevroren demo voor Bossuyt
- de actieve staging-omgeving waar we verder bouwen
- de plan-site die uitlegt wat live staat op staging

Tegelijk bepalen we welke routes in de huidige app echt deel uitmaken van de productflow, welke intern blijven, en hoe versies en changenotes voortaan consequent beheerd worden.

**Beslissingen**

We houden de omgevingen strikt gescheiden:

- `https://bossuyt-service.fixassistant.com/` blijft voorlopig onaangeroerd en dient als demo-site voor Bossuyt
- `https://staging.bossuyt.fixassistant.com/` is de actieve ontwikkel- en testomgeving voor de service-app
- `https://plan.bossuyt.fixassistant.com/` blijft de plan- en uitlegsite

De changenotes op de plan-site mogen enkel tonen wat effectief zichtbaar is op staging. De plan-site blijft dus een betrouwbare weergave van de huidige staging-versie, niet van onafgewerkte of verborgen features.

**Routebeleid**

De huidige routes krijgen deze rol:

- `/` blijft het actieve dagoverzicht van de technieker
- `/changenotes` blijft de changelog van de service-app binnen deze repo
- `/architecture` blijft een interne werkruimte waar architectuurkeuzes, datamodellen, rollout-beslissingen en opbouw van de webapp getoond kunnen worden
- `/interventions/[id]` blijft zichtbaar op staging en wordt verder uitgebouwd tot de echte detail-/werkbonpagina
- `/werkbon/nieuw` blijft in de codebase, maar wordt voorlopig verborgen zolang de echte databron en offline-flow nog niet klaar zijn

Concreet betekent "verborgen" in deze fase:

- er komt nergens in de zichtbare staging-UI een link naar `/werkbon/nieuw`
- de route blijft wel rechtstreeks bereikbaar als je de URL kent
- we voeren in deze fase dus geen redirect, auth-gate of 404-afscherming in voor die pagina

**Analyse Van Bestaande Pagina's**

`/interventions/[id]` is vandaag al deel van de staging-flow: vanuit het dagoverzicht en de timeline wordt naar deze pagina genavigeerd. Functioneel hoort die pagina dus bij de service-app. Technisch is ze nog prototype-achtig, want ze leest nog direct uit `lib/mock-data.ts`.

`/werkbon/nieuw` is vandaag geen actieve route in de staging-flow. Er zijn geen links vanuit de hoofdapp naar deze pagina. Ze is momenteel een losse wizard op basis van mock customers, sites en devices, en hoort daarom nog niet zichtbaar te zijn in de lopende staging-ervaring.

Git-historiek toont dat beide pagina's initieel als scaffolding zijn toegevoegd in de vroege opstartfase van het project. Dat bevestigt dat ze intentioneel bestaan, maar niet automatisch betekenen dat ze allebei al productierijp zijn.

**Toekomstige Werkbonflow**

We behouden `/werkbon/nieuw` als toekomstige feature, omdat een nieuwe werkbon wel degelijk nodig is voor het serviceproces.

Voor later gelden deze functionele richtlijnen:

- zowel technieker als admin moeten handmatig een nieuwe werkbon kunnen aanmaken
- een technieker moet op locatie offline een extra werkbon kunnen aanmaken voor een extra toestelprobleem, zolang klant/site/toestel al in de offline data van die dag aanwezig zijn
- in weekend- of ad-hoc-situaties mag internet vereist zijn om klanten en toestellen op te zoeken en een nieuwe werkbon aan te maken
- zodra zo'n werkbon aangemaakt is, moet die mee in de offline opslag terechtkomen

Niet in scope voor deze fase:

- rechtenlogica rond admin-werkbonnen versus technieker-werkbonnen
- delete/move-regels
- historiek van de laatste 5 tot 10 werkbonnen per toestel of site

**Release Discipline**

Elke user-visible wijziging op staging krijgt een nieuw versienummer.

Een staged release is pas volledig wanneer deze drie zaken in dezelfde wijzigingsgolf zijn bijgewerkt:

- de versiebadge op staging
- `/changenotes` in deze repo
- `plan.bossuyt.fixassistant.com/changenotes`

Verborgen routes of onafgewerkte interne scaffolding tellen niet mee voor release notes. Enkel wat zichtbaar en bruikbaar op staging staat, hoort in de changelog van die versie.

De canonieke versiebron leeft in deze repo. Die ene bron stuurt:

- de staging-versiebadge
- de repo-changenotes
- de changelog-inhoud die later naar de plan-site doorgetrokken wordt

De plan-site mag pas aangepast worden wanneer die versie effectief live en zichtbaar is op staging.

Wijzigingen op `/architecture` tellen niet automatisch als nieuwe release. Verborgen routes zoals `/werkbon/nieuw` tellen ook niet mee zolang ze geen zichtbare staging-flow beïnvloeden.

**Menselijke Releasebeslissing**

De assistant beslist niet zelfstandig of iets een nieuwe versie is.

Workflow:

- telkens wanneer de gebruiker vraagt om wijzigingen te maken, vraagt de assistant eerst of dit een nieuwe versie is of een verfijning van de huidige versie
- pas na bevestiging van de gebruiker worden versiebadge en changenotes als releasewerk aangepast
- wanneer een versie afgerond is, vraagt de assistant expliciet of die versie gecommit en naar GitHub gepusht moet worden

Zo blijft de releasebeslissing bij de gebruiker, terwijl de technische releaseflow wel consequent blijft.

**Databasefundering**

Deze route- en release-opkuis verandert niets aan de grotere technische richting:

- er komt één gedeelde PostgreSQL in Docker in deze repo
- staging evolueert stapsgewijs van mock-data naar server-routes bovenop die database
- `/interventions/[id]` wordt uiteindelijk vervangen door een echte PostgreSQL-/sync-backed detailpagina
- deze architectuur maakt een latere verhuis naar een andere server eenvoudiger, omdat app, database en rolloutpad duidelijker zijn afgelijnd

**Implementatierichting**

De aanbevolen volgorde is:

1. staging opschonen zodat enkel de juiste actieve routes zichtbaar zijn
2. release-discipline expliciet maken in badge + changenotes-flow
3. `/interventions/[id]` behouden als zichtbare route, maar geleidelijk losmaken van mock-data
4. `/werkbon/nieuw` verbergen tot de echte nieuwe-werkbonflow ontworpen en gekoppeld is aan offline/data-opslag
5. gedeelde PostgreSQL-fundering bouwen en server-routes laten uitgroeien tot de primaire databron

**Open Punt Voor Volgende Fase**

Na goedkeuring van dit ontwerp moet een implementatieplan uitwerken:

- waar de versiebron precies leeft
- hoe changenotes in repo en plan-site synchroon beheerd worden
- hoe de eerste PostgreSQL-slice de huidige mock-data vervangt zonder staging te breken
