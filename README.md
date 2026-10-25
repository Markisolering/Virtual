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

## Samtal

Spelet har en inbyggd svensk samtalsmotor som fungerar utan internet. Den känner igen frågor om namn, jobb, ålder, hobbyer, mat, musik, varför personen är där och mycket mer, och svarar i personens egen stil.

För fria samtal kan du ange en egen Anthropic API-nyckel under **Inställningar**. Då spelas varje person av Claude (förvalt `claude-opus-5-5`, Sonnet 5.5 och Haiku 5.5 går också att välja) med en rollbeskrivning byggd från personens slumpade egenskaper. Svaren strömmas in i pratbubblan och varje person minns sitt samtal med dig. Anropen använder `fallbacks: "default"`, så att en förfrågan som säkerhetsfiltret nekar automatiskt provas på en annan modell. Om API:t inte går att nå tar den inbyggda motorn över.

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
