# Alone Time som iPhone-app (prototyp)

En liten, körbar iOS-prototyp. **Inte** en App Store-version, och den publiceras inte någonstans.
Webbappen (PWA:n) på GitHub Pages fungerar som förut, parallellt.

## Hur den är byggd

| Del | Vad | Var |
|---|---|---|
| Appen | Samma HTML/CSS/JS som PWA:n, packad **i** appen med Capacitor. Laddas aldrig från nätet → fungerar offline. | `www/` (byggs), `ios/App` |
| Lagring | Allt sparas i iOS egen lagring (UserDefaults, via `@capacitor/preferences`) och speglas till sidans lagring. | `src/boot.js`, `src/native.js` |
| Live Activity | Riktig ActivityKit-kod i Swift. Låsskärm + Dynamic Island. Timern ritas av iOS från passets starttid, så den räknar rätt även med låst skärm eller stängd app. Målet visas bara som text – inget avslutar passet automatiskt. | `native/ios/App/LiveActivityPlugin.swift`, `native/ios/AloneTimeWidget/` |
| Säkerhetskopior | Spara via delningsbladet (→ "Spara i Filer"). Import från Filer, alltid med en genomgång innan något ändras. | `src/app.js` |

PWA:ns data följer **inte** automatiskt med till iPhone-appen (de är två skilda appar för iOS).
Flytta den med en säkerhetskopia – se steg 9.

## Det här behöver du

- En **Mac** med **Xcode 16 eller senare** (gratis i App Store). Öppna Xcode en gång efter installationen och låt den installera tillägg.
- **Node.js** (LTS-versionen från nodejs.org).
- Ett **Apple-ID**. Ett gratis Apple-ID räcker för att köra appen på din egen iPhone (appen slutar då starta efter 7 dagar och behöver installeras om från Xcode – data finns kvar så länge du inte raderar appen).
- En **iPhone med iOS 16.2 eller senare** och en kabel. Dynamic Island finns på iPhone 14 Pro och nyare; övriga visar Live Activity på låsskärmen.

## Steg för steg

### 1. Spara en säkerhetskopia från din nuvarande app (PWA)
Öppna Alone Time från hemskärmen → **Dina data → Spara säkerhetskopia** → **Spara i Filer** (t.ex. iCloud Drive).

### 2. Hämta koden på Macen
**Först (en gång): installera Node.js.** Det är Node.js som ger kommandot `npm`.
Gå till **nodejs.org**, ladda ner **LTS**-versionen (*macOS Installer, .pkg*) och installera den.
**Stäng Terminal helt (⌘Q) och öppna den igen.** Kontrollera sedan:
```
node -v
npm -v
```
Båda ska svara med ett versionsnummer. Står det `command not found: npm` är Node.js inte installerat ännu.

Öppna **Terminal** och skriv (en rad i taget). Kör `git clone` bara **en** gång – står du redan
i en mapp som heter `alone-training-app`, hoppa över de två första raderna.
```
cd ~
git clone https://github.com/fridakaka/alone-training-app.git
cd alone-training-app
git checkout claude/blissful-brahmagupta-xlov33
npm install
npm run ios:sync
npm run ios:open
```
Xcode öppnas med projektet. Första gången hämtar Xcode Capacitor-paketen (kan ta någon minut, se förloppet uppe i fönstret).

### 3. Signera appen
1. Klicka på **App** längst upp i vänsterspalten (den blå ikonen).
2. Under **TARGETS** välj **App** → fliken **Signing & Capabilities**.
3. **Team**: välj ditt Apple-ID (eller **Add an Account…** och logga in).
4. Om Xcode säger att **Bundle Identifier** redan används: ändra `se.fridakaka.alonetime` till något eget, t.ex. `se.dittnamn.alonetime`.

### 4. Lägg till Live Activity-tillägget (en gång)
1. Menyn **File → New → Target…**
2. Välj **iOS → Widget Extension** → **Next**.
3. **Product Name**: `AloneTimeWidget` (exakt så).
4. Bocka **i** *Include Live Activity*. Bocka **ur** *Include Configuration App Intent* (och *Include Control* om det finns).
5. **Team**: samma som i steg 3. **Finish**.
6. Frågar Xcode om att aktivera ett nytt "scheme": välj **Don't Activate**.

### 5. Lägg in Alone Times Live Activity-filer
Tillbaka i **Terminal** (i mappen `alone-training-app`):
```
npm run ios:widget
```
Det ersätter Xcodes exempelfiler med appens egna.

### 6. Ställ in tilläggets iOS-version
I Xcode: under **TARGETS** välj **AloneTimeWidget** → fliken **General** → **Minimum Deployments**: välj **16.2** (eller en version som inte är högre än den på din iPhone). Kontrollera att **Signing & Capabilities → Team** är samma som för App.

### 7. Förbered iPhonen
1. Anslut iPhonen med kabel, lås upp den och välj **Lita på** den här datorn.
2. På iPhonen: **Inställningar → Integritet och säkerhet → Utvecklarläge** → slå på och starta om när den ber om det.

### 8. Kör appen
1. Överst i Xcode: välj scheme **App** och din **iPhone** som mål.
2. Tryck på **▶︎** (Run).
3. Första gången: på iPhonen **Inställningar → Allmänt → VPN och enhetshantering** → välj ditt Apple-ID → **Lita på**. Tryck ▶︎ igen.

### 9. Flytta in din data
I appen visas välkomstskärmen. Tryck **Importera säkerhetskopia**, välj filen från steg 1 i Filer.
Du ser först **vad som kommer att importeras** (antal pass, period, kommentarer, hundnamn, språk,
spårnamn). Inget ändras förrän du trycker **Importera**.

Senare importer (under **Dina data → Återställ från säkerhetskopia**) lägger bara till nya pass;
inget raderas och dina inställningar ändras bara om du själv bockar i rutan för det.

## Prova Live Activity
1. Välj ett spår och tryck **Starta träning**.
2. Lås telefonen: på låsskärmen visas hundens namn, spåret och en uppåträknande timer (och ev. målet).
3. På iPhone 14 Pro och nyare: gå till hemskärmen – timern syns i Dynamic Island. Håll fingret på den för den större vyn.
4. Vänta några minuter med låst skärm, lås upp och öppna appen: timern i appen och på låsskärmen ska visa samma tid.
5. Tryck **Avsluta träning** → Live Activity försvinner. Samma sak om du sedan väljer **Släng det här passet**.
6. Passera målet: inget händer automatiskt, timern fortsätter tills du avslutar.

Syns ingen Live Activity: **Inställningar → Alone Time → Live-aktiviteter** ska vara på.

## Uppdatera appen senare
```
cd alone-training-app
git pull
npm install
npm run ios:sync
```
Tryck ▶︎ i Xcode. Dina data finns kvar (installera ovanpå, radera inte appen).

## Om något går fel
- **`zsh: command not found: npm`**: Node.js saknas – se början av steg 2. Glöm inte att starta om Terminal efter installationen.
- **"ios/App/AloneTimeWidget was not found"** i steg 5: tillägget heter inte exakt `AloneTimeWidget`, eller steg 4 är inte gjort.
- **Fel om "AloneTimeActivityAttributes" i Xcode**: kör `npm run ios:widget` igen och sedan **Product → Clean Build Folder**.
- **Fel om paket (Capacitor)**: **File → Packages → Reset Package Caches**, sedan ▶︎ igen.
- **Appen startar inte efter en vecka** (gratis Apple-ID): anslut iPhonen och tryck ▶︎ i Xcode igen.

## Vad som är testat – och vad som återstår
Testat automatiskt i utvecklingsmiljön (Linux, utan Mac):
- Hela webbappen i iPhone-storlek, inklusive importgenomgången och språkerbjudandet.
- Appens logik för Live Activity med en **simulerad** iOS-brygga: start när passet startar, samma aktivitet efter omstart av appen, avslut vid *Avsluta* och *Släng*, ingen automatisk avslutning vid nått mål, rätt svenska/engelska texter, att datan återställs från iOS-lagringen även om webbvyns lagring rensas, och att säkerhetskopian delas som fil.
- Att Swift-filerna hänger ihop med JavaScript-bryggan och att Xcode-projektet innehåller dem.

**Inte** testat (kräver Mac/iPhone): att Swift-koden kompilerar, att Xcode-stegen fungerar som beskrivet, hur Live Activity faktiskt ser ut på låsskärm och i Dynamic Island, delningsbladet/Filer, och att import av en riktig fil fungerar i appen.
