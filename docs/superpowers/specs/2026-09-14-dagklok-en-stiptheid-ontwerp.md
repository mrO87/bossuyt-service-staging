# De dagklok, en wat je er later mee kan meten

*14 september 2026*

## Waar dit over gaat

Een technieker tikt bij het vertrekken op een play-knopje en bij het thuiskomen
op een stopknopje. Daarmee weet de app wanneer de dag echt begon en eindigde,
in plaats van alleen wanneer hij gepland stond.

De gebruiker, over de vier tijdvelden die op de werkbon stonden:

> "Enkel aankomst en vertrek uur houden start stop werk is eigenlijk hetzelfde."

En over de knop:

> "Wel mss een start dag knop toevoegen op de dagview die we klikken als we de
> dag starten. (…) Tijd moet aangepast kunnen worden."

## Wat gebouwd wordt

Het play- en stopknopje staan in de bestaande START- en EINDE-regel van de
tijdlijn, met het uur erachter. Grijs zolang het het geplande uur is, zwart
zodra het het echte is. Tikken op het uur opent een venster met "Nu", stapjes
van een kwartier, en de mogelijkheid het gewoon in te tikken.

**De dag schuift mee.** Vertrek je om 07:12 in plaats van 07:00, dan staat
Trianon op 08:42 in plaats van 08:30, met het geplande uur doorstreept ernaast.
De gebruiker daarover:

> "de dag schuift wel mee. Te laat bij klant is geen ramp tenzij systematish"

Een bon met een vastgezet uur blijft staan waar hij staat — dat uur is met de
klant afgesproken — en botst hij, dan verschijnt de arcering die daar al voor
bestaat.

## Wat nog niet gebouwd wordt: stiptheid als kengetal

De gebruiker, in dezelfde adem:

> "Een kpi voor admin/planner en manager kan zijn hoe vaak een technieker te
> laat bij klant was maar enkel als uur door planning werd vastgezet. Mss in
> specs zetten en niet al bouwen?"

Dat laatste zinnetje is het hele ontwerp, en het is scherper dan het lijkt.

**Alleen een vastgezet uur telt mee.** Een berekend uur is een schatting van de
app: het volgt uit rijtijden die we niet controleren en uit hoe lang de vorige
job duurde. Te laat komen op een schatting is geen fout van de technieker maar
een schatting die niet uitkwam. Een vastgezet uur is iets anders — dat is
afgesproken met de klant, en dat is precies wat het speldje betekent:

> "Hzt speldje beschermd ook niets het geeft aan dat een vast uur afgesproken is"

In de database is dat `work_orders.start_is_appointment = true` samen met
`planned_start_minutes`. Zonder allebei is er niets om aan af te meten.

**Waaraan meet je de aankomst?** Aan `werkbonnen.arrival_time` — het aankomstuur
dat de technieker op de bon zet. Niet aan het vertrekuur van de dag, want
onderweg kan er van alles gebeuren dat niemand kan plannen.

**Wat het kengetal moet vermijden.** "Te laat bij klant" als los getal per
technieker nodigt uit tot de verkeerde conclusie. Twee dingen horen erbij:

1. **Hoe vaak, van hoeveel.** Drie keer te laat op vier afspraken is iets
   anders dan drie keer op tachtig.
2. **Hoeveel te laat.** Zeven minuten is geen zestig.

De gebruiker zei het zelf: te laat komen is pas een probleem als het
systematisch is. Het kengetal moet dus een patroon tonen, geen incident.

**Wie ziet het.** Admin, planner en manager. Niet de technieker zelf als
ranglijst — dat maakt van een planningsinstrument een beoordelingsinstrument,
en dan wordt er niet meer eerlijk getikt.

## Wat er nog beslist moet worden

- Vanaf hoeveel minuten telt iets als te laat? Vijf? Vijftien?
- Telt een afspraak waar de planner zelf het uur van verschoven heeft nog mee?
- Hoort er een reden bij te kunnen (file, vorige job liep uit), en zo ja: wordt
  die gevraagd of vrijwillig?

Deze drie zijn open. Ze hoeven pas beantwoord te worden wanneer het kengetal
echt gebouwd wordt.
