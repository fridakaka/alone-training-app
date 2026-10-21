# Alone Time på TestFlight (första versionen: bara iPhone)

Det här är steget från "byggs från Xcode på min egen telefon" till "testare installerar via TestFlight".
Inget här handlar om betalning, App Store-publicering eller nytt namn.

## 0. Viktigt först – det här finns bara på din Mac

Widgeten (Live Activity) skapades i Xcode på din Mac och har **aldrig** sparats i Git. I repot finns
därför i dag ingen widget-target i `ios/App/App.xcodeproj/project.pbxproj` och ingen mapp
`ios/App/AloneTimeWidget/`. Det som måste föras över från Macen till Git:

| Fil/mapp på Macen | Varför |
|---|---|
| `ios/App/App.xcodeproj/project.pbxproj` | Innehåller widget-targeten, inbäddningen i appen och iPhone-inställningen |
| `ios/App/AloneTimeWidget/` (hela mappen: `*.swift`, `Info.plist`, `Assets.xcassets`, ev. `*.entitlements`) | Widgetens filer som Xcode skapade + Alone Times Swift-filer |
| `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` (om den finns) | Låser versionerna av Swift-paketen, så att en ren klon bygger likadant |
| `ios/App/App/Info.plist` (om den ändrats) | Live Activities + exportregler |

**Inte** med: mappen `alone-training-app/` (den oavsiktliga andra klonen – den ignoreras nu av Git),
`xcuserdata/`, `build/`, `App/App/public/` (byggs fram av `npm run ios:sync`).

Kommandot `npm run ios:check` visar exakt vilka filer under `ios/` och `native/` som är ändrade och
skriver ut ett färdigt `git add -- …` med **bara** dem. Kör aldrig `git add -A` eller `git add .`.

## 1. Säkerhetskopia före allt annat

1. Öppna Alone Time på iPhonen (den du byggt från Xcode).
2. **☰ → Dina data → Spara säkerhetskopia → Spara i Filer** (t.ex. iCloud Drive). Kontrollera att filen
   `alone-time-ÅÅÅÅ-MM-DD.json` syns i appen Filer.
3. Använder du också webbversionen (PWA:n) – spara en kopia där också.

Säkerhetskopian innehåller alla pass, mål och faktisk tid, kommentarer, oro-tider, spårnamn, hundens
namn, språk och bockarna under "Börja här".

## 2. På Macen: hämta, kör stegen, kontrollera

```
cd ~/alone-training-app
git status
git pull
npm install
npm run ios:sync
npm run ios:widget
npm run ios:check
```

- `git pull` ska gå igenom trots dina lokala ändringar i `ios/App` (den här uppdateringen rör inga av
  de filerna). Säger Git *"Your local changes … would be overwritten"*: **sluta där** och skicka mig
  utskriften – ändra ingenting.
- `ios:sync` och `ios:widget` sätter nu **bara iPhone** för appen och widgeten i alla
  byggkonfigurationer och ger widgeten samma version/byggnummer som appen. De gör små textändringar i
  projektfilen; Xcodes egna format (också för widgeten) lämnas orört.
- `ios:widget` tar bort Xcodes exempelfiler i widgetmappen **bara** om inget annat använder dem, och
  lämnar okända filer orörda (de skrivs ut).
- `ios:check` ska sluta med *"✓ Project ready"*. Visar den ✗ – rätta enligt texten, eller skicka mig utskriften.

Öppna sedan Xcode (`npm run ios:open`), bygg till din iPhone (▶︎) och kontrollera: dina pass finns kvar,
Live Activity syns på låsskärmen och i Dynamic Island, målet syns i den lilla rutan.

## 3. Spara iOS-projektet i Git (så att det går att bygga från en ren klon)

```
npm run ios:check          # kopiera raden "git add -- …" som den skriver ut
git add -- <filerna från ios:check>
git diff --cached --stat   # kontrollera: bara ios/…-filer, inget alone-training-app/
git commit -m "iOS: widget target and iPhone-only settings"
git push
```

Frågar `git push` efter inloggning: logga in med ditt GitHub-konto (lösenordet är en "Personal access
token", eller använd GitHub Desktop). När det är pushat kan jag granska projektet här.

Den nästlade mappen `alone-training-app/` ignoreras nu av Git. Radera den själv i Finder när du har
kontrollerat att den bara är en extra kopia (`cd alone-training-app/alone-training-app && git status`
visar då inga egna ändringar).

## 4. Behålls min data?

- **Samma app**: bundle identifier (`se.fridakaka.alonetime`, eller den du själv ändrade till i steg 3 i
  docs/IOS.md) och lagringsnyckeln (`alone-training:v2`, i iOS egen lagring) är oförändrade. En ny
  version installerad **ovanpå** den gamla är en uppdatering: pass, spår, kommentarer och inställningar
  ligger kvar. Radera aldrig appen före installationen.
- **Det som kan gå förlorat mellan utvecklarinstallationen och TestFlight:**
  - TestFlight-bygget signeras av **organisationens** team, din nuvarande installation av ditt
    personliga Apple-ID. Oftast ersätter iOS appen och behåller datan, men det är inte garanterat när
    teamet byts. Ber iPhonen dig radera den gamla appen först, raderas datan – därför säkerhetskopian.
  - Om bundle identifiern redan är registrerad på ditt personliga team kan organisationen inte använda
    den. Då blir TestFlight-appen en **ny app** (ny identifierare) och ingen data följer med.
  - Inställningen för Live-aktiviteter (Inställningar → Alone Time) kan behöva slås på igen.
  - Data i webbversionen (PWA:n) följer aldrig med automatiskt.
- **Om något saknas efter installationen**: i välkomstskärmen, tryck **Importera säkerhetskopia** och välj
  filen från steg 1. Du ser vad som läggs till innan något ändras.

## 5. Checklista: första TestFlight-bygget (organisationskonto)

1. **Konto**: organisationen är godkänd i Apple Developer Program, och du har rollen *Admin* (eller
   *Account Holder*) i både developer.apple.com och App Store Connect.
2. **Xcode → Settings → Accounts**: lägg till Apple-ID:t som hör till organisationen.
3. **Signering** (App *och* AloneTimeWidgetExtension → Signing & Capabilities): *Automatically manage
   signing* på, **Team = organisationen**. Bundle identifier oförändrad; widgeten =
   `<appens id>.AloneTimeWidget`. Kör `npm run ios:check` igen.
4. **App Store Connect → Appar → + → Ny app**: plattform iOS, namn *Alone Time* (måste vara ledigt i
   App Store – är det upptaget, säg till, byt inte namn på egen hand), primärt språk svenska, välj
   bundle identifiern, SKU t.ex. `alonetime-001`.
5. **Arkivera** i Xcode: välj *Any iOS Device (arm64)* som mål → **Product → Archive**.
6. **Organizer → Distribute App → App Store Connect → Upload**. Låt Xcode hantera signering och
   *byggnummer* (det måste öka vid varje uppladdning; `npm run ios:setup` håller widgeten i takt).
7. Vänta på e-post om att bygget är bearbetat (10–60 min). Exportfrågan om kryptering besvaras redan av
   appen (`ITSAppUsesNonExemptEncryption = NO`).
8. **TestFlight → Test Information**: kort beskrivning av vad som ska testas, e-post för feedback,
   kontaktuppgifter. För externa testare kan en **länk till integritetspolicy** krävas – den finns inte
   än (se hinder nedan).
9. **Interna testare först** (personer i organisationens team, ingen granskning): TestFlight → Internal
   Testing → lägg till dig själv → installera via appen TestFlight på din iPhone.
10. **Externa testare**: TestFlight → **+ ny extern grupp** → lägg till e-postadresser eller skapa en
    **offentlig länk** → välj bygget → **Submit for Review** (första bygget granskas av Apple, ofta inom
    ett dygn). Testarna installerar appen TestFlight och följer inbjudan.
11. Ett TestFlight-bygge fungerar i 90 dagar. Nästa version: höj byggnumret, arkivera, ladda upp.
