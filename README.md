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

Varje skapad rörelse sparas i webbläsaren. Personerna kan sedan göra den igen, även utan AI: skriv till exempel "gör honnör". Det finns också färdiga rörelser som fungerar utan AI: *peka*, *tumme upp*, *buga*, *nicka*, *skaka på huvudet*, *armarna i kors*, *händerna på höfterna*, *hoppa*, *snurra*, *visa musklerna* och *fredstecken*.

### Betyg och inlärning

Efter varje rörelse visas ett betygskort i chatten: 👍 eller 👎. Vid 👎 väljer du vad som var fel (fel position, för snabb, för långsam, för stel, helt fel rörelse, eller skriv själv), och med AI-samtal gör personen genast om rörelsen med din kommentar i åtanke.

Betygen lär spelet att göra bättre rörelser (`src/learning.js`):

- **Förebilder:** rörelser med tummen upp skickas med som exempel när Claude skapar nya rörelser.
- **Lärdomar:** efter varje betyg sammanfattar en "rörelsecoach" (ett separat Claude-anrop) alla betyg till en kort lista med konkreta lärdomar, t.ex. "Honnör: armbåge ca 135°". Listan följer med till alla personer och samtal.
- Under ⚙︎ Inställningar ser du hur många rörelser som är inlärda, kan läsa lärdomarna och kan nollställa allt.

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
```
