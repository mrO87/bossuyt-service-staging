# Ontwerp — een bon uit de planning krijgen

Datum: 13 september 2026 · Doelversie: **v1.66** · Volgt op v1.65

Prototype: `docs/superpowers/specs/2026-09-13-pool-en-datum-prototype.html`
(drie rondes, met de vinger getest)

---

## 1. Wat er stuk is

In v1.64 is het venster tijdens het slepen vastgezet, omdat het wegsprong onder
de vinger. Bijwerking: **de pool is niet meer te bereiken.** Die hangt onder een
rooster van ruim 600 px, dus je moest ernaartoe scrollen — en dat kan niet meer
terwijl je een blok vasthoudt.

Naar een andere week slepen kon sowieso nooit: daar was geen doelwit voor.

## 2. Wat we bouwen

Drie plaatsen waar een bon een dag krijgt of verliest.

| | waar | wat het doet |
|---|---|---|
| **Poolbalkje** | vast onderaan het scherm | sleep erheen = uit de planning; tik erop = het schuift open en je sleept er eentje uit |
| **Weekranden** | links en rechts over het rooster, alleen tijdens het slepen | sleep erheen = zeven dagen vroeger of later |
| **De werkbon** | datum- en uurveld op de bon zelf | elke datum, ook buiten de zichtbare week |

## 3. Het model verandert niet

`planned_date` is al een echte datum en `planned_start_minutes` bestaat al sinds
v1.61. **Alleen de weergave dacht in kolommen; de data deed dat nooit.** Er is
dus geen migratie en geen nieuw veld.

Wat wél nieuw is, is een tweede manier om die velden te schrijven.

## 4. De tweede deur

### 4.1 Waarom de bestaande deur niet volstaat

`savePlanningSnapshot` beschrijft een **hele dag**: "deze bonnen, in deze
volgorde". Dat is wat hem idempotent maakt en wat de offline-wachtrij laat
samenvouwen. Maar het vraagt dat je die dag kent.

De werkbonpagina kent de andere bonnen van 24 september niet. Een sleep naar
volgende week evenmin — die dag is niet geladen. En een snapshot met één bon
erin zou alle andere bonnen van die dag **uit de planning gooien**.

### 4.2 Wat er bij komt

`update_placement` — één bon, waar hij staat:

```ts
{ workOrderId: string
  date: string | null          // null = de pool
  startMinutes: number | null  // null = uur wordt berekend
  appointment: boolean }
```

Die vorm bestaat al in dit project: `update_estimate` is precies hetzelfde
patroon — één bon, één uitspraak, door dezelfde offline-wachtrij. De server zet
hem achteraan op de doeldag en weet zelf wat daar al staat.

### 4.3 De grendels

**De versiegrendel gaat eromheen.** `savePlanningSnapshot` weigert een
schrijfactie als iemand die dag ondertussen wijzigde; `update_placement` kan dat
niet, want de bon weet niets van de dag waar hij heen gaat. Laatste die het zegt
wint. Beslist door de gebruiker: in de praktijk plant één persoon.

Wat er wél tegenover staat: de bon krijgt op zijn nieuwe dag een versienummer
**hoger dan wat daar al stond**. Een momentopname die onderweg was voor die dag
en de nieuwkomer niet kent, wordt daardoor geweigerd in plaats van hem stilletjes
weer uit de planning te gooien.

**De statusgrendel geldt onverkort.** Een gestarte bon verhuist nergens heen —
niet via slepen, niet via een weekrand, niet via het datumveld op de werkbon.
Dezelfde `canLeaveTheDay` als in `savePlanningSnapshot`. Uitdrukkelijk gevraagd
door de gebruiker.

## 5. Botsingen: er wordt niets gebouwd

Het uur uit de werkbon is hetzelfde veld en gaat door dezelfde rekenkern als het
uur uit het rooster. Dus:

- rode arcering over precies het onmogelijke stuk, met `kan niet`
- de melding met de drie uitwegen
- niets schuift vanzelf op

De werkbon toont diezelfde melding bij zijn uurveld. Er komt geen tweede
botsingslogica bij — dat zou een tweede waarheid zijn.

## 6. Wat het prototype leerde

1. **Een balk aan het kader is geen balk aan het scherm.** De eerste ronde zette
   het poolbalkje onderaan een doos op een pagina; je moest ernaartoe scrollen om
   hem te zien, en daarmee bewees de mockup het omgekeerde van wat hij wilde
   tonen. Hij hoort vast te staan aan de onderrand van het venster.
2. **Zeven dagknopjes zijn een grens, geen bediening.** De eerste ronde liet
   alleen de zichtbare week toe. "De klant vraagt donderdag over veertien dagen"
   is een datum, geen kolom.
3. **Een bon die uit beeld gaat, moet ergens blijven staan.** Zonder het strookje
   "buiten deze week" lijkt hij verdwenen, en dan vertrouw je de knop niet meer
   die hem daarheen stuurde.
4. **Kolommen van 62 px, niet meeschalend.** Met meeschalende kolommen stond het
   uur afgekapt als `07:0…` en beoordeel je iets wat niet bestaat.

## 7. Wrijving die blijft staan

Het rooster scrolt zijwaarts, en de weekranden liggen daar bovenop. Slepen naar
de rand is dus ook de plaats waar een veeg de week verschuift. Niet weggepoetst —
dit is wat er ge-evalueerd moet worden op een echte telefoon.

En: de weekranden en het datumveld doen hetzelfde werk. De randen zijn sneller
met één hand, het veld is preciezer. **Als er na het evalueren eentje mag
sneuvelen, is dat de nuttigste uitkomst.** De randen zijn het goedkoopst om weg
te halen.

## 8. Testplan

| wat | hoe |
|---|---|
| datum zeven dagen op- of afschuiven, over maand- en jaargrenzen | unit |
| de vierde en vijfde sleepuitkomst (pool, weekrand) | unit, `resolveWeekDrop` |
| `update_placement` zet datum, wist uur, hangt achteraan | integratie |
| een gestarte bon wordt geweigerd | integratie |
| de nieuwkomer krijgt een hoger versienummer dan de dag | integratie |
| het balkje raken met een duim, met een blok in je hand | met de hand — de enige eerlijke test |
