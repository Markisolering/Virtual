# Vardagsrummet

Ett 3D-spel i förstapersonsperspektiv för mobilen (fungerar även på dator). Du rör dig i ett möblerat vardagsrum där slumpmässigt genererade personer kommer in genom dörren, sätter sig i soffan, tittar ut genom fönstret, hänger i köket och så småningom går därifrån. Du kan gå fram till vem som helst och prata med dem.

## Spela på mobilen (ingen dator behövs)

Spelet är en installerbar webbapp (PWA). När det är publicerat finns det på:

**https://markisolering.github.io/Virtual/**

- **Android-app (APK):** ladda ner den senaste versionen här: **https://github.com/Markisolering/Virtual/releases/latest/download/Vardagsrummet.apk**, öppna filen och tillåt installation från webbläsaren när telefonen frågar. Appen startar i helskärm och visar en banner när en ny APK finns.
- **iPhone (Safari):** öppna adressen, tryck på Dela och välj *Lägg till på hemskärmen*.
- **Android (Chrome):** öppna adressen och tryck på *Installera som app* på startskärmen (eller i menyn ⋮ → *Installera app*).

Appen öppnas sedan i helskärm från en egen ikon och fungerar även offline efter första starten.

### Publicera (görs en gång, går att göra från mobilen på github.com)

1. **Settings → Pages → Build and deployment → Source:** välj *GitHub Actions*.
2. Slå ihop koden till grenen `main`. Arbetsflödet `.github/workflows/deploy.yml` bygger och publicerar då spelet automatiskt vid varje ändring.

### Android-appen

Appen är ett tunt skal byggt med [Capacitor](https://capacitorjs.com) (mappen `android/`) som öppnar spelet från GitHub Pages i helskärm. Spelets innehåll uppdateras därför på samma sätt som webbappen, utan att APK:n behöver bytas. APK:n byggs av `.github/workflows/android.yml` och publiceras under *Releases* när något i `android/`, `capacitor.config.json` eller beroendena ändras på `main`.

Engångsinställning: lägg till hemligheten **KEYSTORE_PASSWORD** under *Settings → Secrets and variables → Actions* (ett långt lösenord som du hittar på själv). Första bygget skapar då signeringsnyckeln och sparar den krypterad i repot. Samma nyckel används sedan för alla versioner, så att nya APK:er kan installeras över de gamla.

### Uppdateringar

När en ny version har publicerats märker appen det själv, när den öppnas och var 20:e minut medan den är igång. Då visas en banner överst med knappen **Uppdatera**. Under ⚙︎ Inställningar finns appens version och knappen **Sök efter uppdatering**. Personmodellerna sparas mellan uppdateringar, så de behöver inte laddas ner igen.

## Utveckla på dator

```bash
npm install
npm run dev      # startar en utvecklingsserver och visar en nätverksadress för mobilen
npm run build    # bygger en statisk version till dist/
```

## Styrning

| | Mobil | Dator |
|---|---|---|
| Gå | Vänster tumme (virtuell joystick) | WASD, Shift för att springa |
| Titta | Dra med höger tumme | Dra med musen eller använd piltangenterna |
| Prata | Tryck på personen eller på pratbubblan | `E` |
| Stäng samtal | ✕ | `Esc` |

## Karaktärerna

Personerna är fotorealistiska 3D-modeller från [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) (MIT-licens): 40 olika vuxna med egna ansikten, frisyrer och kläder, riggade med ansiktsben. Animationerna (gå, stå, sitta, prata, lyssna, vinka) kommer från samma bibliotek. Huvud, käke och ögonlock styrs dessutom av koden, så att personerna tittar på dig, rör munnen när de pratar och blinkar.

Varje person får vid slumpen:

- **Utseende:** en av de 40 modellerna (samma person syns inte två gånger samtidigt) och en liten variation i längd.
- **Personlighet:** namn, ålder, yrke, hemstad, hobby, favoritmat, musiksmak, en egenhet, ett skäl att vara där och en av sju personligheter (vänlig, blyg, sarkastisk, entusiastisk, grinig, filosofisk, charmig) som styr hur personen pratar.
- **Beteende:** personerna hittar vägen runt möblerna med A*, sätter sig på lediga platser, går fram till saker i rummet, tittar på dig när du är nära och lämnar rummet efter en stund. Säger du hej då går de.

## Be personerna göra saker

Skriv vad du vill att personen ska göra, eller använd snabbknapparna i chatten:

| Exempel | Vad som händer |
|---|---|
| *Sätt dig i soffan*, *sätt dig vid matbordet* | Går till en ledig plats och sätter sig |
| *Res dig*, *stanna här*, *kom hit* | Ställer sig upp, stannar kvar eller kommer fram till dig |
| *Gå till köket / fönstret / bokhyllan / tv:n / dörren* | Går dit och stannar en stund |
| *Följ mig* | Följer efter dig i rummet tills du säger *stanna* eller *sluta följa* |
| *Dansa*, *vinka*, *klappa händerna*, *jubla*, *skratta*, *ta ett foto*, *sätt dig på huk*, *gäspa* | Gör gesten |
| *Gå härifrån*, *hej då* | Lämnar rummet |

Personerna svarar i sin egen stil; en grinig person suckar men gör det ändå. Med AI-samtal påslaget förstår de friare formuleringar ("orkar du inte sätta dig en stund?") eftersom Claude själv väljer handling via verktyget `gor_handling`.

## Egna rörelser som AI:n hittar på

Med AI-samtal påslaget kan personerna göra i princip vilken kroppsrörelse du ber om: "gör honnör", "visa hur stor fisken var", "gör en karatespark", "härma en apa". Claude beskriver då rörelsen med verktyget `skapa_rorelse` som nyckelbilder, alltså vinklar i grader för huvud, överkropp, armar, armbågar, handleder, händer (öppen, knytnäve, peka, tumme upp, fredstecken), ben och knän vid olika tidpunkter, plus höjd (hopp) och snurr. Spelet (`src/motion.js`) räknar fram en mjuk rörelse mellan nyckelbilderna och lägger den ovanpå den vanliga animationen. Rörelser för överkroppen går att göra sittande.

Vinklarna utgår från en neutral stående pose och personens egna riktningar ("lyft armen framåt 90" betyder samma sak för alla modeller), så Claude behöver inte känna till skelettet.

Varje skapad rörelse sparas i webbläsaren. Personerna kan sedan göra den igen, även utan AI: skriv till exempel "gör honnör". Det finns också färdiga rörelser som fungerar utan AI: *peka*, *tumme upp*, *buga*, *nicka*, *skaka på huvudet*, *armarna i kors*, *händerna på höfterna*, *snurra*, *visa musklerna*, *fredstecken* och akrobatiken nedan.

### Hela kroppen och poser som håller

AI:n är inte begränsad till de inspelade animationerna. Med `hela_kroppen` styr den hela skelettet fritt. `kropp_lutning`, `kropp_sida`, `hojd`, `kropp_framat` och `kropp_sidled` lutar och flyttar hela kroppen runt fötterna. `volt`, `hjulning` och `rulla` roterar den runt höften. Med `hall_kvar` stannar personen i posen tills du ber om något annat, och nästa rörelse börjar mjukt därifrån.

### Naturliga rörelser

- **Många leder:** utöver huvud, överkropp, armar, armbågar, handleder, ben, knän, axlar och fotleder finns höften (`hoft_framat/vrid/luta`), ländryggen (`landrygg_*`), bröstkorgen (`brost_*`), nacken (`nacke_*`), käken (`kake`), ögonen (`ogon_vrid/nick`), skulderbladen (`axel_framat`), underarmsvridning (`underarm_vrid`), handleden åt sidan (`handled_sida`), varje finger för sig (`pekfinger`, `langfinger`, `ringfinger`, `lillfinger`, `tumme`, `tumme_in`), att sprida fingrarna (`fingrar_isar`), benvridning (`ben_vrid`), fotleden åt sidan (`fot_sida`) och tårna (`tar`).
- **Mjuka kurvor:** en kubisk kurva går genom nyckelbilderna, så farten ändras jämnt i stället för att stanna i varje bild, och handformerna glider över i varandra.
- **Fjädrande leder:** varje led följer rörelsen som en fjäder. Kroppen accelererar och bromsar mjukt, och huvud, händer och fingrar släpar lite efter, som hos en människa.
- **Liv i poser:** den som håller en pose andas, flyttar vikten mellan benen och rör huvudet lite.
- **Kontakt med golv och möbler:** den som sitter, ligger, står på knä eller på händerna vilar mot underlaget. Med `luft` lämnar kroppen marken (hopp och voltor).
- **Inget går igenom något:** möblerna och väggarna finns som lådor och de andra personerna som kapslar. Går kroppen in i något knuffas den ut åt det håll den kom ifrån, och armar och ben vrids ut i sina leder, så att en hand som trycks mot bordet stannar på bordsskivan och den som rullar mot soffan stannar mot den.
- **Förflyttning:** slutar en rörelse på ett annat ställe (kullerbytta, hjulning) står personen kvar där efteråt.
- **Sitta rätt:** sittanimationerna är gjorda för en annan stol än möblerna. Den som sitter lyfts eller sänks så att baken och låren vilar på sitsen, flyttas fram så att knäna hamnar framför sitsens kant, och lutar sig mot ryggstödet om det finns ett. Möblerna har sina riktiga mått (dynor, rygg, armstöd och fritt utrymme under sitsen).
- **Armar och fötter utanför möbler** även i de vanliga animationerna, t.ex. händer mot armstödet eller fötterna under en stol.
- **Steg när man vänder sig:** den som vrider sig på stället tar små steg i stället för att glida runt på fötterna.
- **Resa sig:** "res dig" från golvet eller en möbel spelar en riktig rörelse: sätta sig upp, gå upp på huk och ställa sig.

Färdiga rörelser som fungerar utan AI: *hoppa*, *slå en kullerbytta*, *bakåtvolt*, *hjula*, *stå på händerna*, *rulla runt*, *lägg dig*, *lägg dig på magen*, *sätt dig på golvet*, *ställ dig på knä*, *lägg dig på bordet / soffbordet / i soffan*, *sätt dig på bordet / soffbordet* och *res dig*.

### Betyg och inlärning

Efter varje rörelse visas ett betygskort: 👍 (bra), ↗️ **Nästan** (inte bra, men åt rätt håll), 👎 (dålig), 🔁 **Igen** (gör rörelsen en gång till direkt) och ✋ **Visa** (se nedan). Vid ↗️ väljer du vad som ska justeras (mer, mindre, snabbare, långsammare, håll posen längre) och vid 👎 vad som var fel, skriver/säger det själv, eller väljer **Inget särskilt** för att bara ge betyget. Med AI-samtal gör personen genast om rörelsen: vid ↗️ justeras bara det du nämnde.

Betygen lär spelet att göra bättre rörelser (`src/learning.js`):

- **Förebilder:** rörelser med tummen upp skickas med som exempel när Claude skapar nya rörelser.
- **Lärdomar:** efter varje betyg sammanfattar en "rörelsecoach" (ett separat Claude-anrop) alla betyg till en kort lista med konkreta lärdomar, t.ex. "Honnör: armbåge ca 135°". Listan följer med till alla personer och samtal.
- Under ⚙︎ Inställningar ser du hur många rörelser som är inlärda, kan läsa lärdomarna och kan nollställa allt.

### Visa själv hur det ska se ut (✋ Visa)

Gör personen nästan rätt, t.ex. drar handen i luften i stället för över håret, trycker du ✋ **Visa** (`src/editor.js`):

1. Rörelsen fryses och kameran ställs runt personen. Dra med ett finger på bakgrunden för att vrida kameran och nyp för att zooma. Reglaget längst ner väljer ögonblick i rörelsen.
2. Dra ringarna: orange för händer och fötter, blå för huvudet (vart det tittar), grön för bröstet. Bara den kroppsdelen flyttas; armen eller benet böjs med automatiskt (enkel inverterad kinematik). Släpper du handen på kroppen, t.ex. på håret, läggs den mot ytan där.
3. Tryck **Nästa →**, skriv eller säg kort vad du gjorde ("lade handen på håret") och tryck **Spara och lär**.

Den rättade posen sparas i rörelsen och personen gör den direkt igen. Rättelsen (vinklarna före och efter, plus din förklaring) skickas till rörelsecoachen, som drar generella slutsatser, t.ex. vilka vinklar som behövs för att nå huvudet. Rättade rörelser blir också förebilder när Claude skapar nya rörelser.

## Byta kläder

"Ta på dig en röd tröja och svarta byxor", "byt till vita skor", "byt kläder" (slumpade färger) eller "ta på dig dina vanliga kläder igen". Modellerna har kläderna målade i samma textur som kroppen, så plagg kan inte bytas mot andra plagg (t.ex. byxor mot kjol). I stället färgas överdel, underdel och skor om (`src/clothes.js`). Mönster, veck och skuggor i tyget behålls, och huden känns igen och lämnas orörd. Med AI-samtal använder Claude verktyget `byt_klader`.

## Personerna gör saker med varandra

Be den du pratar med göra något med någon annan i rummet, med personens förnamn: "krama Wilma", "ge Johan en high five", "skaka hand med Axel", "dansa med Fatima", "prata med Wilma", "sätt dig bredvid Johan" eller "gå till Axel". Är det bara en till i rummet räcker "krama henne" eller "prata med varandra". Personen går fram till den andra, de vänder sig mot varandra och gör rörelser som passar ihop (`src/interact.js`). När de pratar syns replikerna i bubblor ovanför dem; med AI-samtal skriver Claude replikerna (verktyget `interagera`), annars väljs ett kort småprat.

## Prata med rösten

Under ⚙︎ Inställningar → **Samtal** väljer du hur samtalen ska fungera:

- **Samtalsvy:** *Kompakt* (standard) visar personens svar i en pratbubbla ovanför huvudet och bara en smal rad längst ner med textfält, mikrofon och skicka. *Chattruta* visar hela samtalet som förut.
- **Personens svar:** text, röst eller båda. Rösten är svensk och lite ljusare eller mörkare beroende på person, och munnen rör sig så länge rösten talar.
- **Mikrofonknapp:** tryck på 🎤 för att slå på inspelningen och prata fritt fram och tillbaka; tryck igen för att stänga av (se *Mikrofonen* ovan). Det du säger skickas direkt när du har slutat prata (kan stängas av).
- **Röst och taltempo:** välj bland telefonens svenska röster och testa dem.

I webbläsaren används webbläsarens inbyggda taligenkänning och talsyntes (`src/voice.js`). Android-appens webbvy saknar dem, så där används telefonens egna via pluginen `@capacitor-community/speech-recognition` och `@capacitor-community/text-to-speech`. Första gången frågar appen om lov att använda mikrofonen.

Betygskortet för rörelser visas i den kompakta vyn som en liten ruta ovanför raden, med rörelsens namn och 👍/👎.

### Mikrofonen

Mikrofonknappen slår inspelningen **på och av**. När den är på lyssnar spelet mening för mening tills du trycker igen. Varje mening skickas, och medan personen svarar pausas lyssnandet så att den inte hör sig själv. Stänger du av mitt i en mening skickas det som hunnit sägas.

En rad högst upp visar hela tiden vad mikrofonen gör: 🔴 *Lyssnar*, det den hör medan du pratar, ✓ *Uppfattat: …* när meningen har gått iväg, ⏸ *Väntar på svaret* och *Hörde inget*. Knappen är röd när den lyssnar och orange när den väntar. I inställningarna kan du i stället välja *En mening per tryck*.

## Egna avatarer från Avaturn

Under ⚙︎ Inställningar → *Personer* kan du välja **Egna avatarer från Avaturn** i stället för de inbyggda personerna.

- **Skapa med Avaturn** öppnar Avaturns redigerare i spelet. Där skapar du en fotorealistisk avatar (från selfies eller färdiga kroppar, frisyrer och kläder) och trycker på *Export*.
- **Ladda upp GLB-fil** tar en avatar som du har laddat ner från avaturn.me. Det fungerar också med andra avatarer med standardskelett, till exempel Ready Player Me och Mixamo.
- Avatarerna sparas i webbläsaren. I listan kan du ge dem namn, ange kön och ta bort dem.

Avatarerna rör sig precis som de inbyggda personerna, med samma animationer, egna rörelser, leder, kollisioner, redigerare, kläder och interaktioner (`src/retarget.js`). Ett osynligt Rocketbox-skelett gör allt som vanligt, och varje bildruta förs posen över till avataren:
- Båda skeletten ställs i samma T-pose när avataren laddas, så det spelar ingen roll om den sparades i T- eller A-pose.
- Det osynliga skelettets delar (rygg, armar, ben) görs lika långa som avatarens, så att händer och huvud hamnar på samma ställe.
- Ansiktsuttryck, blinkningar och läppsynk används om avataren har ARKit-uttryck (som Avaturn).

## Talking head

Välj **Talking head** på startskärmen eller under ⚙︎ Inställningar → *Läge*. En person står framför kameran, som bara visar huvudet och axlarna, som i ett videosamtal. Repliken visas som undertext. Dra för att vrida kameran lite, nyp eller scrolla för att zooma, och tryck på 🔄 för att träffa en ny person.

- **Bild:** smal bildvinkel som ett porträttobjektiv, porträttljus (huvudljus, fylljus och kantljus), kort skärpedjup så att bakgrunden blir suddig (BokehPass), hudmaterial med sammetsglans, och en svag vinjett och filmkorn. Kameran följer huvudet mjukt som en kameraman.
- **Läppsynk som följer rösten** (`src/face.js`): texten blir munformer (15 visem för svenska), och talsyntesen säger till när varje ord börjar (`onboundary` i webbläsaren, `onRangeStart` i Android-appen), så att munnen hoppar till rätt ord. Nästa munform tonas in innan den förra är klar, som när man pratar på riktigt, och käken följer med.
- **Ett levande ansikte:** huvudet rör sig hela tiden lite, mer när personen pratar. Betonade ord ger en nick och höjda ögonbryn, en fråga ger en lutning på huvudet och ord som "nej" och "inte" en liten huvudskakning. Blinkningarna är snabba och kommer oftare i pauser. Blicken byter fixeringspunkt med små ryck och tittar bort när personen tänker på ett svar. Medan du pratar eller skriver lyssnar personen och nickar ibland.
- Personer med täckt ansikte väljs bort automatiskt i det här läget.

## Huvudstudio (test)

Ett helt separat testläge med en egen renderare för så realistiska huvuden som möjligt (`src/studio/`). Välj **Huvudstudio (test)** på startskärmen eller under ⚙︎ → *Läge*; ← går tillbaka. Inget rum laddas, bara ett huvud i ett fotostudioljus. Dra för att vrida, nyp för att zooma ända in på ögat, 🔄 för en ny person, uttrycksknappar och ett textfält där personen säger det du skriver (med läppsynk).

### Skannat huvud (förval)

Under ⚙︎ → *Modell* väljer du mellan **Skannat huvud** och spelets egna personer. Det skannade huvudet är [ICT-FaceKit](https://github.com/ICT-VGL/ICT-FaceKit) (USC Institute for Creative Technologies, MIT-licens): en Light Stage-skanning med 26 719 hörn (52 000 trianglar) och allt som finns i ett riktigt huvud – munhåla, tandkött, tunga, tänder, ögonglober med hornhinna och iris, tårvätska längs ögonlocken, ögonfransar och ett skuggnät mellan ögonlock och öga (`src/studio/scanhead.js`, data i `public/scanhead/`).

- **Nya personer:** 🔄 blandar 24 formvariationer (identiteter) från skanningarna till ett nytt ansikte, och slumpar hudton, ögonfärg, hårfärg, skäggstubb, fräknar, rodnad, ålder, hårfäste och tröja.
- **Hudtexturer som bakas i appen** (`src/studio/skinbake.js`): skanningen har inga texturer, så de räknas fram på grafikkortet för varje person (4096 × 2048): hudfärg med blodfärg på kinder, näsa, öron och ögonlock, blåaktigt under ögonen, fläckar, fräknar och födelsemärken, läppar med amorbåge, ögonbryn strå för strå, skäggstubb och snaggat hår med mjukt hårfäste. En höjdkarta med porer (större på näsan), fina linjer, pannrynkor, kråksparkar, näs-läppveck och läpplinjer görs om till en normalkarta, och glansen varierar (blankare T-zon och läppar, mattare kinder och hår).
- **Ögon:** egen hornhinna (blank, med reflexer) framför irisgeometrin, iris med fibrer, krypter och krans i personens ögonfärg, ögonvita med blodkärl och mörkare limbus, samt skugga från ögonlocken.
- **Ansiktet rör sig:** 53 ansiktsformer i ARKit-stil styr läppsynken (munformerna byggs av formerna för käke, läppar och mungipor), uttrycken, blinkningarna och blicken, som söker kameran. Huvudet rör sig som i talking head-läget.
- Ljuset är fysikaliskt rimligt (verklig hudreflektans), med neutral tonmappning som behåller hudens färger.

- **Många polygoner** (`subdivide.js`): Loop-subdivision delar varje triangel i fyra och jämnar ut ytan, två gånger för huvudet (ca 45 000 trianglar i stället för ca 3 400) och en gång för halsen och axlarna. UV, hudvikter och alla 40 ansiktsformer räknas om, så läppsynk och uttryck fungerar som förut.
- **Hud** (`skin.js`): ljusspridning under ytan (rött sprids längst, mer där ytan är krökt), genomlysning i öron och näsvingar i motljus, diffust ljus mot en suddigare normalkarta, porer i en egen detaljkarta, två glanslager (fet yta och matt underlag) och lite sammetsglans. Bara det som har hudens färgton får hudljuset.
- **Ögon** (`eyes.js`): modellens ögon ersätts av ögonglober med välvd, blank hornhinna. Irisen ligger bakom hornhinnan och ses genom den med ljusbrytning (index 1,376), så den får djup. Kanten runt irisen är mörkare och ovanlocket skuggar. Färgerna hämtas från modellens egen ögontextur.
- **Hår** (`hair.js`): glansen löper längs stråna (anisotropi), mjuka kanter med alpha-to-coverage och sammetsglans i motljus.
- **Ljus och bild**: studiomiljö med ljuslådor som reflexer, huvudljus med mjuka skuggor (VSM), fylljus och kantljus, fyra ljusinställningar (studio, fönster, dramatiskt, kväll), kontaktskuggor (GTAO), AgX-tonmappning, kantutjämning med 4× MSAA, lite objektivfärgfel, vinjett och filmkorn. Upplösningen sänks eller höjs automatiskt så att bilden flyter.
- Allt kan slås av och på under ⚙︎, och **Håll in för att jämföra** visar originalet.

## Språk / Language

Appen finns på svenska och engelska. Välj språk högst upp på startskärmen eller under ⚙︎ Inställningar → *Språk / Language*. Allt följer med: gränssnittet, personernas namn och bakgrund, den inbyggda samtalsmotorn, kommandona ("sit on the sofa", "follow me", "wear a red shirt", "give Anna a hug"), Claudes instruktioner, rösten (en-US för tal och taligenkänning) och läppsynken. Nya användare får språket från telefonen; den som redan har använt appen fortsätter på svenska.

*The app is available in Swedish and English. Pick the language at the top of the start screen or under ⚙︎ Settings → Language. Everything follows: the interface, the people's names and backgrounds, the built-in conversation engine, commands, Claude's instructions, the voice (en-US speech and speech recognition) and lip sync.*

Texterna skrivs på svenska i koden och översätts med `t()` (`src/i18n.js`, ordlistan i `src/i18n-en.js`). Samtalsmotorn och kommandotolken har egna engelska versioner (`src/dialogue-en.js`, `src/commands-en.js`). `node tools/check-i18n.mjs` listar texter som saknar översättning.

## Närbildsläge

Välj **Närbild** på startskärmen (eller under ⚙︎ Inställningar → Läge). Då är det bara en eller två personer i rummet åt gången, och de visas i högre detalj:

- **Modeller:** detaljerade versioner med dubbelt så skarpa texturer (`public/avatars-hq/`, ca 2,4 MB per person) och 40 ansiktsuttryck från Rocketbox.
- **Läppsynk:** munnen formar ljuden i det personen säger (Oculus-visem, utifrån en enkel svensk uttalsmodell).
- **Ansiktsuttryck:** glad, skrattar, ledsen, arg, förvånad, fundersam och trött. De styrs av samtalet, av gester och, med AI-samtal, av Claude via verktyget `visa_kansla`.
- **Blick:** ögonen och huvudet söker ögonkontakt med dig, och ögonen gör små naturliga ryck. Blickstyrningen gäller även i det vanliga läget.
- **Ljus och bild:** ett mjukt porträttljus följer den du pratar med, och grafiken körs på högsta kvalitet (sänks automatiskt om telefonen inte hinner med).

## Vilka som syns

Under ⚙︎ Inställningar → **Personer i rummet** väljer du *Alla*, *Bara kvinnor* eller *Bara män*. Byter du går de som inte passar ut ur rummet, och nya personer som kommer in följer valet.

## Samtal

Spelet har en inbyggd svensk samtalsmotor som fungerar utan internet. Den känner igen frågor om namn, jobb, ålder, hobbyer, mat, musik, varför personen är där och mycket mer, och svarar i personens egen stil.

För fria samtal kan du ange en egen Anthropic API-nyckel under **Inställningar**. Då spelas varje person av Claude (förvalt `claude-opus-5-5`, Sonnet 5.5 och Haiku 5.5 går också att välja) med en rollbeskrivning byggd från personens slumpade egenskaper. Svaren strömmas in i pratbubblan och varje person minns sitt samtal med dig. Anropen använder `fallbacks: "default"`, så att en förfrågan som säkerhetsfiltret nekar automatiskt provas på en annan modell. Om API:t inte går att nå tar den inbyggda motorn över.

Instruktionerna till varje rollfigur låses när samtalet börjar, och det som ändras under samtalet (var personen är, humör, vilka som finns i rummet, nya lärdomar) skickas som systemmeddelanden efter spelarens repliker. Historiken byggs alltså bara på, vilket Claude Opus 5.5 kräver för att tidigare tankeblock ska gälla. Skulle API:t ändå svara 400 försöker appen automatiskt igen, först utan tankeblock och sedan med en sammanfattning av samtalet.

Nyckeln sparas bara i webbläsarens `localStorage` och skickas direkt från webbläsaren till Anthropic. Det passar för eget bruk. Om spelet ska publiceras för andra bör anropen gå via en egen server så att ingen nyckel ligger i klienten.

## Grafik

Three.js med fysikaliskt baserade material, ACES-tonemappning, solljus med skuggor genom fönstren, varma lampor, miljöreflektioner, procedurellt ritade texturer (trägolv, tapet, matta, tavlor, utsikt) samt efterbehandling med ambient occlusion (GTAO) och glöd. Kvaliteten väljs automatiskt (Mellan på mobil, Hög på dator) och sänks av sig själv om bildfrekvensen blir för låg. Den kan också ändras manuellt i inställningarna.

## Struktur

```
index.html          Gränssnitt: startskärm, HUD, chatt, inställningar
src/main.js         Rendering, efterbehandling, styrning, spawn av personer, chatt
src/room.js         Rummet, möblerna, ljussättningen, sittplatser och intressanta platser
src/textures.js     Procedurella canvas-texturer
src/characters.js   Laddning av modeller, animationer, blick, käke och beteende
src/persona.js      Slumpad personlighet och bakgrund
public/avatars/     Konverterade Rocketbox-modeller (GLB med WebP-texturer och meshopt-komprimering)
public/anims/       Animationer för kvinnor (f.glb) och män (m.glb)
public/sw.js        Service worker för offline och snabb start
tools/              Skript som konverterar Rocketbox (FBX + TGA) till GLB
src/nav.js          Rutnät, A*-vägplanering och kollision
src/dialogue.js     Inbyggd dialogmotor och Claude-integration
src/editor.js       Redigeraren där spelaren visar hur en rörelse ska se ut
src/clothes.js      Byta kläder (färga om överdel, underdel och skor)
src/interact.js     Personer som gör saker med varandra
src/avaturn.js      Egna avatarer: Avaturns redigerare, uppladdning och lagring i IndexedDB
src/retarget.js     För över posen från Rocketbox-skelettet till en avatar med standardskelett
src/face.js         Ansiktet som pratar: läppsynk, huvudrörelser, ögonbryn, blinkningar och blick
src/boot.js         Startfil: laddar huvudstudion eller spelet
src/studio/         Huvudstudion: egen renderare med subdivision, hud, ögon och hår, skannat huvud och bakade hudtexturer
public/scanhead/    Det skannade huvudet (ICT-FaceKit, konverterat med tools/convert-ictfacekit.mjs)
src/i18n.js         Språk: t() och översättning av gränssnittet (ordlistan i src/i18n-en.js)
src/dialogue-en.js  Engelsk samtalsmotor och engelska instruktioner till Claude
src/commands-en.js  Engelska kommandon och repliker
public/draco/       Draco-avkodare för komprimerade avatarer
```
