# 🎛️ Backspin

Eine moderne, webbasierte Spotify Backup-Anwendung mit Vue.js.

> **Herkunft.** Backspin geht auf [MaximilianRTS/SpotMyBackup2](https://github.com/MaximilianRTS/SpotMyBackup2) zurück, das seinerseits eine Neuimplementierung des ursprünglichen [secuvera/SpotMyBackup](https://github.com/secuvera/SpotMyBackup) ist.

**Selbst gehostet.** Dieses Projekt betreibt keine öffentliche Instanz. Wie du die App auf einem eigenen Host ausliefern kannst, steht unter [Deployment](#-deployment).

> [!IMPORTANT]
> **Spotify Premium Account erforderlich – wichtige Einschränkungen (Stand: Februar 2026)**
> 
> Seit dem **11. Februar 2026** gelten neue Regeln für Spotify Developer Apps im Development Mode:
> 
> - **Spotify Premium Account** ist Pflicht – sowohl für Entwickler als auch für alle Nutzer der App
> - Jede App im Development Mode ist auf **maximal 5 autorisierte Nutzer** begrenzt
> - Dies betrifft sowohl das **Exportieren** als auch das **Importieren** von Playlists
> 
> **Was das bedeutet:** Du brauchst eine eigene Spotify App und trägst dort jeden Nutzer einzeln ein, der die Instanz verwenden soll. Mehr als 5 sind im Development Mode nicht möglich, und jeder davon braucht Spotify Premium.
> 
> Weitere Infos: [Spotify Developer Blog – Februar 2026](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security)

## 📖 Über dieses Projekt

**Backspin** führt [SpotMyBackup 2](https://github.com/MaximilianRTS/SpotMyBackup2) weiter, eine moderne Neuimplementierung des ursprünglichen [SpotMyBackup](https://github.com/secuvera/SpotMyBackup) Projekts von [secuvera](https://github.com/secuvera). Das Ur-Projekt wurde archiviert und wird nicht mehr weiterentwickelt. Diese Version bringt das Konzept in die moderne Web-Entwicklung mit:

- **Vue.js 3** mit Composition API
- **TypeScript** für bessere Code-Qualität
- **Tailwind CSS** für modernes Design
- **Vite** für schnelle Entwicklung

## ✨ Features

- **App 100% kostenlos** - Diese App hat keine versteckten Kosten. Ein **Spotify Premium Account** ist jedoch Voraussetzung für die API-Nutzung.
- **Keine Datenspeicherung** - Alle Daten werden nur in deinem Browser verarbeitet
- **Einfache Bedienung** - Der Setup-Assistent nennt die Dashboard-Felder beim exakten Namen, liefert alle Werte zum Kopieren, prüft die Client ID direkt bei der Eingabe und erklärt eine abgelehnte Anmeldung, statt sie nur zu melden. Was einen erwartet – Spotify Premium, ein kostenloser Developer-Account, etwa fünf Minuten – steht schon auf der Startseite.
- **Vollständiges Backup** - Playlists samt Titeln (inklusive Podcast-Episoden und Hinzufügedatum), gespeicherte Songs, gespeicherte Alben und gefolgte Künstler
- **Auswahl und Filter vor dem Export** - In der Vorschau wählst du einzelne Playlists aus und filterst nach eigenen/fremden sowie öffentlichen, privaten und kollaborativen Playlists. Die Auswahl wirkt sich tatsächlich auf die exportierte Datei aus.
- **Drei Exportformate**
  - **JSON** - das vollständige Backup im Format `2.2`, die einzige Datei, die sich wieder importieren lässt
  - **CSV** - eine Titelliste nach RFC 4180 mit UTF-8-BOM; enthält das Backup auch Alben oder Künstler, kommt ein ZIP mit `tracks.csv`, `albums.csv` und `artists.csv`
  - **M3U** - ein ZIP mit einer `.m3u8`-Datei je Playlist (gespeicherte Songs als „Liked Songs")
- **Import/Restore** - Spiele eine Backup-Datei zurück in denselben oder einen anderen Account: Playlists werden neu angelegt, gespeicherte Songs, Alben und gefolgte Künstler in die Bibliothek übernommen. Du wählst vorher aus, was übertragen wird (Playlist-Auswahl, Sichtbarkeit, Umgang mit gleichnamigen Playlists), der Fortschritt ist sichtbar und lässt sich abbrechen. Backups in den älteren Formaten `2.0` und `2.1` werden beim Laden automatisch auf `2.2` gehoben.
- **Mobile-optimiert** - alle Ansichten sind auf 320, 375 und 414 px Breite geprüft: nichts scrollt horizontal, und kein Text läuft aus seiner Karte. Lange Playlist-Namen ohne Leerzeichen brechen um, statt das Layout aufzuziehen. `npm run test:layout` misst das im echten Browser und läuft in der CI mit.
- **Sichere Authentifizierung** - OAuth 2.0 mit PKCE, `state`-Parameter gegen CSRF, kein Client Secret
- **Open Source** - Transparenter Quellcode auf GitHub
- **Vollwertiger Light- und Dark-Mode** - responsiv auf allen Geräten. Der Theme-Schalter in der Navigation schaltet eine echte zweite Palette um: Alle Farben stehen als Tokens in `src/style.css` und werden pro Theme neu gesetzt, es gibt keine fest verdrahteten Dark-Werte mehr. Im Light-Mode erfüllt jeder Text WCAG AA (mindestens 4,5:1), geprüft von `src/__tests__/theme-contrast.test.ts`. Ohne gespeicherte Auswahl folgt die App der Systemeinstellung.

### Umzug zu einem anderen Dienst

Die `tracks.csv` enthält je Titel die **ISRC** (International Standard Recording Code) in der Spalte `isrc`, die `albums.csv` je Album das Gegenstück auf Veröffentlichungsebene, die **UPC**, in der Spalte `upc`. Die ISRC identifiziert die Aufnahme selbst und ist nicht an Spotify gebunden. Für den Wechsel zu einem anderen Dienst ist sie deshalb die zuverlässigere Angabe als Titel und Künstlername: Die schreiben sich je nach Katalog unterschiedlich, mit Zusätzen wie „Remastered", abweichenden Feature-Angaben oder anderer Interpunktion, während die ISRC über Kataloge hinweg dieselbe bleibt. Ob ein bestimmter Zieldienst ISRCs entgegennimmt, hängt von diesem Dienst ab und ist hier nicht geprüft. Der Export schreibt die ISRC, sobald sie in den Daten steht – unabhängig davon, mit welcher Formatversion das Backup erstellt wurde. Auch ältere Backups enthalten sie in aller Regel schon, weil das Feld beim Abruf nie herausgefiltert wurde; dokumentierter Teil des Formats ist sie allerdings erst ab `2.2`. Leer bleibt die Spalte bei Podcast-Episoden, bei lokalen Dateien und dann, wenn die Daten das Feld tatsächlich nicht enthalten.

### Was ein Backup nicht wiederherstellen kann

- **Lokale Dateien** aus Playlists. Die Spotify-API kann sie nicht hinzufügen; sie werden beim Import übersprungen und im Ergebnis gezählt.
- **Playlist-Cover.** Selbst hochgeladene Bilder werden nicht mit übertragen; neu angelegte Playlists erhalten das automatische Spotify-Cover.
- **Das Hinzufügedatum gespeicherter Songs.** Spotify vergibt beim Speichern immer das aktuelle Datum. Der Import überträgt die Songs deshalb in umgekehrter Reihenfolge, damit die Sortierung in der Bibliothek wieder ungefähr passt.
- **Titel, die es bei Spotify nicht mehr gibt.** Sie stehen zwar im Backup, lassen sich aber nicht mehr hinzufügen.

### Berechtigungen (Scopes)

Beim Anmelden fragt die App diese Spotify-Berechtigungen an:

| Zweck | Scopes |
|---|---|
| Backup (nur lesen) | `playlist-read-private`, `playlist-read-collaborative`, `user-library-read`, `user-follow-read`, `user-read-private`, `user-read-email` |
| Import (schreiben) | `playlist-modify-public`, `playlist-modify-private`, `user-library-modify`, `user-follow-modify` |

> **Nach einem Update dieser Liste musst du dich einmal ab- und wieder anmelden**, sonst fehlen der bestehenden Sitzung die Schreibrechte und der Import bricht mit einem Hinweis ab.

Deine Sitzung lebt nur im Tab: Der Access-Token bleibt im Arbeitsspeicher, der Refresh-Token im `sessionStorage`. Schließt du den Tab, meldest du dich beim nächsten Besuch neu an. Unabhängig davon laufen Spotify-Refresh-Tokens nach längerer Zeit (nach aktuellem Stand rund sechs Monate) ohnehin ab.

## 🛠️ Für Entwickler

### Repository klonen

```bash
git clone https://github.com/ToDiii/backspin.git
cd backspin
```

### Dependencies installieren

Voraussetzung: **Node.js >= 22.12**. Die getestete Version steht in `.nvmrc` (22) und wird auch in der CI verwendet.

```bash
nvm use      # optional, liest .nvmrc
npm ci       # oder npm install
```

### Konfiguration

Für die Nutzung der App ist keine `.env` erforderlich.

- Die Spotify Client ID wird direkt in der Anwendung auf der Seite „Setup“ eingegeben und im `localStorage` des Browsers gespeichert.
- Es werden keine geheimen Schlüssel benötigt, da die Authorisierung über OAuth 2.0 mit PKCE erfolgt.
- Optional für lokale Entwicklung: Du kannst eine `VITE_APP_URL` setzen, ist jedoch nicht zwingend notwendig.

### Entwicklungsserver starten

```bash
npm run dev
```

Die Anwendung ist jetzt unter `http://127.0.0.1:3000` verfügbar. Rufe sie genau
unter dieser Adresse auf, nicht unter `http://localhost:3000`: Die App leitet ihre
Redirect-URI aus `window.location.origin` ab, und Spotify erlaubt `http` nur für
Loopback-Adressen, den Namen `localhost` dagegen nicht. Der Dev-Server bindet
deshalb über `vite.config.ts` fest auf `127.0.0.1`.

## 🛠️ Entwicklung

### Verfügbare Scripts

```bash
# Entwicklungsserver starten (http://127.0.0.1:3000)
npm run dev

# Build für Production nach dist/
npm run build

# Preview des Production Builds
npm run preview

# Type Checking (vue-tsc)
npm run type-check

# Linting, nur prüfend (--max-warnings 0) – so läuft es auch in der CI
npm run lint

# Linting mit automatischer Korrektur (ändert Dateien)
npm run lint:fix

# Tests einmalig ausführen
npm test

# Tests im Watch-Modus
npm run test:watch

# Tests mit Coverage-Report
npm run test:coverage
```

Die CI (`.github/workflows/ci.yml`) führt bei Push und Pull Request auf `main` genau diese Schritte aus: `npm ci`, `type-check`, `lint`, `test`, `build`.

### Projektstruktur

```
backspin/
├── src/                     # Vue.js Anwendung
│   ├── main.ts              # Bootstrap: Pinia, Router (Routen inline), Mount
│   ├── App.vue              # Layout: Navigation, Footer, Toasts
│   ├── style.css            # Tailwind-Layer und eigene Komponentenklassen
│   ├── views/               # Eine Datei pro Route
│   ├── components/          # ThemeToggle, ToastContainer, BuyMeACoffee
│   ├── composables/         # useSpotifyAuth (OAuth-Flow)
│   ├── services/            # Framework-freie Logik ohne Pinia
│   │   ├── spotify.ts       #   alle Aufrufe der Spotify Web API
│   │   ├── export.ts        #   JSON-, CSV- und M3U-Erzeugung, ZIP-Bau
│   │   ├── backup-format.ts #   Formatversion, Migration 2.0/2.1 auf 2.2, Filter
│   │   ├── validate-backup.ts # Prüfung hochgeladener Backup-Dateien
│   │   ├── download.ts      #   Datei an den Browser übergeben
│   │   ├── pkce.ts          #   Code Verifier, Code Challenge, State
│   │   └── __tests__/       #   Tests zu den Services
│   ├── stores/              # Pinia: auth, backup, import, app, theme
│   │   └── __tests__/       #   Tests zu den Stores
│   ├── test/                # Vitest-Setup und gemeinsame Fixtures
│   └── types/               # TypeScript-Typen (eine Datei)
├── public/                  # Öffentliche Dateien (Icons)
├── deploy/                  # Caddy-Konfiguration und deploy.sh für das Hosting
└── dist/                    # Build Output
```

## 🔧 Konfiguration (für Entwickler)

### Spotify App Setup

Der Setup-Assistent unter `/setup` führt durch genau diese Schritte, mit den exakten Feldnamen aus dem
Dashboard und den Werten zum Kopieren. Zum Nachschlagen:

1. Im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) anmelden und auf **Create app** klicken.
2. Formular ausfüllen. Nur die **Redirect URI** muss zeichengenau stimmen: `{deine_domain}/callback` – inklusive `http` oder `https`, Portnummer und ohne Schrägstrich am Ende. Unter „Which API/SDKs are you planning to use?" reicht **Web API**.
3. **Dich selbst als Nutzer eintragen:** in der App unter „Settings“ → „User Management“, mit der E-Mail-Adresse deines Spotify-Kontos. Apps im Development Mode lassen nur eingetragene Konten zu, auch das eigene – ohne diesen Eintrag lehnt Spotify die Anmeldung ab, und das ist der mit Abstand häufigste Stolperstein.
4. Die **Client ID** aus „Settings“ → „Basic Information“ im Setup-Assistenten eintragen. Sie wird im `localStorage` des Browsers gespeichert. Das **Client Secret** wird nicht gebraucht (PKCE).

## 🚀 Deployment

### Statisches Hosting (beliebiger Host)

```bash
# Build erstellen
npm run build

# dist/ Ordner auf deinen Webserver hochladen
```

Zwei Dinge muss der Webserver dabei leisten: Er muss unbekannte Pfade auf `index.html` zurückführen (SPA-Fallback), sonst laufen Direktaufrufe wie `/callback` ins Leere, und er sollte die Security-Header setzen.

### Caddy (empfohlen)

Die vollständige Konfiguration liegt in [`deploy/`](deploy/), die Anleitung Schritt für Schritt in [`deploy/README.md`](deploy/README.md).

- `deploy/backspin.caddy` ist der gemeinsame Snippet mit Wurzelverzeichnis, Kompression, SPA-Fallback, den Security-Headern (Content Security Policy, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) und den Cache-Regeln (ein Jahr für die gehashten Dateien unter `/assets/`, `no-cache` für die App-Shell).
- `deploy/Caddyfile.site` bindet ihn als Site-Block in ein bestehendes Caddyfile ein, gedacht für einen Host hinter einem Tunnel, bei dem TLS extern terminiert wird.
- `deploy/Caddyfile.standalone` ist ein vollständiges Caddyfile für einen Host, auf dem Caddy Auto-HTTPS selbst übernimmt.
- `deploy/deploy.sh` holt auf dem Host den neuesten `main`-Stand, baut nach `dist/` und lädt Caddy neu.

Kurzfassung: Repository nach `/opt/backspin` klonen, `npm ci && npm run build`, den Snippet nach `/etc/caddy/` kopieren, den Site-Block ins Caddyfile eintragen, `systemctl reload caddy`. Spätere Updates laufen über `deploy/deploy.sh`.

### Erster Lauf nach einem Update

Diese Liste einmal nach jedem Deploy durchgehen. Sie prüft genau die Stellen, die sich nur gegen die echte Spotify-API klären lassen.

1. **Lokal testen.** `npm run dev` starten und die App unter `http://127.0.0.1:3000` öffnen. Im Spotify Developer Dashboard dafür zusätzlich die Redirect-URI `http://127.0.0.1:3000/callback` eintragen. Die Loopback-Adresse ist die einzige Ausnahme, für die Spotify `http` statt `https` akzeptiert; der Name `localhost` ist nicht zulässig. Weil die App ihre Redirect-URI aus `window.location.origin` ableitet, musst du die Seite tatsächlich unter `127.0.0.1` aufrufen, sonst passt der übermittelte Wert nicht zum eingetragenen.
2. **Spotify Developer Dashboard vorbereiten.** In der App unter „Settings“ die Redirect URI `https://<deine-domain>/callback` eintragen (exakt so, inklusive `https` und ohne abschließenden Schrägstrich). Im selben Dialog den eigenen Spotify-Account in die Nutzerliste aufnehmen: Apps im Development Mode erlauben maximal 5 autorisierte Nutzer, und jeder davon braucht Spotify Premium.
3. **Seite öffnen und Client-ID hinterlegen.** Auf `https://<deine-domain>/setup` die Client ID der App eintragen. Sie wird nur im `localStorage` des Browsers gespeichert.
4. **Abmelden und neu anmelden.** Eine bestehende Sitzung behält die Berechtigungen, mit denen sie angelegt wurde. Erst ein neuer Anmeldevorgang fragt die vier Schreib-Scopes `playlist-modify-public`, `playlist-modify-private`, `user-library-modify` und `user-follow-modify` bei Spotify ab. Ohne diesen Schritt zeigt die Import-Seite „Berechtigungen fehlen“ mit dem Hinweis, sich einmal ab- und wieder anzumelden, und startet den Import nicht.
5. **Backup erstellen und die Vorschau prüfen.** Auf `/backup` das Backup starten und in der Vorschau kontrollieren, ob Playlists, gespeicherte Songs, gespeicherte Alben und gefolgte Künstler mit dem Spotify-Konto zusammenpassen. Danach als JSON exportieren und zusätzlich als CSV. Die CSV in einem Tabellenprogramm öffnen: Umlaute müssen korrekt ankommen (UTF-8-BOM) und das Datum in der Spalte `added_at` lesbar sein.
6. **Import mit einer kleinen Playlist testen.** Auf `/import` dieselbe JSON-Datei laden, genau eine kleine Playlist auswählen, als Duplikat-Strategie „Trotzdem anlegen“ und als Sichtbarkeit „Alle privat“ wählen, dann den Import starten. Anschließend in Spotify nachsehen, ob die Playlist existiert und die Titelzahl mit der Vorschau übereinstimmt.
7. **Alben und gefolgte Künstler einmal mitimportieren**, sofern das Backup welche enthält. Dieser Lauf beantwortet die offene Frage, ob `PUT /me/library` Artist-URIs annimmt oder ob der Fallback auf `PUT /me/following?type=artist&ids=` greift (siehe [ANALYSE.md](ANALYSE.md), Abschnitt „Nächste Schritte“, Punkt 1). Das Ergebnis unter „Künstlern gefolgt“ und die Hinweisliste sagen, welcher Weg funktioniert hat.
8. **Security-Header gegenprüfen.** Die ausgelieferten Header stimmen nicht automatisch mit `deploy/backspin.caddy` überein, deshalb einmal direkt abfragen:

   ```bash
   curl -I https://<deine-domain>/
   ```

   Erwartet werden `content-security-policy` mit `connect-src 'self' https://api.spotify.com https://accounts.spotify.com`, `strict-transport-security: max-age=31536000; includeSubDomains` und `cache-control: no-cache` für `/` und `/index.html`.
9. **Bei Problemen melden**, was tatsächlich zu sehen war: die Ausgabe der Browser-Konsole (Entwicklertools, Tab „Console“) und den vollständigen Fehlertext aus dem Toast beziehungsweise aus der aufklappbaren Hinweisliste unter dem Import-Ergebnis. Beides gehört in ein [GitHub Issue](https://github.com/ToDiii/backspin/issues).

## 🛡️ Sicherheit

- **PKCE OAuth Flow** - OAuth 2.0 mit PKCE (S256) und `state`-Parameter, ohne Client Secret
- **Client-seitige Verarbeitung** - Keine Server-Intermediäre, kein eigenes Backend
- **HTTPS Only** - Verschlüsselte Verbindungen, `Strict-Transport-Security` und `upgrade-insecure-requests`
- **Content Security Policy** - gesetzt in `deploy/backspin.caddy` als Header und zusätzlich als `<meta http-equiv>` in `index.html`, damit sie auch bei anderen Hostern greift. Verbindungen sind auf `api.spotify.com` und `accounts.spotify.com` begrenzt, Skripte auf die eigene Herkunft. Dazu `X-Content-Type-Options`, `X-Frame-Options`, `frame-ancestors 'none'`, `Referrer-Policy` und `Permissions-Policy`.
- **Keine Drittanbieter-Ressourcen** - die Schrift Inter liegt im eigenen Bundle, Google Fonts wird nicht geladen
- **Token-Haltung** - Der Access-Token bleibt ausschließlich im Arbeitsspeicher, der Refresh-Token liegt im `sessionStorage` und ist mit dem Schließen des Tabs weg. Im `localStorage` stehen nur Client-ID, Redirect-URI und Theme-Präferenz.
- **Geprüfter Import** - hochgeladene Backup-Dateien werden vor der Verarbeitung auf Größe (max. 50 MB), Dateityp, gültiges JSON und Struktur geprüft
- **Keine Datenspeicherung** - Alle Daten bleiben beim Benutzer

Details zu Headern und Token-Handling: [SECURITY.md](SECURITY.md), Details zu den Speicherorten: [PRIVACY.md](PRIVACY.md).

## 🔍 Transparenz

- Reines Client-Frontend: Keine serverseitige Speicherung personenbezogener Daten. Details siehe [PRIVACY.md](PRIVACY.md).
- Authentifizierung via OAuth 2.0 mit PKCE; Tokens verbleiben im Browser (Access-Token nur im Arbeitsspeicher, Refresh-Token im `sessionStorage`). Relevanter Code: `src/composables/useSpotifyAuth.ts`, `src/stores/auth.ts`.
- Keine Tracking-Cookies, kein Analytics.
- Vollständiger Quellcode und Änderungen öffentlich einsehbar auf GitHub.

Mehr Hintergrund und Anleitung: die Seite `/setup` der eigenen Instanz.

## 📱 Browser-Unterstützung

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🤝 Beitragen

Wir freuen uns über Beiträge! Bitte:

1. Forke das Repository
2. Erstelle einen Feature Branch (`git checkout -b feature/amazing-feature`)
3. Committe deine Änderungen (`git commit -m 'feat: amazing feature'`)
4. Stelle sicher, dass `npm run type-check`, `npm run lint`, `npm test` und `npm run build` grün sind
5. Pushe zum Branch (`git push origin feature/amazing-feature`)
6. Öffne einen Pull Request

Mehr dazu in [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 Lizenz

Dieses Projekt steht unter der MIT Lizenz. Siehe [LICENSE](LICENSE) für Details.

## 🆘 Support

Bei Problemen oder Fragen zu Backspin: Erstelle ein [GitHub Issue](https://github.com/ToDiii/backspin/issues).

Fehler, die auch in SpotMyBackup 2 auftreten, gehören in die [Issues des Vorgängers](https://github.com/MaximilianRTS/SpotMyBackup2/issues).

## ☕ Unterstützen

Der Kaffee-Knopf in der App verweist auf [buymeacoffee.com/todiii](https://buymeacoffee.com/todiii) und kommt damit dem Betreiber von Backspin zugute.

## 🙏 Danksagungen

- **[MaximilianRTS/SpotMyBackup2](https://github.com/MaximilianRTS/SpotMyBackup2)** - SpotMyBackup 2, das Projekt, auf das Backspin zurückgeht, entwickelt von [Maximilian Reitsberger](mailto:maximilianrts@proton.me).
- **[secuvera/SpotMyBackup](https://github.com/secuvera/SpotMyBackup)** - Das ursprüngliche Projekt, das die Inspiration für diese moderne Neuimplementierung war
- [Vue.js](https://vuejs.org/) - Progressive JavaScript Framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-First CSS Framework
- [Spotify Web API](https://developer.spotify.com/documentation/web-api/) - Musik-API

---

**Backspin** - Sichere deine Spotify-Daten in 3 einfachen Schritten! 🎛️

*Betrieben von [@ToDiii](https://github.com/ToDiii). Geht zurück auf [MaximilianRTS/SpotMyBackup2](https://github.com/MaximilianRTS/SpotMyBackup2) von Maximilian Reitsberger, einer modernen Neuimplementierung des ursprünglichen SpotMyBackup Projekts.*