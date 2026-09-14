export type ChangeLabel = 'Nieuw' | 'Verbeterd' | 'Fix'

export type ReleaseChange = {
  label: ChangeLabel
  title: string
  body: string
}

export type ReleaseEntry = {
  version: string
  date: string
  changes: ReleaseChange[]
}

// Maintainers: every visible staging release must update this file; the badge and /changenotes are expected to stay aligned with it.
export const RELEASES: ReleaseEntry[] = [
  {
    version: 'v1.67',
    date: '13 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Een bon rechtzetten waar je hem ziet',
        body:
          'Kwam een bon binnen met een leeg naamvak of een fout adres, dan stond dat er '
          + 'en bleef dat er. Het potloodje in de kop van de werkbon opent nu een scherm '
          + 'waar je die gegevens verbetert. De velden staan gegroepeerd naar wat een '
          + 'wijziging raakt, want niet alles op een bon hoort bij díé bon: het '
          + 'ticketnummer wel, maar de naam, het adres en het telefoonnummer deelt hij met '
          + 'elke andere bon van hetzelfde huis. Een merkje zegt daarom vooraf hoe ver je '
          + 'wijziging reikt — "alleen deze bon", of "geldt voor 4 bonnen". Aan een bon '
          + 'waaraan al gewerkt wordt, verandert niemand nog iets.',
      },
      {
        label: 'Nieuw',
        title: 'De originele bon zit achter een klein icoontje in de kop',
        body:
          'Naast "SERVICE BON" staan voortaan kleine knopjes: de bon zoals hij binnenkwam '
          + '(een PDF-symbool of een fotosymbool, naargelang wat er geüpload werd), de '
          + 'afgewerkte bon zodra die getekend is, en het potloodje om de gegevens recht te '
          + 'zetten. Wie twijfelt aan wat de app uitgelezen heeft, legt het papier er zo in '
          + 'twee tikken naast. Is er geen origineel, dan staat er ook geen knopje — een '
          + 'knop die niets opent is erger dan geen knop.',
      },
      {
        label: 'Verbeterd',
        title: 'Alle toestellen van een bon, niet alleen het eerste',
        body:
          'Staan er meerdere toestellen op één servicebon, dan las de app ze wel alle drie '
          + 'uit maar toonde ze er één. Nu staat er een rijtje met alle toestellen van de '
          + 'bon; het toestel waarover het verslag gaat, is aangeduid. Bij één toestel '
          + 'verandert er niets aan het scherm.',
      },
      {
        label: 'Fix',
        title: 'Een nieuwe bon staat meteen op jouw naam',
        body:
          'Een bon die via de upload binnenkwam had nog geen technieker. Gaf je hem dan '
          + 'een dag, dan verdween hij uit élke weergave: niet meer in de pool want hij '
          + 'had een datum, en op niemands dag want er stond niemand bij. Vastgesteld op '
          + 'een echte bon die nergens meer te vinden was. Wie een bon aanmaakt, draagt '
          + 'hem nu — en een bon die je op een dag zet krijgt sowieso een technieker.',
      },
      {
        label: 'Fix',
        title: 'Een foto uploaden strandde meteen',
        body:
          'Koos je een foto in plaats van een PDF, dan verscheen er een technische fout '
          + '("The source width is 0") en kwam je niet verder. De app gaf het geheugen van '
          + 'de afbeelding vrij vlak vóór ze de afmetingen nodig had, en las daarna nul bij '
          + 'nul pixels uit. Foto uploaden werkt weer.',
      },
      {
        label: 'Verbeterd',
        title: 'Het selectievak begint op de hele foto',
        body:
          'Bij het aanduiden van de hoeken lag er standaard een kader dat acht procent naar '
          + 'binnen sprong. Wie zijn foto op de gsm al rechtzet en bijsnijdt, kreeg zo net de '
          + 'randen van de bon afgesneden en moest vier hoeken terugslepen. Het kader begint '
          + 'nu op de hoeken van de foto zelf; versleep ze alleen nog als het nodig is.',
      },
      {
        label: 'Verbeterd',
        title: 'Een bon zonder klantnaam kan nu ook binnen',
        body:
          'Op een papieren servicebon blijft het naamvak soms leeg. De app hield zo een bon '
          + 'tegen om iets wat er gewoon niet op stond. De naam is niet langer verplicht — '
          + 'het rode merkje "niet gevonden" naast het veld zegt al dat hij ontbreekt, en je '
          + 'kan hem zelf invullen als je hem kent. Adres en gemeente blijven wél nodig: '
          + 'zonder die twee kan niemand ergens naartoe rijden. In de planning staat bij zo '
          + 'een bon "Naam ontbreekt", zodat een leeg blok nooit als een fout in de app '
          + 'gelezen wordt.',
      },
      {
        label: 'Fix',
        title: 'De zijbalken pakken maandag niet meer af',
        body:
          'Een bon naar maandag verplaatsen of er een uur op zetten lukte niet: hij '
          + 'sprong een week terug. De app koos het doelwit op basis van middelpunten, '
          + 'en omdat de zijbalken over de volle hoogte lopen ligt hun midden dertig '
          + 'pixels hoger dan dat van een dagkolom. Bij een blok bovenaan het rooster '
          + 'woog dat verschil zwaarder dan de afstand opzij, en won de balk van maandag '
          + 'terwijl je vinger op maandag stond. Nu beslist je vinger: een zijbalk telt '
          + 'alleen mee als je er werkelijk op staat.',
      },
      {
        label: 'Nieuw',
        title: 'Een vergeten werkbon keert vanzelf terug naar de pool',
        body:
          'Stond een bon op een dag die voorbij is en is er nooit aan gewerkt, dan was '
          + 'hij onvindbaar: de dagplanning toont vandaag, de weekplanning toont de week '
          + 'waar je in kijkt, en de pool toont alleen bonnen zonder dag. Zo raakte werk '
          + 'stil zoek. Nu zet de app zulke bonnen terug in de pool, telkens iemand de '
          + 'planning opent. Onderweg telt daarbij als niet-gedaan — wie gisteren vertrok '
          + 'maar geen afgewerkte bon heeft, heeft hem niet gedaan. Een afgewerkte, '
          + 'geannuleerde of op onderdelen wachtende bon blijft staan waar hij staat.',
      },
      {
        label: 'Nieuw',
        title: 'Een werkbon kan niet meer in het verleden gezet worden',
        body:
          'Een datum van gisteren is nooit een plan — het is een tikfout of een verkeerd '
          + 'gemikte sleep. Slepen naar een voorbije dag, een week terugschuiven naar een '
          + 'week die al om is, en het datumveld op de werkbon weigeren dat nu alle drie, '
          + 'met uitleg erbij. Ook de server weigert het, want de wachtrij van een '
          + 'telefoon die een nacht offline stond komt binnen met de datum van toen. '
          + 'Vandaag blijft wél toegestaan, ook als het al namiddag is. En naar de pool '
          + 'slepen kan altijd: dat is juist de uitweg.',
      },
    ],
  },
  {
    version: 'v1.66',
    date: '13 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Een blauw poolbalkje onderaan het scherm',
        body:
          'Sinds het venster tijdens het slepen stilstaat, kon je de pool niet meer '
          + 'bereiken: die stond bovenaan de pagina en je kon er niet meer naartoe '
          + 'scrollen met een blok in je hand. De pool zit nu in een balkje dat onderaan '
          + 'het scherm blijft plakken, altijd in beeld. Tijdens het slepen licht het op '
          + 'en zegt het wat er gebeurt als je loslaat. Tik erop en het schuift open met '
          + 'de wachtende bonnen erin, die je van daaruit weer op een dag legt.',
      },
      {
        label: 'Nieuw',
        title: 'Naar de vorige of volgende week slepen',
        body:
          'Aan de linker- en rechterkant van het weekrooster verschijnen tijdens het '
          + 'slepen twee smalle doorschijnende stroken. Je leest de uurkolom er gewoon '
          + 'doorheen, want je mikt op een uur en niet alleen op een dag; zodra een '
          + 'strook het doelwit is kleurt hij vol oranje. Laat je een bon erop los, dan '
          + 'springt hij een week terug of vooruit, naar dezelfde weekdag. Buiten het '
          + 'slepen zijn ze onzichtbaar, zodat ze geen plaats innemen op een telefoon.',
      },
      {
        label: 'Nieuw',
        title: 'De geplande dag en het uur staan nu ook in de werkbon zelf',
        body:
          'Bovenaan een werkbon staat voortaan een datumveld, een uurveld en een vinkje '
          + 'om het uur vast te zetten — samen op één regel, zodat het vak klein blijft. '
          + 'Zo verplaats je een bon naar eender '
          + 'welke dag zonder hem te slepen, ook buiten de week die je op het rooster ziet. '
          + 'Botst het uur met de rest van die dag, dan lees je daar dezelfde melding als '
          + 'op het rooster: de app rekent de doeldag door met dezelfde motor, zodat de '
          + 'twee schermen nooit iets anders kunnen beweren. Een gestarte of afgewerkte '
          + 'bon toont dezelfde regel, maar uitgeschakeld, met de reden erbij: dag en '
          + 'uur liggen dan vast.',
      },
      {
        label: 'Fix',
        title: 'Een bon naar de pool slepen kwam soms niet aan',
        body:
          'Je sleepte een bon naar de pool, op het scherm stond hij daar ook, maar in de '
          + 'database bleef hij op zijn dag staan. Bij het vrijgeven stuurde de app het '
          + 'volgnummer van de bonnen die bleven, terwijl de server kijkt naar het hoogste '
          + 'van de hele dag — inclusief de bon die net vertrok. Dat verschil viel nooit '
          + 'op zolang een hele dag altijd in een keer werd weggeschreven. Nu een enkele '
          + 'bon zijn eigen nummer kan ophogen, werd het meteen raak. De app stuurt nu het '
          + 'nummer van de dag zoals de server hem nog kent.',
      },
    ],
  },
  {
    version: 'v1.65',
    date: '13 september 2026',
    changes: [
      {
        label: 'Fix',
        title: 'De oude dag blijft stil als je een bon verhuist',
        body:
          'Sleepte je een werkbon naar een andere dag, dan schoven de andere bonnen van '
          + 'zijn oude dag mee alsof er iets veranderde — terwijl die bon daar net aan het '
          + 'vertrekken was. Zodra je begint te slepen klikt het uur namelijk in op het '
          + 'kwartier, en dat telde meteen als een vast uur op die dag. De app kijkt nu '
          + 'waar je vinger uitkomt: blijf je boven je eigen dag, dan rekent die mee; ga '
          + 'je naar een andere kolom of naar de pool, dan blijft de oude dag staan zoals '
          + 'hij stond.',
      },
      {
        label: 'Verbeterd',
        title: 'De meldingen zeggen nu over welke dag ze gaan',
        body:
          'Een melding begon met een uur — "Vertrek om 06:23" — terwijl ze over een andere '
          + 'dag in dezelfde week kon gaan. Zette je dan een bon vast en begon jouw dag '
          + 'juist later, dan leek de app te beweren dat je vroeger moest vertrekken. Elke '
          + 'melding begint nu met de dag in het vet, noemt de klant om wie het gaat, en '
          + 'zet het vertrekuur naast het ingestelde startuur zodat je het verschil ziet.',
      },
    ],
  },
  {
    version: 'v1.64',
    date: '13 september 2026',
    changes: [
      {
        label: 'Fix',
        title: 'Het scherm springt niet meer weg terwijl je sleept',
        body:
          'Tijdens het verschuiven van een bon kon de pagina plots opschuiven onder je '
          + 'vinger, precies terwijl je aan het mikken was. Twee oorzaken: de app '
          + 'scrollde mee om het blok onder je vinger te houden terwijl de dag zelf al '
          + 'meebewoog, en een botsingsmelding die tijdens het slepen verscheen duwde het '
          + 'hele rooster naar beneden. Het venster staat nu stil zolang je vasthoudt; de '
          + 'rode arcering op het rooster verschijnt wél gewoon mee, want die verandert de '
          + 'indeling niet. Zijwaarts vegen naar een dag buiten beeld blijft werken.',
      },
      {
        label: 'Verbeterd',
        title: 'De dag reist mee als je van weergave wisselt',
        body:
          'Stond je in de dagplanning op dinsdag en koos je de weekplanning, dan kreeg je '
          + 'toch de week van vandaag te zien. Nu opent de week op de dag waar je stond, '
          + 'en omgekeerd opent de dagplanning op de week die je bekeek.',
      },
      {
        label: 'Verbeterd',
        title: 'Een afgesproken uur is ook in de dagplanning rood',
        body:
          'Zet je in de weekplanning een uur vast als afspraak met de klant, dan zag je '
          + 'dat in de dagplanning nergens terug — daar stond hetzelfde oranje uurtje als '
          + 'bij een berekend uur. Nu staat een afgesproken uur in het rood naast de '
          + 'klantnaam, met dezelfde betekenis als in de week: hier is iets beloofd.',
      },
    ],
  },
  {
    version: 'v1.63',
    date: '13 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'De dag rekent mee terwijl je sleept',
        body:
          'Verschuif een bon en de hele dag beweegt mee onder je vinger: de rijtijden '
          + 'verspringen, de vertrektijd schuift op, de volgorde herschikt zich, en botst '
          + 'het ergens dan verschijnt de rode arcering meteen. Tot nu toe zag je pas na '
          + 'het loslaten wat je gedaan had — je sleepte dus eigenlijk blind. Wat op het '
          + 'scherm staat terwijl je vasthoudt, is nu precies wat er bewaard wordt als je '
          + 'loslaat.',
      },
      {
        label: 'Fix',
        title: 'Een bon met een botsing was helemaal niet te verslepen',
        body:
          'Stond er rode arcering over een werkbon, dan gebeurde er niets als je hem '
          + 'probeerde te verplaatsen: hij sprong terug alsof je niets gedaan had. Juist '
          + 'die bon is degene die de melding je vraagt te verzetten. De arcering droeg '
          + 'intern dezelfde naam als de bon eronder, waardoor het slepen aan het '
          + 'verkeerde ding vasthing. Zat er sinds v1.61 in.',
      },
    ],
  },
  {
    version: 'v1.62',
    date: '13 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Een job langer of korter maken met je vinger',
        body:
          'Onderaan elk blok in de weekweergave zit een handvat. Sleep het naar beneden en '
          + 'de job duurt langer, naar boven en hij duurt korter — op het kwartier, en '
          + 'alles wat erachter komt schuift meteen mee. Het is dezelfde geschatte duur '
          + 'die je ook op de kaart kunt intypen, dus er staat niets dubbel: dit is een '
          + 'tweede manier om er aan te komen, met je vinger in plaats van met een getal.',
      },
      {
        label: 'Verbeterd',
        title: 'Het uur staat nu leesbaar op elk blok',
        body:
          'Het speldje was een aparte knop naast het uur, en daardoor bleef er van een '
          + 'kolom van 62 px te weinig over: "08:39" liep over het speldje heen. Het uur '
          + 'is nu zélf de knop. Tik op het groene bolletje en het wordt rood — dit uur is '
          + 'afgesproken met de klant. Het kruisje rechtsboven haalt een uur weer weg, '
          + 'zodat het weer berekend wordt.',
      },
      {
        label: 'Verbeterd',
        title: 'Een afspraak markeren verschuift het uur niet meer',
        body:
          'Stond een job op 08:39 en markeerde je hem als afspraak, dan sprong hij naar '
          + '08:45. Slepen klikt in op het kwartier omdat dat helpt mikken, maar markeren '
          + 'is iets anders: je zegt dat het uur dat er staat afgesproken is. Dan hoort er '
          + 'niets te verschuiven.',
      },
      {
        label: 'Verbeterd',
        title: 'Bij een botsing staat nu "kan niet" op de arcering',
        body:
          'De rode arcering over een onmogelijk stuk droeg haar uitleg alleen in een '
          + 'tooltip, en op een telefoon bestaat die niet. Nu staat het er gewoon op.',
      },
    ],
  },
  {
    version: 'v1.61',
    date: '12 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Een bon op een uur zetten',
        body:
          'Sleep een werkbon in de weekweergave omhoog of omlaag en hij staat op dat uur — '
          + 'op het kwartier. Vanaf dat uur wordt de rest teruggerekend: hoe laat je moet '
          + 'vertrekken, en hoeveel rijden er tussen de klanten zit die daardoor naast '
          + 'elkaar komen te staan. Tot nu toe berekende de app elk uur zelf; dit is het '
          + 'eerste uur dat ze onthoudt.',
      },
      {
        label: 'Nieuw',
        title: 'Het speldje: dit uur is afgesproken',
        body:
          'Het uurtje links op elk blok is groen zolang het berekend wordt, en rood zodra '
          + 'het vastligt. Met het speldje zeg je dat dat uur met de klant afgesproken is. '
          + 'Dat verandert niets aan hoe de bon zich laat verslepen — dat blijft even vrij — '
          + 'het is een bericht aan wie de planning leest: een groen uur mag je verzetten '
          + 'als het beter uitkomt, een rood uur heeft iemand beloofd. Het kruisje '
          + 'rechtsonder haalt een uur weer weg.',
      },
      {
        label: 'Nieuw',
        title: 'Wat niet kan, wordt getoond in plaats van rechtgezet',
        body:
          'Zet je een bon op een uur waarop je er onmogelijk kunt zijn, dan komt er rode '
          + 'arcering over precies dat stuk en blijft die staan. De app schuift niets '
          + 'vanzelf op: dat is geprobeerd en het maakte vrij plaatsen onmogelijk — elke '
          + 'bon werd naar de vorige toe gezogen en gleed weg onder je vinger. De melding '
          + 'noemt de drie uitwegen: de vorige job inkorten, deze later zetten, of het '
          + 'vaste uur weghalen.',
      },
      {
        label: 'Verbeterd',
        title: 'Een uur hoort bij een dag',
        body:
          'Sleep je een bon naar een andere dag of terug naar de pool, dan laat hij zijn '
          + 'uur los en wordt het weer berekend. Negen uur op dinsdag is niet negen uur op '
          + 'woensdag: de rit ernaartoe vertrekt van een andere plaats in een andere dag.',
      },
    ],
  },
  {
    version: 'v1.60',
    date: '12 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'De weekplanning',
        body:
          'Zeven dagen naast elkaar, van 06:30 tot 18:00, met de werkbonnen getekend op '
          + 'schaal van hun duur — zoals in een agenda. De open pool staat eronder, en je '
          + 'sleept een bon van de pool naar een dag, van een dag terug naar de pool, of '
          + 'van de ene dag naar de andere. Te vinden via "Week" in de datumbalk.',
      },
      {
        label: 'Nieuw',
        title: 'Een uur bij elke job',
        body:
          'De dagweergave toont nu bij elke werkbon hoe laat je er bent. Dat uur wordt '
          + 'berekend en nergens bewaard: het ingestelde vertrekuur plus de rijtijd is de '
          + 'aankomst, en zo verder van job naar job. Loopt iets uit, dan schuift de rest '
          + 'vanzelf mee, en een bon naar de pool slepen laat zijn uur gewoon verdwijnen. '
          + 'Dag en week rekenen met dezelfde motor, dus ze kunnen nooit een ander uur tonen.',
      },
      {
        label: 'Fix',
        title: 'Een lege dag is nu echt leeg',
        body:
          'Stond er niets ingepland, dan vulde de app de dag met verzonnen werkbonnen. Dat '
          + 'was ooit bedoeld als demo, maar met twee weergaven werd het een echte fout: de '
          + 'laatste bon van een dag slepen maakte die dag leeg, waarna hij zich meteen weer '
          + 'vulde met verzinsels — je wijziging leek terug te springen. In de weekweergave '
          + 'stonden lege dagen vol met bonnen die niet bestaan.',
      },
      {
        label: 'Fix',
        title: 'Een werkbon kan niet meer op twee dagen tegelijk staan',
        body:
          'Een bon van de ene dag naar de andere slepen is niet één wijziging maar twee: de '
          + 'oude dag geeft hem vrij, de nieuwe neemt hem op. Die twee overschreven elkaar in '
          + 'de wachtrij, waardoor de server alleen over de nieuwe dag te horen kreeg. Ze '
          + 'blijven nu allebei bewaard en vertrekken in de juiste volgorde.',
      },
      {
        label: 'Fix',
        title: 'De dagplanning toont geen werk van een andere dag meer',
        body:
          'De planning van vandaag werd uit een cache gelezen die niet op datum keek. Een bon '
          + 'die je in de weekweergave op donderdag zette, kon daardoor in de planning van '
          + 'vandaag opduiken — en zonder netwerk bleef hij daar staan.',
      },
    ],
  },

  {
    version: 'v1.59',
    date: '11 september 2026',
    changes: [
      {
        label: 'Fix',
        title: 'Rijtijden kloppen nu met waar de klanten liggen',
        body:
          'De rijtijden waren verzonnen. Ze werden berekend uit de nummers van de twee '
          + 'werkbonnen, niet uit hun adressen — vandaar dat twee jobs bij dezelfde klant '
          + 'toch tien tot veertig minuten rijden kregen. Nu wordt de echte afstand tussen '
          + 'de twee adressen gemeten, met een snelheid die meeschaalt: traag door de '
          + 'bebouwde kom, vlot over de snelweg. Twee bonnen op hetzelfde adres geven '
          + 'voortaan nul minuten, zoals het hoort.',
      },
      {
        label: 'Nieuw',
        title: 'Schuiven in je planning kost geen laadtijd meer',
        body:
          'Bij elke verschuiving werden de rijtijden opnieuw opgevraagd. Dat was niet alleen '
          + 'traag, het verbruikte ook de dagelijkse limiet van de routedienst — die halverwege '
          + 'de dag op kon zijn. De rijtijden worden nu een week onthouden, en in één keer voor '
          + 'alle combinaties van je stops. Je kan dus zoveel schuiven als je wil zonder dat er '
          + 'iets herladen wordt.',
      },
      {
        label: 'Verbeterd',
        title: 'De app zegt het nu als ze de rijtijd niet kent',
        body:
          'Ontbreekt het adres van een werkbon, dan staat er "? min · adres ontbreekt" in '
          + 'plaats van een getal. Onderaan de dag zie je hoeveel ritten er zo onbekend zijn. '
          + 'Dat is eerlijker dan een dagtotaal dat stiekem te laag uitvalt, en het wijst je '
          + 'meteen aan welke bon een adres mist.',
      },
      {
        label: 'Verbeterd',
        title: 'Atelier en thuis staan op de echte anderhalf uur',
        body:
          'De rit tussen het atelier in Kuurne en thuis in Kontich begint en eindigt bijna '
          + 'elke dag. Een berekening kwam daar op 1u41 uit; in het echt is het 1u30. Die is '
          + 'nu vastgelegd op de gekende waarde, zodat je dag niet twee keer per dag tien '
          + 'minuten te lang lijkt.',
      },
      {
        label: 'Verbeterd',
        title: 'Het echte Waze-logo op de Waze-knop',
        body:
          'De knop op de werkbon had een algemeen navigatiepijltje. Nu staat het echte '
          + 'Waze-logo er, in de eigen kleur, zodat je in één oogopslag ziet wat de knop doet.',
      },
    ],
  },

  {
    version: 'v1.58',
    date: '11 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Sleep werkbonnen tussen de pool en je dag',
        body:
          'Een job uit de open pool kan je nu in je dagplanning slepen, en een job uit je '
          + 'planning terug naar de pool als de dag niet meer volstaat. Terugleggen maakt de '
          + 'toewijzing niet ongedaan — de bon blijft van jou, hij heeft alleen geen dag meer. '
          + 'Slepen werkt ook zonder bereik: alles gaat eerst naar het toestel en vertrekt '
          + 'zodra je weer online bent, hoe vaak je ondertussen ook geschoven hebt.',
      },
      {
        label: 'Nieuw',
        title: 'De planning zegt het wanneer je dag overloopt',
        body:
          'Werk en rijtijd worden opgeteld en vergeleken met je uurrooster: 8u30 van maandag '
          + 'tot donderdag, 6u00 op vrijdag, telkens met een halfuur onbetaalde pauze eraf. '
          + 'Loopt de dag over, dan verschijnt er een rode regel met hoeveel te veel. Ze houdt '
          + 'je niet tegen — soms moet een dag gewoon vol — ze zorgt er alleen voor dat het '
          + 'niet per ongeluk gebeurt. Zolang de rijtijden nog berekend worden staat er '
          + '"ongeveer", want dan is het een schatting en geen zekerheid.',
      },
      {
        label: 'Nieuw',
        title: 'De geschatte duur is aanpasbaar geworden',
        body:
          'De duurtijd op een werkbon stond vast vanaf het aanmaken. Nu tik je erop en vul je '
          + 'zelf in hoelang je denkt bezig te zijn. Leeg laten mag ook. Dat is nodig geworden '
          + 'nu de planning waarschuwt dat je dag overloopt: een getal waar je op afgerekend '
          + 'wordt, moet je ook kunnen rechtzetten.',
      },
      {
        label: 'Fix',
        title: 'Je instellingen blijven nu echt bewaard',
        body:
          'Startlocatie en startuur sprongen soms terug naar de standaardwaarde. De oorzaak '
          + 'lag niet bij het bewaren zelf maar bij wat er gebeurde als het één keer mislukte: '
          + 'dan werden álle instellingen gewist in plaats van alleen de mislukte wijziging. '
          + 'Op een toestel waarvan de opslag volloopt met bonfoto\'s gebeurt dat vroeg of laat. '
          + 'Een mislukte poging verliest nu hoogstens die ene wijziging.',
      },
      {
        label: 'Verbeterd',
        title: 'Het overzicht van je uren volgt het echte rooster',
        body:
          'Het urenoverzicht in je instellingen rekende met 7u45 per dag, elke dag. Dat klopte '
          + 'met geen enkele dag: het zijn er 8u30 van maandag tot donderdag en 6u00 op vrijdag. '
          + 'Op vrijdagmiddag beweerde het dus dat je nog bijna twee uur voor de boeg had '
          + 'terwijl je klaar was. Het leest nu hetzelfde rooster als de planning.',
      },
      {
        label: 'Verbeterd',
        title: 'Een bon zonder dag hoort in de pool, niet nergens',
        body:
          'Een werkbon moest tot nu toe altijd een geplande datum hebben, ook als er nog geen '
          + 'dag voor gekozen was. Een ingescande bon kreeg daarom de datum van vandaag '
          + 'opgeplakt — een dag die niemand gekozen had. Geen datum is nu een geldig antwoord, '
          + 'en het is precies wat een bon in de open pool houdt.',
      },
    ],
  },

  {
    version: 'v1.57',
    date: '11 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Elke nieuwe werkbon krijgt 1u30',
        body:
          'Een werkbon had geen geschatte duur, en de dagplanning telt die duurtijden op. '
          + 'Een bon zonder schatting telde dus voor niets mee: zet er vijf in een dag en de '
          + 'planning beweert dat je dag leeg is. Nieuwe werkbonnen krijgen nu standaard 1u30 — '
          + 'niet juist voor elke job, maar zichtbaar op de planning in plaats van onzichtbaar. '
          + 'Bestaande werkbonnen houden hun lege schatting.',
      },
      {
        label: 'Verbeterd',
        title: 'Geen enkel veld is nog verplicht',
        body:
          'In v1.56 werden klantnummer, naam, adres en gemeente verplicht gemaakt. Dat is '
          + 'teruggedraaid: een bon die maar half leesbaar is, moet je toch kwijt kunnen. '
          + 'De knop blijft gedempt zolang er iets ontbreekt, zodat je het ziet, maar hij '
          + 'houdt je niet meer tegen. Elk veld blijft altijd zelf aanpasbaar.',
      },
      {
        label: 'Nieuw',
        title: 'De originele bon hangt aan de werkbon',
        body:
          'Bovenaan de werkbon staat nu "Originele bon bekijken". Elk veld eronder is een '
          + 'lezing van dat blad, dus als een straat of een naam verkeerd staat, is dat de '
          + 'plek waar het antwoord staat.',
      },
      {
        label: 'Nieuw',
        title: 'Rijden met Waze',
        body:
          'Eén knop op de werkbon opent Waze. Er wordt gezocht op de naam van de locatie mét '
          + 'het adres erbij, en de coördinaten gaan mee als vangnet. Kent Waze het bedrijf, '
          + 'dan land je aan de ingang die het bedrijf gebruikt; kent hij het niet, dan blijft '
          + 'de kaartspeld over. Is er niets om op te varen, dan verschijnt de knop niet.',
      },
      {
        label: 'Fix',
        title: 'Het adres stopte bij de gemeente',
        body:
          'Op bonnen waar boven het adres al een gemeente stond, hield de lezer daar op en '
          + 'bleef de straat leeg — "Prins Boudewijnlaan 20" ontbrak terwijl ze op de bon '
          + 'stond. Er wordt nu doorgelezen tot de straat gevonden is.',
      },
      {
        label: 'Fix',
        title: 'Je nieuwe bon stond niet in de pool',
        body:
          'Na het toevoegen sprong de app naar de open pool, maar de bon stond er niet. De '
          + 'app bewaarde de daggegevens vijf minuten en toonde die oude lijst. Na het '
          + 'toevoegen wordt ze nu ververst.',
      },
      {
        label: 'Verbeterd',
        title: 'Foto of bestand, niet allebei tegelijk',
        body:
          'Koos je "pdf opladen", dan vroeg de telefoon alsnog camera óf foto. Er zijn nu '
          + 'drie aparte knoppen — foto maken, foto kiezen, pdf kiezen — die elk meteen het '
          + 'juiste scherm van je toestel openen.',
      },
      {
        label: 'Fix',
        title: 'Elke foutmelding komt aan bij de knop',
        body:
          'Weigerde de server de bon, dan bleef die uitleg soms bij een veld hangen dat je '
          + 'niet in beeld had, en leek de knop simpelweg niets te doen. Alle meldingen '
          + 'verschijnen nu bij de knop waar je op duwt.',
      },
    ],
  },
  {
    version: 'v1.56',
    date: '10 september 2026',
    changes: [
      {
        label: 'Fix',
        title: 'Het adres wordt weer gelezen',
        body:
          'Op bonnen waar het adres bóven zijn eigen opschrift staat, bleef het veld leeg en ' +
          'kwam de straat in het contactvak terecht. Dat is rechtgezet — en de gemeente wordt ' +
          'nu ook herkend als de bon zowel de straat als de plaats in hoofdletters drukt.',
      },
      {
        label: 'Verbeterd',
        title: 'De knop zegt wat er ontbreekt',
        body:
          'Klikken op "Zet in de open pool" met een leeg verplicht veld deed niets, zonder ' +
          'uit te leggen waarom. Klantnummer, naam, adres en gemeente zeggen nu zelf dat ze ' +
          'ingevuld moeten worden, zoals ticketnummer en omschrijving dat al deden.',
      },
      {
        label: 'Nieuw',
        title: 'Een verkeerd gelezen straat wordt opgezocht',
        body:
          'De scan las "NAPELSTRAAT" waar "Napelsstraat" stond — een straat die niet bestaat ' +
          'en die geen kaart terugvindt. De straat wordt nu opgezocht bij de postcode die op ' +
          'de bon staat, en enkel overgenomen als die postcode klopt. Een aangepaste straat ' +
          'krijgt het label "aangepast", zodat je ze altijd zelf kan nakijken.',
      },
      {
        label: 'Nieuw',
        title: 'De klantnaam wordt voorgesteld',
        body:
          'Kon de scan de naam niet lezen, dan wordt gekeken welk bedrijf op dat adres ' +
          'gekend is. Straat, huisnummer én postcode moeten alle drie kloppen voor er iets ' +
          'wordt voorgesteld — de buurman invullen is erger dan het veld leeg laten. Zo\'n ' +
          'naam krijgt het label "voorstel": ze stond niet op de bon.',
      },
      {
        label: 'Nieuw',
        title: 'Een nieuwe locatie komt meteen op de kaart',
        body:
          'De coördinaten van een locatie werden pas opgezocht wanneer je een dagroute ' +
          'berekende. Dat gebeurt nu bij het aanmaken, één keer in plaats van telkens ' +
          'opnieuw. Lukt het niet, dan verandert er niets: de route zoekt ze alsnog op.',
      },
      {
        label: 'Verbeterd',
        title: 'Na het toevoegen van een bon zie je de pool',
        body:
          'Je belandde op de werkbon die je net zelf had ingevuld en moest terug om te zien ' +
          'of ze goed aangekomen was. Nu spring je meteen naar de open pool.',
      },
      {
        label: 'Fix',
        title: 'Twee leesfouten op gefotografeerde bonnen',
        body:
          'Het letterje van de kolom plakte aan het klantnummer wanneer de spatie wegviel: ' +
          '"L 6950" werd "L6950", een klant die niet bestaat. En de leverdatum uit het vakje ' +
          'ernaast belandde achter de toestelomschrijving. Beide zijn opgelost.',
      },
    ],
  },
  {
    version: 'v1.55',
    date: '10 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Meerdere techniekers op één werkbon',
        body:
          'Open je een bon, dan sta jij er al in. Daarnaast kan je collega\'s aantikken die ' +
          'meegewerkt hebben — ook wie niet vooraf toegewezen was, want wie meegaat om een ' +
          'friteuse te lichten moet je kunnen noteren zonder eerst de planning aan te passen. ' +
          'Alle namen komen op de TECHNICUS-regel van de PDF en het aantal personen volgt vanzelf.',
      },
      {
        label: 'Nieuw',
        title: 'Melding bij een werkbon',
        body:
          'Bij het aanmaken van een werkbon kan je een melding meegeven, zoals "klant eerst ' +
          'bellen op 0477/93 15 70" of "kan enkel op voormiddag". Ze verschijnt als een rood ' +
          'uitroepteken in de lijst — tik erop voor de tekst — en staat bovenaan de werkbon, ' +
          'als eerste wat je ziet. Ze komt bewust niet op de PDF: dat is het document dat de ' +
          'klant tekent.',
      },
      {
        label: 'Verbeterd',
        title: 'Een melding aanpassen kan enkel wie ze schreef',
        body:
          'Wie de melding schreef ziet de knoppen om ze aan te passen of te verwijderen; ' +
          'iemand anders leest ze alleen. De server controleert dat ook zelf, niet enkel de knop.',
      },
    ],
  },
  {
    version: 'v1.54.0',
    date: '10 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Werkbon uploaden als foto of PDF',
        body:
          'Een werkbon die op papier of als PDF binnenkomt kan nu geüpload worden via de cameraknop ' +
          'in de dagweergave. Bij een foto zet je de vier hoeken van het blad; de bon wordt ' +
          'rechtgetrokken en uitgelezen. Je krijgt de velden naast de bon te zien en corrigeert ze ' +
          'voor de werkorder in de open pool komt. Uitlezen gebeurt op onze eigen server — er gaat ' +
          'geen klantgegeven naar een externe dienst.',
      },
      {
        label: 'Nieuw',
        title: 'Elk uitgelezen veld toont hoe zeker het is',
        body:
          'Een veld dat uit zijn eigen vak van de bon komt is stil; een veld dat elders teruggevonden ' +
          'is krijgt "nakijken" en een veld dat nergens stond "niet gevonden". OCR verwisselt een 0 ' +
          'en een O zonder te twijfelen, en juist bij een klantnummer als K04647 is dat stil en duur.',
      },
      {
        label: 'Verbeterd',
        title: 'De open pool toont tien bonnen in plaats van vier',
        body:
          'Nu er papieren bonnen bij komen, vulde de pool sneller dan hij getoond werd en kon een ' +
          'nieuwe bon onzichtbaar blijven achter oudere. Tijdelijk verhoogd tot tien, tot kantoor de ' +
          'volledige pool kan zien en zelf kan bepalen welke werkorders een technieker te zien krijgt.',
      },
      {
        label: 'Verbeterd',
        title: 'Een geüploade bon kan niet dubbel aangemaakt worden',
        body:
          'Verstuurt de telefoon dezelfde upload twee keer, of tik je twee keer op bevestigen, dan ' +
          'komt er één werkorder. Zonder verbinding blijft de bon lokaal bewaard tot je weer online ' +
          'bent, en een bestaand ticketnummer verwijst naar de bestaande werkbon.',
      },
    ],
  },
  {
    version: 'v1.53.2',
    date: '9 september 2026',
    changes: [
      {
        label: 'Fix',
        title: 'Bestaande klant werd gedupliceerd bij het aanmaken van een werkbon',
        body:
          'Zestien van de zeventien klanten hebben nog geen klantnummer. De wizard stuurde dan het ' +
          'interne id als nummer, de server vond niets en maakte een tweede kopie van dezelfde klant. ' +
          'Een bestaande klant, locatie of toestel wordt nu op id gekozen, en enkel een echt nieuwe ' +
          'wordt aangemaakt.',
      },
      {
        label: 'Fix',
        title: 'Ingevulde werkbon kon overschreven of teruggezet worden',
        body:
          'Drie problemen met het lokale concept: typen tijdens het laden werd overschreven, het concept ' +
          'kwam terug na het afsluiten van de bon, en een onaangeraakt formulier bewaarde zichzelf al. ' +
          'Wat de technieker typt wint nu altijd.',
      },
      {
        label: 'Fix',
        title: 'Foutmeldingen bij het aanmaken waren onzichtbaar',
        body:
          'Werd een klant- of locatieveld geweigerd, dan verscheen er niets en werd de knop gewoon ' +
          'opnieuw actief. Elke foutmelding is nu zichtbaar, en "Ticket bestaat al" is nu een echte ' +
          'link naar de bestaande werkbon.',
      },
      {
        label: 'Fix',
        title: 'Bon kon twee keer afgesloten worden',
        body: 'Na het afsluiten bleef de knop actief; een tweede tik maakte stil een tweede bon (-02).',
      },
      {
        label: 'Fix',
        title: 'Lange onderdeelomschrijvingen vielen weg op de PDF',
        body:
          'Enkel de eerste regel werd afgedrukt, op precies de lijst die de klant tekent. Lange ' +
          'omschrijvingen lopen nu door binnen de rij, de vervolgpagina heeft kolomtitels, en ' +
          '"dringend" blijft staan.',
      },
    ],
  },

  {
    version: 'v1.53.1',
    date: '9 september 2026',
    changes: [
      {
        label: 'Fix',
        title: 'PDF-lijnen kloppen nu met de papieren bon',
        body:
          'De doorlopende kaderlijnen links en rechts ontbraken, het blok met materialen en ' +
          'bezoekgegevens stond ongeveer 20 mm te laag, het technicus-rapport had vijf lijnen ' +
          'in plaats van drie, en de lijn onderaan stond onder de bankgegevens in plaats van ' +
          'erboven. Opgemeten op de ingescande bon en gecorrigeerd.',
      },
      {
        label: 'Verbeterd',
        title: 'Contact en telefoonnummer onder elkaar',
        body:
          'CONTACT en Tel & GSM staan nu met het label boven de waarde, net als de rest van het ' +
          'klantenblok en net als op papier.',
      },
    ],
  },

  {
    version: 'v1.53',
    date: '9 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Service Bon: alle velden van de papieren werkbon',
        body:
          'De werkbon volgt nu de papieren Service Bon: ticket- en bonnummer, klantnummer L/F, ' +
          'contact, sluitingsdag, unit/leverdatum/garantie, technicus rapport, materialen, ' +
          'bezoekdatum, aankomst- en vertrekuur, week/weekend, aantal ritten en personen, ' +
          'opmerkingen en handtekening.',
      },
      {
        label: 'Nieuw',
        title: 'Werkbon aanmaken vanuit de app',
        body:
          'De wizard onder "+" op het dagoverzicht zoekt echte klanten, locaties en toestellen, ' +
          'laat nieuwe aanmaken en sluit af met een ticketstap. Een toestel is niet meer verplicht ' +
          'bij aanmaak — de technieker kiest het ter plaatse.',
      },
      {
        label: 'Nieuw',
        title: 'ERP-koppeling: tickets ontvangen',
        body:
          'POST /api/erp/work-orders neemt een ticket aan in Service Bon-formaat. Het bestaande ' +
          'GET-export geeft nu ook ticketnummer en alle bonvelden terug.',
      },
      {
        label: 'Nieuw',
        title: 'PDF is een replica van de papieren bon',
        body:
          'De gegenereerde PDF heeft dezelfde indeling, tweetalige labels, logo en bankgegevens ' +
          'als de papieren Service Bon, en kan later opnieuw gegenereerd worden.',
      },
      {
        label: 'Verbeterd',
        title: 'Concept van de werkbon blijft bewaard',
        body:
          'Elke wijziging wordt lokaal (IndexedDB) opgeslagen; na een refresh of een lege batterij ' +
          'staat alles nog ingevuld.',
      },
      {
        label: 'Fix',
        title: 'Ongeldige onderdelenlijst wordt geweigerd',
        body:
          'Het afsluiten van een werkbon met een kapotte onderdelenlijst geeft nu een foutmelding ' +
          'in plaats van stil niets op te slaan.',
      },
      {
        label: 'Fix',
        title: 'Werkbonnen zonder toestel verdwenen uit het magazijn',
        body:
          'Een werkorder zonder gekend toestel viel uit de magazijnwachtrij en uit het dagoverzicht. ' +
          'Beide lijsten tonen die jobs nu wel.',
      },
    ],
  },

  {
    version: 'v1.52',
    date: '26 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.51',
    date: '26 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.50',
    date: '26 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.49',
    date: '26 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.48',
    date: '26 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.47',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.46',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.45',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.44',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.43',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.42',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.42',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Magazijn-stap bij opvolgbon',
        body: 'Bij een opvolgbon krijgt het magazijn nu eerst een taak "Onderdelen klaarzetten". Pas als het magazijn die afvinkt, wordt de taak "Onderdelen laden in bus" actief voor de technieker. Zo is het duidelijk wie wat doet en kan de technieker niet per ongeluk bevestigen dat hij onderdelen heeft voor het magazijn ze heeft klaargelegd.',
      },
    ],
  },

  {
    version: 'v1.41',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.40',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.39',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.38',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.37',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.36',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.35',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.34',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.33',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.32',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.31',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.30',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.29',
    date: '25 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },

  {
    version: 'v1.28',
    date: '25 april 2026',
    changes: [
      {
        label: 'Verbeterd',
        title: 'WerkbonForm opgesplitst in kleinere componenten',
        body:
          'Het centrale werkbonformulier was uitgegroeid tot bijna 1.500 regels code — te groot om nog overzichtelijk te onderhouden. ' +
          'Het is nu opgesplitst in vier afzonderlijke bestanden: Section (gedeelde wrapper), PartsSection (onderdelen), ' +
          'PhotoUploadSection (foto\'s) en TaskManager (activiteiten). ' +
          'De hoofdcomponent beheert enkel nog de globale formulierstatus. Werking verandert niet.',
      },
      {
        label: 'Verbeterd',
        title: 'Planningsvolgorde opslaan in een database-transactie',
        body:
          'Wanneer een technieker zijn dagroute herschikt, werden meerdere database-updates los na elkaar uitgevoerd. ' +
          'Als er eentje mislukte, bleef de database in een inconsistente staat. ' +
          'Alle updates (volgorde per werkbon + planningsversie ophogen) zitten nu in één transactie: ' +
          'slaagt één update niet, dan worden ze allemaal teruggedraaid.',
      },
      {
        label: 'Verbeterd',
        title: 'Onderdelen en opvolgacties opgeslagen als JSONB',
        body:
          'De velden voor onderdelen en opvolgacties werden als tekststring in de database bewaard, ' +
          'ook al zijn het eigenlijk JSON-objecten. Ze zijn nu omgezet naar het echte JSONB-type in PostgreSQL. ' +
          'Voordeel: PostgreSQL begrijpt de structuur, en de app hoeft niet meer handmatig te parsen via JSON.parse.',
      },
      {
        label: 'Verbeterd',
        title: 'Sync stopt niet meer bij een mislukte foto',
        body:
          'Als het uploaden of verwijderen van een foto mislukte tijdens de achtergrond-sync, ' +
          'stopte de volledige sync voor die werkbon. ' +
          'De sync gaat nu gewoon verder met de volgende foto. ' +
          'Andere kritische operaties (zoals volgorde-updates) stoppen nog wel bij een fout, ' +
          'omdat de volgorde daar wél belangrijk is.',
      },
      {
        label: 'Fix',
        title: 'Werkbon API crasht niet meer bij ongeldige JSON',
        body:
          'De API die een werkbon afslaat parste de onderdelen en opvolgacties direct via JSON.parse, ' +
          'zonder foutafhandeling. Als de offline-sync een beschadigde waarde doorstuurde, crashte het endpoint met een 500-fout ' +
          'en kon de technieker zijn werkbon niet opslaan. ' +
          'JSON.parse zit nu in een try-catch: bij ongeldige JSON wordt null opgeslagen in plaats van te crashen.',
      },
      {
        label: 'Fix',
        title: 'TypeScript herkent nu de structuur van JSONB-velden',
        body:
          'Na de JSONB-migratie behandelde TypeScript de vier nieuwe kolommen als het type unknown, ' +
          'waardoor je properties niet meer rechtstreeks kon benaderen zonder extra casting. ' +
          'Alle JSONB-kolommen zijn nu voorzien van een .$type<>()-override in het Drizzle-schema, ' +
          'zodat TypeScript weet dat het PdfPart[]- of PdfFollowUp[]-objecten zijn.',
      },
      {
        label: 'Fix',
        title: 'Planningsvolgorde update werkt correct bij lege dagroute',
        body:
          'Als een technieker een lege dagplanning had en toch een volgorde-update stuurde, ' +
          'genereerde de query inArray(workOrders.id, []) — een lege IN-lijst die ongeldige SQL oplevert in sommige versies van Drizzle. ' +
          'De update wordt nu overgeslagen als de lijst leeg is.',
      },
    ],
  },

  {
    version: 'v1.27',
    date: '24 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Taak "onderdelen laden in bus" bij opvolgbon',
        body:
          'Wanneer een opvolgbon aangemaakt wordt, krijgt de werkbon automatisch twee taken: ' +
          '"Onderdelen laden in bus" voor de technieker (bevestigt dat de onderdelen in de bestelwagen zitten) ' +
          'en "Opvolgbon inplannen" voor de planning. ' +
          'De laak-taak wordt direct gekoppeld aan de lead-technieker van de originele werkbon. ' +
          'Als de planning een andere technieker toewijst via het nieuwe toewijsscherm, ' +
          'schuift de taak automatisch mee naar die persoon.',
      },
      {
        label: 'Nieuw',
        title: 'Werkbon toewijzen zonder datum — blijft zichtbaar in open pool',
        body:
          'De planning kan een technieker koppelen aan een opvolgbon nog vóór er een datum vastligt. ' +
          'Zolang er geen geplande datum is, blijft de werkbon zichtbaar in de open pool: ' +
          'elke technieker (ook de toegewezen persoon) kan ze oppikken zodra hij/zij tijd heeft. ' +
          'Pas wanneer de planning een concrete datum koppelt, verdwijnt de bon uit de open pool ' +
          'en verschijnt ze in de dagplanning van de betrokken technieker.',
      },
    ],
  },

  {
    version: 'v1.26',
    date: '24 april 2026',
    changes: [
      {
        label: 'Fix',
        title: 'Open pool toont nieuwe opvolgbonnen direct na aanmaken',
        body:
          'De app synchroniseerde vroeger slechts één keer per dag, waardoor nieuw aangemaakte opvolgbonnen ' +
          'pas de volgende ochtend verschenen in de open pool. ' +
          'De cache vervalt nu elke 5 minuten, zodat een technieker een nieuwe bon ziet ' +
          'zonder de app opnieuw op te starten.',
      },
    ],
  },

  {
    version: 'v1.25',
    date: '24 april 2026',
    changes: [
      {
        label: 'Fix',
        title: 'Opvolgbonnen verschijnen nu correct in de open pool',
        body:
          'Opvolgbonnen met status "aangemaakt" werden niet getoond in de open pool omdat de query ' +
          'alleen werkbonnen zonder toewijzing ophaalde. ' +
          'De open pool toont nu alle werkbonnen met status "aangemaakt" (ongeacht toewijzing) — ' +
          'de status is de enige bepalende factor.',
      },
    ],
  },

  {
    version: 'v1.24',
    date: '24 april 2026',
    changes: [
      {
        label: 'Fix',
        title: 'Versienummer badge werd niet correct opgehoogd',
        body:
          'Het script dat het versienummer ophoogde las per ongeluk het eerste `version:`-veld in het bestand ' +
          'in plaats van de `CURRENT_RELEASE_VERSION`-constante. ' +
          'Hierdoor bleef het badge na meerdere deploys hetzelfde getal tonen. ' +
          'Het script leest nu de correcte constante en increment altijd het actieve versienummer.',
      },
    ],
  },

  {
    version: 'v1.23',
    date: '24 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Automatische versienummering bij elke staging-deploy',
        body:
          '`make staging-up` verhoogt nu automatisch het versienummer, ' +
          'commit alle gewijzigde bestanden en plaatst een TO-DO-blok in `STAGING-TODO.md` ' +
          'met de gewijzigde bestanden, een herinnering om de changenotes in te vullen en een reminder ' +
          'om nieuwe lessen toe te voegen. ' +
          'Zo is er altijd een traceerbare link tussen een deploy en de bijhorende wijzigingen.',
      },
    ],
  },

  {
    version: 'v1.22',
    date: '23 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Magazijnierspagina voor het opvolgen van onderdelenbestellingen',
        body:
          'De nieuwe pagina `/magazijn` toont alle openstaande `order_part`-taken gegroepeerd per werkorder. ' +
          'De magazijnier ziet klant, site, toestel en elk afzonderlijk onderdeel met artikelcode en aantal. ' +
          'Twee acties: "Besteld ✓" zet een onderdeel van "Te bestellen" naar "Besteld", ' +
          '"Ontvangen ✓" sluit het af als ontvangen. Ontvangen onderdelen verdwijnen niet maar ' +
          'verschuiven naar een inklapbare "Vandaag ontvangen"-sectie onderaan.',
      },
      {
        label: 'Nieuw',
        title: 'Nieuwe opvolgbon aanmaken vanuit de werkbon',
        body:
          'Zodra alle onderdelen van een bestelling ontvangen zijn (status "Alle ontvangen"), ' +
          'activeert de knop "Nieuwe Opvolgbon" in de bestellingskaart. ' +
          'Eén klik maakt automatisch een nieuwe werkbon aan voor dezelfde klant, site en toestel — ' +
          'met de bestelde onderdelen al ingevuld als verbruikte onderdelen. ' +
          'Beide werkbonnen krijgen een tijdlijn-event: de originele toont "opvolgbon aangemaakt", ' +
          'de nieuwe toont "aangemaakt als opvolging van…".',
      },
      {
        label: 'Nieuw',
        title: 'Bestellingskaart op de werkbon met PDF-afdruk en actiebalk',
        body:
          'De inklapbare bestellingskaart op de werkbon toont alle `order_part`-taken gegroepeerd per type ' +
          '(stock aanvullen vs. bestellen bij leverancier). In de uitgevouwen actiebalk staan twee knoppen: ' +
          '"Print PDF" genereert meteen een bestelblad met artikelcodes, beschrijvingen, merk en leverancier. ' +
          '"Nieuwe Opvolgbon" wordt actief zodra alle onderdelen ontvangen zijn.',
      },
      {
        label: 'Nieuw',
        title: 'Makefile voorkomt staging-heropbouw zonder omgevingsvariabelen',
        body:
          'Een Makefile bundelt de veelgebruikte stagingcommando\'s. `make staging-up` zorgt altijd dat ' +
          '`--env-file .env.staging.local` meegegeven wordt. Zo is het niet meer mogelijk om de app te bouwen ' +
          'met lege databasewachtwoorden of ontbrekende API-sleutels.',
      },
      {
        label: 'Fix',
        title: 'Magazijnovergangen werkten niet door foreign key-fout',
        body:
          'De "Ontvangen ✓"-knop gaf een databasefout omdat het veld `completedBy` een foreign key is naar ' +
          'de `technicians`-tabel. Strings zoals `\'warehouse\'` of `\'erp\'` zijn geen geldige technicien-IDs. ' +
          'Opgelost door `completedBy` op `null` te zetten wanneer er geen echte technicien-ID beschikbaar is.',
      },
    ],
  },
  {
    version: 'v1.21',
    date: '16 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Foto’s toevoegen aan de werkbon',
        body:
          'Op de werkbon staat nu een aparte fotozone waar de technieker een foto kan nemen ' +
          'met de camera of een bestaande foto uit de galerij kan kiezen.',
      },
      {
        label: 'Verbeterd',
        title: 'Foto’s blijven lokaal bewaard tot er verbinding is',
        body:
          'Nieuwe werkbonfoto’s worden eerst lokaal opgeslagen in IndexedDB. Daardoor gaan ' +
          'ze niet verloren als de technieker offline werkt of tijdelijk geen bereik heeft.',
      },
      {
        label: 'Verbeterd',
        title: 'Duidelijke sync-status per foto',
        body:
          'Elke foto toont nu een kleine statusbadge: wacht op upload, mislukt of succesvol ' +
          'geupload. Zo ziet de technieker meteen wat al veilig op de server staat.',
      },
    ],
  },
  {
    version: 'v1.20',
    date: '14 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Activiteiten direct op de werkbon',
        body:
          'Open activiteiten staan nu in het avatar- en instellingenmenu met een teller, ' +
          'en linken rechtstreeks naar de juiste werkbon. In de activiteitenlog kan je ' +
          'activiteiten compacter bekijken, aanmaken en beheren.',
      },
      {
        label: 'Verbeterd',
        title: 'Planning en instellingen lopen nu consistenter samen',
        body:
          'Startuur, startlocatie en thuisadres gebruiken nu gedeelde settings in plaats ' +
          'van losse lokale staten. Daardoor blijven avatar, planning en routeberekening ' +
          'beter op elkaar afgestemd.',
      },
      {
        label: 'Fix',
        title: 'Adressen met natuurlijke schrijfwijze werken beter',
        body:
          'Adresinvoer zoals "Lintsesteenweg 25 in Kontich" wordt nu robuuster genormaliseerd ' +
          'voor zowel de zoekbalk als de route-geocoder. Daardoor blijven zoekresultaten en ' +
          'dynamische reistijden beter werken bij vrije invoer.',
      },
    ],
  },
  {
    version: 'v1.13',
    date: '12 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Werkbonnen tabel — elke opslag maakt een nieuw record',
        body:
          'Elke keer dat je op "PDF Genereren & Opslaan" klikt, wordt een nieuw werkbon-record ' +
          'aangemaakt in de database. Zo wordt niets meer overschreven en is de volledige ' +
          'geschiedenis van alle ingevulde werkbonnen per toestel bewaard.',
      },
      {
        label: 'Nieuw',
        title: 'PDF bekijken via historiek',
        body:
          'De PDF-link in de historiek werkt nu correct. De bestanden worden bewaard op de server ' +
          'en opgediend via een beveiligde API-route — ook in de standalone Docker-build.',
      },
      {
        label: 'Verbeterd',
        title: 'Opvolgacties worden ook opgeslagen bij de werkbon',
        body:
          'Naast omschrijving, onderdelen, start- en eindtijd worden nu ook de opvolgacties ' +
          'bewaard als onderdeel van de werkbon in de database.',
      },
    ],
  },
  {
    version: 'v1.12',
    date: '12 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Volledige auditlog op de database',
        body:
          'Elke INSERT, UPDATE en DELETE op alle tabellen (werkorders, klanten, sites, ' +
          'toestellen, techniekers, toewijzingen, documenten) wordt automatisch gelogd ' +
          'via PostgreSQL-triggers. De auditlog bevat de volledige oude en nieuwe rij ' +
          'als JSON, tijdstip en wie de wijziging maakte.',
      },
      {
        label: 'Nieuw',
        title: 'Werkbon slaat start- en eindtijd op in de database',
        body:
          'Naast de omschrijving en onderdelen worden nu ook werkStart en werkEinde ' +
          'als tijdstempel opgeslagen bij het afwerken van een werkbon. ' +
          'Zo is de volledige tijdregistratie traceerbaar per job.',
      },
      {
        label: 'Verbeterd',
        title: 'Auditlog weet wie een wijziging maakte',
        body:
          'De API-routes stellen een sessievariabele in (app.current_user) voor elke ' +
          'databasetransactie. De trigger leest deze variabele en slaat het technician-id ' +
          'of "admin" op in de log — zonder dat de logtabel zelf aangepast hoeft te worden.',
      },
    ],
  },
  {
    version: 'v1.11',
    date: '12 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Toestelkaart met documenten en historiek op de werkbon',
        body:
          'Op elke werkbon staat nu een inklapbare toestelkaart met merk, model, serienummer ' +
          'en installatiedatum. Daaronder staan vier iconen: elektrisch schema, onderdelenlijst, ' +
          'servicehandleiding en historiek. De drie documenten zijn gekoppeld aan het toesteltype ' +
          '(brand + model), de historiek aan het serienummer.',
      },
      {
        label: 'Nieuw',
        title: 'Interventiegeschiedenis per toestel',
        body:
          'Het historiekicoon toont een badge met het aantal eerdere afgewerkte jobs voor dat ' +
          'specifieke toestel. Klik erop om de lijst uit te klappen met datum, type en melding ' +
          'van elke vorige interventie. De huidige job wordt automatisch uitgesloten.',
      },
      {
        label: 'Nieuw',
        title: 'API voor toesteldocumenten en toestelhistoriek',
        body:
          'Twee nieuwe API-routes: GET /api/devices/documents haalt de 3 bestandspaden op per ' +
          'brand+model, POST /api/devices/documents uploadt een PDF. GET /api/devices/[id]/history ' +
          'geeft de afgewerkte werkorders terug voor een specifiek toestel.',
      },
      {
        label: 'Verbeterd',
        title: 'Rijkere stagingdata met historisch toestel en extra open-pooljobs',
        body:
          'Winterhalter PT-L (Rustoord Ennea) heeft nu 3 historische jobs en staat vandaag ' +
          'opnieuw ingepland als dringende storing. De open pool bevat 2 extra jobs: ' +
          'Electrolux SkyLine Pro 20GN (WZC Helianthus) en Rational iCombi Pro 6-1/1 ' +
          '(Hotel Scheldezicht).',
      },
    ],
  },
  {
    version: 'v1.10',
    date: '11 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Rijkere staging-database met ongeveer 15 klanten',
        body:
          'De staging database bevat nu een veel grotere en realistischer dataset, ' +
          'met extra klanten, sites en toestellen. Daardoor kunnen we de volgende ' +
          'versies testen op meerdere toestellen per klant zonder eerst opnieuw ' +
          'basisdata te moeten uitvinden.',
      },
      {
        label: 'Verbeterd',
        title: 'Bestaande planningsklanten kregen veel meer toestellen',
        body:
          'De klanten die vandaag al in de planning zitten zijn bewust het sterkst ' +
          'uitgebreid. Dat maakt het mogelijk om in de volgende versie extra ' +
          'opdrachten op dezelfde site voor een ander toestel te simuleren.',
      },
      {
        label: 'Verbeterd',
        title: 'Historische dummy werkorders in de database',
        body:
          'Voor de belangrijkste bestaande klanten en toestellen zijn oudere ' +
          'afgewerkte werkorders toegevoegd in de database. Die zijn nog niet in ' +
          'de huidige UI zichtbaar, maar vormen wel het fundament voor de ' +
          'toestelgeschiedenis die we in de volgende versie willen tonen.',
      },
    ],
  },
  {
    version: 'v1.9',
    date: '11 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Eerste gedeelde PostgreSQL-dataslice',
        body:
          'De service-app heeft nu een echte serverdatalaag met PostgreSQL + Drizzle ' +
          'voor techniekers, klanten, sites, toestellen, werkorders en toewijzingen. ' +
          'De mock-structuur is vertaald naar relationele tabellen zodat staging niet ' +
          'meer alleen op losse demo-arrays hoeft te draaien.',
      },
      {
        label: 'Nieuw',
        title: 'Ochtendsync leest echte dagplanning via API',
        body:
          'De ontbrekende route `GET /api/sync/today` is toegevoegd. Die levert nu ' +
          'geplande jobs en open pool-items uit de serverlaag, met dezelfde cap van ' +
          'max. 6 geplande en 4 open interventies voor offline gebruik.',
      },
      {
        label: 'Verbeterd',
        title: 'Dagoverzicht leest uit cache en sync in plaats van directe mock-data',
        body:
          'Het homescreen haalt de planning nu eerst uit IndexedDB en synchroniseert ' +
          'vervolgens met de server als de dag nog niet vers is. Daardoor krijgt de ' +
          'offline flow eindelijk een echte read-path in plaats van vaste mock imports.',
      },
      {
        label: 'Verbeterd',
        title: 'Interventiedetail heeft serverfallback',
        body:
          'De werkbonpagina zoekt een interventie eerst lokaal in de offline cache ' +
          'en valt daarna terug op een echte API-route per interventie. Rechtstreekse ' +
          'navigatie naar een job hangt daardoor niet meer af van `lib/mock-data.ts`.',
      },
      {
        label: 'Verbeterd',
        title: 'DB tooling splitst host- en Docker-verbindingen',
        body:
          'De Docker-envs zijn opgesplitst zodat de app-container `db` gebruikt en ' +
          'host-tools zoals Drizzle/seed lokaal via `localhost` kunnen werken. Dat ' +
          'maakt `db:push` en `db:seed` voorspelbaar zodra de target Postgres draait.',
      },
    ],
  },
  {
    version: 'v1.8',
    date: '11 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Adres typen als vertrek- of eindpunt',
        body:
          'Je kan nu een vrij adres intypen als start- of eindlocatie van je route. ' +
          'Het systeem zoekt automatisch de GPS-coördinaten op via Nominatim ' +
          '(OpenStreetMap) — geen vaste lijst meer nodig.',
      },
      {
        label: 'Verbeterd',
        title: 'Route herberekent automatisch',
        body:
          'Bij elke wijziging (ander adres, volgorde, pauze verplaatst) wordt de ' +
          'route automatisch opnieuw berekend. Een debounce van 350 ms zorgt dat ' +
          'het niet bij elke toetsaanslag vuurt.',
      },
      {
        label: 'Verbeterd',
        title: 'Nauwkeurigere GPS-locatie bij pauze',
        body:
          'De app wacht nu op een nauwkeurige GPS-fix (< 50 m) in plaats van de ' +
          'eerste beschikbare schatting. Je ziet de nauwkeurigheid live aftellen ' +
          '(bv. "±120 m → ±18 m") terwijl de GPS verbeert. Na 20 seconden toont ' +
          'de app de best beschikbare positie.',
      },
      {
        label: 'Verbeterd',
        title: 'Tijdregistratie vereenvoudigd',
        body:
          '"Aankomst" is verwijderd. De eerste knop heet nu "Start werk" en zet ' +
          'de status meteen op Bezig. Na registratie kan je de tijd nog aanpassen ' +
          'door erop te tikken — de native tijd-picker opent.',
      },
      {
        label: 'Verbeterd',
        title: 'Opvolgacties overzichtelijker',
        body:
          '3 prioriteitsniveaus in plaats van 4: Laag, Gemiddeld en Hoog. ' +
          'De knoppen staan als een segmented control boven het datumveld, ' +
          'dat kleiner en rechts uitlijnt voor een nettere look.',
      },
    ],
  },
  {
    version: 'v1.7',
    date: '10 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Echte rijtijden via OpenRouteService',
        body:
          'De route-timeline toont nu echte rijtijden en afstanden berekend ' +
          'via OpenRouteService. De dag wordt live herberekend na elke ' +
          'drag & drop. Zonder API key valt het systeem terug op mock-waarden.',
      },
      {
        label: 'Nieuw',
        title: 'GPS-coördinaten op alle locaties',
        body:
          'Elke site heeft nu lat/lon coördinaten (via Nominatim/OpenStreetMap). ' +
          'Het depot, klanten en nieuwe locaties zijn correct gepositioneerd ' +
          'in Oost-Vlaanderen.',
      },
      {
        label: 'Nieuw',
        title: 'Nominatim geocoder voor adres → coördinaten',
        body:
          'Nieuwe adressen kunnen automatisch omgezet worden naar GPS-coördinaten ' +
          'via de gratis Nominatim API (OpenStreetMap). Geen API key nodig.',
      },
      {
        label: 'Nieuw',
        title: 'Meer realistische demo-klanten',
        body:
          "Twee nieuwe klanten toegevoegd: Frituur 't Pleintje (Lokeren) en " +
          'Brasserie De Klok (Dendermonde). De dag bevat nu 6 geplande jobs ' +
          'met een route van ~148 km door Oost-Vlaanderen.',
      },
      {
        label: 'Verbeterd',
        title: 'Pauze geeft 0 reistijd',
        body:
          'De middagpauze wordt niet meer als verplaatsing geteld. Reistijd ' +
          'gaat van de job vóór de pauze naar de job erna — je blijft ter plaatse.',
      },
    ],
  },
  {
    version: 'v1.6',
    date: '9 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Route-timeline op het dagoverzicht',
        body:
          'De Planning-sectie is geen lijst meer maar een verticale route: ' +
          'Start → rijtijd → job → rijtijd → job → pauze → rijtijd → job → einde. ' +
          'Elke rijtijd wordt apart getoond, zodat je meteen ziet hoe je dag eruitziet.',
      },
      {
        label: 'Nieuw',
        title: 'Instelbare start- en eind-adres',
        body:
          'Bovenaan de timeline kan je je vertrekpunt kiezen. Met één vinkje ' +
          'zeg je "einde = start" als je terug naar het depot rijdt, of je ' +
          'kiest een ander eindadres (bv. je thuis).',
      },
      {
        label: 'Nieuw',
        title: 'Middagpauze als verplaatsbaar blok',
        body:
          'Er staat automatisch een pauze van 30 minuten middenin de dag. ' +
          'Sleep hem naar boven of beneden om hem op een andere plaats in je ' +
          'route te zetten.',
      },
      {
        label: 'Nieuw',
        title: 'Dagsamenvatting bovenaan',
        body:
          'Je ziet in één oogopslag hoeveel jobs je hebt, hoeveel werkuren er ' +
          'staan en hoeveel je in totaal zal moeten rijden. De cijfers worden ' +
          'live herberekend bij elke drag & drop.',
      },
      {
        label: 'Verbeterd',
        title: 'Scrollen + slepen samen',
        body:
          'Scrollen op mobiel werkt weer vlot. Slepen start alleen vanaf de ' +
          '⋮⋮ handle aan de linkerkant van een kaart, met een korte hold van ' +
          '250 ms zodat een snelle scroll nooit per ongeluk een drag wordt.',
      },
    ],
  },
  {
    version: 'v1.5',
    date: '9 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Planning / Open pool op het dagoverzicht',
        body:
          'De dag is nu opgesplitst in twee lijsten: "Planning" (door de dispatcher ' +
          'ingepland, in volgorde) en "Open pool" (flexibele jobs die je zelf kan ' +
          'oppikken als je tijd over hebt).',
      },
      {
        label: 'Nieuw',
        title: 'Drag & drop op je planning',
        body:
          'Sleep een geplande job via de handle links om de volgorde aan te passen ' +
          'aan je route. De nieuwe volgorde wordt later ook naar de server ' +
          'gesynchroniseerd zodat de dispatcher ziet hoe je de dag afwerkt.',
      },
      {
        label: 'Nieuw',
        title: 'Versie-badge rechtsonder',
        body:
          'Onderaan rechts zie je nu welke versie actief is. Op staging staat er ' +
          '"STAGING · v1.5" in oranje, op productie enkel het versienummer. Zo weet ' +
          'je altijd op welke omgeving je zit.',
      },
      {
        label: 'Verbeterd',
        title: 'Meer demo-jobs',
        body:
          'Het dagoverzicht toont nu 4 geplande jobs + 2 jobs in de open pool, ' +
          'zodat je de nieuwe layout en drag & drop kan testen.',
      },
    ],
  },
  {
    version: 'v1.4',
    date: '8 april 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Offline-cache voor interventies',
        body:
          'Interventies worden nu in IndexedDB bewaard (4 stores: interventions, ' +
          'werkbonnen, pendingWrites, dayMeta). Acties die je offline doet worden ' +
          'in een pending-queue gezet en automatisch verstuurd zodra je terug ' +
          'online bent.',
      },
      {
        label: 'Nieuw',
        title: 'Rijtijden via routing-service',
        body:
          'Een provider-agnostische routing-laag (IRoutingService) haalt rijtijden ' +
          'en afstanden op. Fase 1 gebruikt OpenRouteService (gratis); fase 2 zal ' +
          'TomTom gebruiken voor file-bewuste rijtijden — de business-logic ' +
          'verandert niet mee.',
      },
    ],
  },
]

const CURRENT_RELEASE_VERSION = 'v1.67'

const currentRelease = RELEASES.find(release => release.version === CURRENT_RELEASE_VERSION)

if (!currentRelease) {
  throw new Error(`Missing release entry for ${CURRENT_RELEASE_VERSION}`)
}

export const CURRENT_RELEASE = currentRelease
export const CURRENT_VERSION = CURRENT_RELEASE.version
