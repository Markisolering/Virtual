# Vardagsrummet

Ett 3D-spel i förstapersonsperspektiv för mobilen (fungerar även på dator). Du rör dig i ett möblerat vardagsrum där slumpmässigt genererade personer kommer in genom dörren, sätter sig i soffan, tittar ut genom fönstret, hänger i köket och så småningom går därifrån. Du kan gå fram till vem som helst och prata med dem.

## Kom igång

```bash
npm install
npm run dev      # startar på http://localhost:5173 och visar en nätverksadress för mobilen
npm run build    # bygger en statisk version till dist/
```

Öppna nätverksadressen som `npm run dev` skriver ut i mobilens webbläsare (mobilen och datorn måste vara på samma nätverk). Mappen `dist/` kan läggas på vilken statisk webbhost som helst, till exempel GitHub Pages.

## Styrning

| | Mobil | Dator |
|---|---|---|
| Gå | Vänster tumme (virtuell joystick) | WASD, Shift för att springa |
| Titta | Dra med höger tumme | Dra med musen eller använd piltangenterna |
| Prata | Tryck på personen eller på pratbubblan | `E` |
| Stäng samtal | ✕ | `Esc` |

## Karaktärerna

Varje person får vid slumpen:

- **Utseende:** längd, kroppsbyggnad, hudton, ögonfärg, frisyr (kort, lång, page, knut, hästsvans, lockigt, afro, rakat, flint), skägg, glasögon, mössa eller keps, och kläder (t-shirt, tröja, skjorta, huvtröja, klänning, byxor, shorts, kjol) i olika färger.
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
src/characters.js   Generering av personer, kroppsmodell, animationer och beteende
src/nav.js          Rutnät, A*-vägplanering och kollision
src/dialogue.js     Inbyggd dialogmotor och Claude-integration
```
