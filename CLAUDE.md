# Arbetsregler för det här repot

- **Skapa alltid en pull request mot `main` när ett arbete är klart och pushat.** Ägaren har ingen dator och slår ihop ändringar från mobilen; när PR:en är ihopslagen publiceras spelet automatiskt på GitHub Pages.
- Ägaren spelar spelet som installerad app (PWA) på mobilen. Varje bygge får ett nytt id i `public/sw.js` (via `vite.config.js`), och appen erbjuder då själv en uppdatering. Byts filer i `public/avatars/` eller `public/anims/` ut måste `AVATARS` respektive `ANIMS` i `public/sw.js` höjas, annars behåller appen de gamla filerna i cachen.
- Allt som syns i appen, och kodkommentarer, skrivs på svenska.
- Kontrollera ändringar med `npm run build` och gärna en skärmdump via Playwright innan de pushas.
- Modellerna konverteras med `tools/convert-rocketbox.mjs` (se kommentaren i filen). Kör inte om konverteringen i onödan; GLB-filerna är incheckade.
- Android-appen (`android/`, Capacitor) laddar spelet från GitHub Pages. Ändringar i spelet kräver alltså ingen ny APK. Ändras något i `android/` eller `capacitor.config.json` byggs och publiceras en ny APK av `.github/workflows/android.yml`.
- Signeringsnyckeln `android/app/release.keystore` skapas av arbetsflödet och är krypterad med hemligheten `KEYSTORE_PASSWORD`. Checka aldrig in lösenord eller okrypterade nycklar, och byt inte nyckeln: då går appen inte att uppdatera.
