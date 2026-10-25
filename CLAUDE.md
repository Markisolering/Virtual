# Arbetsregler för det här repot

- **Skapa alltid en pull request mot `main` när ett arbete är klart och pushat.** Ägaren har ingen dator och slår ihop ändringar från mobilen; när PR:en är ihopslagen publiceras spelet automatiskt på GitHub Pages.
- Ägaren spelar spelet som installerad app (PWA) på mobilen. Varje bygge får ett nytt id i `public/sw.js` (via `vite.config.js`), och appen erbjuder då själv en uppdatering. Byts filer i `public/avatars/` eller `public/anims/` ut måste `MODELS` i `public/sw.js` höjas, annars behåller appen de gamla modellerna i cachen.
- Allt som syns i appen, och kodkommentarer, skrivs på svenska.
- Kontrollera ändringar med `npm run build` och gärna en skärmdump via Playwright innan de pushas.
- Modellerna konverteras med `tools/convert-rocketbox.mjs` (se kommentaren i filen). Kör inte om konverteringen i onödan; GLB-filerna är incheckade.
