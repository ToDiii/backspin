# CLAUDE.md

Leitfaden für Claude Code in diesem Repository. Bei Widersprüchen gilt der Code, nicht diese Datei.

## Projekt

Backspin – reine Client-Web-App (SPA) zum Exportieren/Importieren von Spotify-Playlists und Favoriten.
Kein Backend, keine Datenbank: Auth läuft über OAuth 2.0 mit PKCE direkt gegen Spotify, Tokens bleiben im Browser.
Dieses Repository ist `ToDiii/backspin`; das Projekt geht auf `MaximilianRTS/SpotMyBackup2` zurück und hieß bis zur Umbenennung selbst „SpotMyBackup 2". Es gibt keine öffentliche Instanz: Das gebaute `dist/` wird selbst gehostet, siehe `deploy/`. Es steht nirgends eine feste Domain im Code; `backspin.maxds.me` kommt ausschließlich als Beispiel in `deploy/README.md` vor.

## Stack

| Bereich | Technologie |
|---|---|
| Framework | Vue 3.5 (Composition API, `<script setup lang="ts">`) |
| State | Pinia 4 (Setup-Store-Syntax mit `defineStore('name', () => {...})`) |
| Routing | vue-router 5, Routen inline in `src/main.ts` (keine separate Router-Datei); Navigation Guards geben ihr Ergebnis zurück, kein `next()`-Callback |
| Sprache | TypeScript ~5.9, `strict`, `noUnusedLocals`, `noUnusedParameters` |
| Build | Vite 7, `@vitejs/plugin-vue` 6, ESM (`"type": "module"`) |
| Styling | Tailwind CSS 3.4 (+ forms, typography), PostCSS, `darkMode: 'class'` |
| Lint | ESLint 10 mit Flat Config (`eslint.config.js`): `@eslint/js` recommended + `eslint-plugin-vue` `flat/recommended` + `@vue/eslint-config-typescript` |
| Tests | Vitest 5 mit `happy-dom`, `@vue/test-utils`, `@pinia/testing`, Coverage über `@vitest/coverage-v8` |
| Hosting | Statisches `dist/` hinter Caddy 2 (SPA-Fallback `try_files {path} /index.html`), Konfiguration in `deploy/` |
| Node | >= 22.12 (`engines`, von Vite 7 und Vitest 5 gefordert); CI liest `.nvmrc`, aktuell 22 |
| Sonstige Laufzeit-Deps | `jszip` (ZIP-Exporte), `@fontsource/inter` (selbst gehostete Schrift) |

HTTP-Aufrufe an die Spotify Web API laufen über natives `fetch`, nicht über axios.

## Befehle

```bash
npm ci                 # Install (Lockfile vorhanden)
npm run dev            # Vite Dev-Server auf http://127.0.0.1:3000 (kein automatischer Browser-Start)
npm run build          # Production-Build nach dist/
npm run preview        # dist/ lokal ausliefern
npm run type-check     # vue-tsc --noEmit
npm run lint           # ESLint prüfend, --max-warnings 0 (ändert keine Dateien)
npm run lint:fix       # ESLint mit --fix (ändert Dateien!)
npm test               # vitest run (einmalig, für CI und vor jedem PR)
npm run test:watch     # vitest im Watch-Modus
npm run test:coverage  # vitest run --coverage (v8)
npm run test:layout    # Layout-Test im echten Browser gegen dist/ (erst `npm run build`)
```

`npm run test:layout` braucht ein Chromium von Playwright (`npx playwright install chromium`).
Wer schon eines hat, setzt stattdessen `CHROMIUM_EXECUTABLE_PATH` auf die Binary.

Deploy auf dem Host: `deploy/deploy.sh` (fetch, reset --hard, `npm ci`, Build, `systemctl reload caddy`). Kein npm-Script dafür, kein CI-Deploy.

- **Tests laufen mit Vitest** (`vitest.config.ts`, Umgebung `happy-dom`, `globals: false`).
  Konvention: Testdateien liegen neben dem getesteten Modul in `__tests__/` und heißen `<modul>.test.ts`
  (`src/services/__tests__/export.test.ts`, `src/stores/__tests__/auth.test.ts`).
  `describe`/`it`/`expect`/`vi` werden explizit aus `vitest` importiert, Testbeschreibungen sind Englisch.
  Fixtures liegen in `src/test/fixtures.ts`, das globale Setup in `src/test/setup.ts`; dort ersetzt ein Guard
  `fetch`, sodass jede ungemockte Netzwerkanfrage im Test mit einer klaren Fehlermeldung scheitert.
  Die aktuelle Zahl der Tests und Testdateien liefert `npm test`; sie steht bewusst nicht in dieser Datei,
  weil sie mit jedem PR veraltet. Getestet sind die Services `pkce`, `spotify`, `backup-format`,
  `validate-backup`, `export`, `client-id` und `auth-errors`, die Stores `auth`/`backup`/`import`/`theme`,
  die Views `BackupView`, `BackupPreviewView`, `ImportView`, `LandingView`, `SetupView` und `CallbackView`
  (`src/views/__tests__/`) sowie `App.vue`,
  die Routen-Titel aus `src/main.ts` und das Theme (`src/__tests__/`).
  Die drei Theme-Tests arbeiten am Quelltext statt am DOM: `theme-contrast.test.ts` liest die Tokens aus
  `src/style.css` und rechnet die WCAG-Kontraste nach, `theme-tokens.test.ts` durchsucht alle `.vue`-Dateien
  nach Farben aus Tailwinds fester Palette, `theme-init.test.ts` führt `public/theme-init.js` per `new Function`
  gegen ein gestubbtes `matchMedia` aus.
- **Der Layout-Test liegt außerhalb von `npm test`** (`tests/layout-overflow.test.ts`, eigene Config
  `vitest.layout.config.ts`, Skript `npm run test:layout`). happy-dom rechnet kein Layout, deshalb startet
  dieser eine Test `vite preview` auf dem gebauten `dist/`, fährt jede Ansicht in Chromium bei 320, 375 und
  414 px an und misst zweierlei: Das Dokument darf nicht horizontal scrollen, und keine Box darf ihren
  eigenen Inhalt überlaufen lassen. Ausgenommen sind Elemente, die selbst clippen (`truncate` soll kürzen)
  und solche mit absolut positioniertem Kind (ein Badge mit negativem Offset ragt absichtlich heraus).
  Die Spotify-Antworten sind im Test gemockt, mit einem 100 Zeichen langen Playlist-Namen und einem zweiten
  ganz ohne Leerzeichen. Weil er ein Chromium-Binary und ein gebautes `dist/` braucht, bleibt er aus
  `npm test` heraus; die CI ruft ihn nach dem Build als eigenen Schritt auf.
  Ohne Tests sind weiterhin `services/download.ts`, der Store `app`, die View
  `GuideView` sowie alle Komponenten (`ThemeToggle`, `ToastContainer`, `BuyMeACoffee`,
  `CopyField`).
  Für Komponenten- und View-Tests gibt es zwei Wege, je nachdem, was die View vom Store braucht:
  `BackupView` und `ImportView` mounten über einer echten Pinia (`createPinia`/`setActivePinia`),
  weil dort Store-Aktionen tatsächlich laufen sollen; sie stubben `RouterLink` und mocken
  `vue-router`, weil sowohl die View als auch `useSpotifyAuth` `useRouter()` aufrufen.
  `BackupPreviewView` und `App.vue` lesen den Store nur als Datenquelle und mounten deshalb über
  `createTestingPinia` aus `@pinia/testing` (Aktionen als Spies) zusammen mit einem echten Router
  aus `createMemoryHistory` und einer Catch-all-Route, damit jeder `router-link` auflösbar bleibt.
  `LandingView` nutzt keinen Store und braucht daher keine Pinia.
  `src/__tests__/main.test.ts` prüft die Routen-Titel am Quelltext, weil `src/main.ts` die App
  schon beim Import mountet.
- CI (`.github/workflows/ci.yml`) läuft bei Push/PR auf `main` mit der Node-Version aus `.nvmrc`: `npm ci`, `type-check`, `lint`, `test`, `build`.
- Vor jedem PR müssen `type-check`, `lint`, `test` und `build` grün sein (siehe `CONTRIBUTING.md`).
- `.stylelintrc.json` existiert, stylelint ist aber nicht installiert. Nicht darauf verlassen.

## Verzeichnisaufbau

```
.
├── index.html                 # Vite-Einstieg, lädt src/main.ts
├── src/
│   ├── main.ts                # App-Bootstrap: Pinia, Router (alle Routen + Titel), mount
│   ├── App.vue                # Layout: Nav, Footer, Toasts, Theme-Init
│   ├── style.css              # Tailwind-Layer + eigene Komponentenklassen (.btn, .card, .form-*, …)
│   ├── __tests__/             # Tests zu App.vue, zu den Routen-Titeln aus main.ts und zum Theme
│   │                          #   (theme-contrast: WCAG-Kontraste der Tokens, theme-tokens: keine
│   │                          #   festen Farben in den Templates, theme-init: das Pre-Paint-Skript)
│   ├── views/                 # Eine Datei pro Route
│   │   ├── LandingView.vue    #   /
│   │   ├── SetupView.vue      #   /setup      – 4 Schritte: App anlegen, Nutzer eintragen, Client ID, fertig
│   │   │                       #   `/setup?schritt=N` springt direkt in einen Schritt
│   │   ├── BackupView.vue     #   /backup     – Login + Backup starten
│   │   ├── BackupPreviewView.vue # /backup/preview – Playlists filtern, Export json/csv/m3u
│   │   ├── ImportView.vue     #   /import     – Backup-Datei laden
│   │   ├── GuideView.vue      #   /guide
│   │   ├── CallbackView.vue   #   /callback   – OAuth-Redirect-Ziel, erklärt Fehler über describeAuthError
│   │   └── __tests__/         #   *.test.ts zu den Views
│   ├── components/            # ThemeToggle, ToastContainer (rendert die Toasts aus stores/app), BuyMeACoffee,
│   │                          #   CopyField (Wert + Ein-Klick-Kopie, Fallback: Wert markieren)
│   ├── composables/
│   │   └── useSpotifyAuth.ts  # OAuth-Flow: startAuth, handleCallback, logout
│   ├── services/              # Framework-freie Logik ohne Pinia-Abhängigkeit
│   │   ├── pkce.ts            #   generateCodeVerifier/-Challenge/-State, base64url (RFC 7636)
│   │   ├── spotify.ts         #   spotifyFetch (401-Refresh, 429-Retry-After, 5xx-Backoff), paginate, Lese- und Schreibfunktionen
│   │   │                       #   Schreiben (Restore): createPlaylist, addItemsToPlaylist (100er-Batches),
│   │   │                       #   saveToLibrary/libraryContains (40er-Batches), followArtists (Fallback /me/following)
│   │   ├── backup-format.ts   #   BACKUP_FORMAT_VERSION, normalizeBackup (2.0/2.1 → 2.2), applyBackupOptions
│   │   ├── validate-backup.ts #   validateBackupFile: Größe, Endung, JSON, Struktur vor normalizeBackup
│   │   ├── export.ts          #   buildJson/buildCsv/buildM3u + ZIP-Bau (jszip); tracks.csv endet auf `isrc`, albums.csv auf `upc`
│   │   ├── client-id.ts       #   checkClientId: prüft die eingegebene Client ID und benennt den Fehler
│   │   ├── auth-errors.ts     #   SpotifyAuthError + describeAuthError: OAuth-Fehlercode → erklärter Text
│   │   ├── download.ts        #   downloadBlob
│   │   └── __tests__/         #   *.test.ts zu den Services
│   ├── stores/                # Pinia
│   │   ├── auth.ts            #   Access-Token nur im Speicher, Refresh-Token/User im sessionStorage, Client-ID im localStorage
│   │   ├── backup.ts          #   Backup-Ablauf über die Services, Auswahl/Filter, Download json/csv/m3u,
│   │   │                       #   Ergebnis des letzten Laufs (`lastRunResult` mit den fehlgeschlagenen Playlists)
│   │   ├── import.ts          #   Restore: Optionen, Fortschritt, Abbruch, Ergebnis (`ImportResult` mit
│   │   │                       #   Zählern, Fehlerliste und `cancelled` für den Abbruch)
│   │   ├── app.ts             #   Toasts (addToast/showSuccess/showError/showWarning/showInfo) und ein error-Feld
│   │   ├── theme.ts           #   Dark/Light/Auto, localStorage `theme-preference`; setzt die Klasse auf <html>
│   │   └── __tests__/         #   *.test.ts zu den Stores
│   ├── test/
│   │   ├── setup.ts           # Vitest-Setup: fetch-Guard, Storage leeren, Mocks zurücksetzen
│   │   └── fixtures.ts        # Fixture-Builder für Spotify- und Backup-Objekte
│   └── types/
│       └── index.ts           # Alle Spotify- und App-Typen (SpotifyPlaylist, BackupData, …)
├── tests/                     # Browser-Tests außerhalb von `npm test`
│   └── layout-overflow.test.ts #   kein horizontaler Overflow bei 320/375/414 px
├── public/                    # Statische Assets
│   ├── favicon.svg            #   Wort-/Bildmarke: Platte mit Rille und Backspin-Pfeil, Bernstein-Kachel
│   ├── icon-512.png           #   dieselbe Marke als PNG (apple-touch-icon)
│   ├── og-image.png           #   Vorschaubild für og:image und twitter:image
│   └── theme-init.js          #   setzt die Theme-Klasse vor dem ersten Paint (CSP: kein Inline-Script)
├── env.d.ts                   # Typen für import.meta.env (VITE_APP_URL)
├── env.example                # Vorlage; keine Secrets nötig
├── vite.config.ts             # Alias @ → src, Dev-Server auf 127.0.0.1:3000, vendor-Chunk
├── vitest.config.ts           # happy-dom, globals: false, Alias @ → src, setupFiles
├── vitest.layout.config.ts    # zweite Config für tests/: Node-Umgebung, echter Browser
├── tailwind.config.js         # Markenfarben (primary = #E6A62E, spotify = #1DB954), Animationen; Tokens siehe style.css
├── deploy/                    # Hosting: Caddy-Konfiguration und Deploy-Skript
│   ├── backspin.caddy         #   Snippet: root, encode, Security-Header, Cache-Regeln, SPA-Fallback
│   ├── Caddyfile.site         #   Site-Block für ein bestehendes Caddyfile (TLS extern, http://-Präfix)
│   ├── Caddyfile.standalone   #   vollständiges Caddyfile mit Auto-HTTPS
│   ├── deploy.sh              #   fetch, reset --hard, npm ci, build, reload caddy
│   └── README.md              #   Einrichtung Schritt für Schritt
├── eslint.config.js           # ESLint 10 Flat Config (ESM): ignores, js/vue/ts-recommended, Regel-Ausnahmen
├── .nvmrc                     # 22, wird von der CI über node-version-file gelesen
├── .editorconfig
└── .github/
    ├── workflows/ci.yml       # type-check, lint, test, build, test:layout
    └── dependabot.yml         # npm und github-actions, wöchentlich
```

`src/utils/` und `src/assets/` gibt es nicht. Es gibt auch keine separate Router-Datei und keinen Konstanten-Ordner: Die Routen stehen in `src/main.ts`, die Storage-Keys in `src/stores/auth.ts`.

## Konventionen

**Code**
- Pfad-Alias `@/` für `src/` (in `tsconfig.json` und `vite.config.ts` definiert), z. B. `import { useAuthStore } from '@/stores/auth'`.
- Kein Semikolon am Zeilenende, einfache Anführungszeichen, 2 Spaces. Kein Prettier – Stil manuell einhalten.
- Vue-SFC-Reihenfolge: `<template>` zuerst, danach `<script setup lang="ts">`. Kein Options-API.
- Stores im Setup-Stil: `state` als ein `ref<XState>`, Getter als `computed`, Aktionen als Arrow-Funktionen, am Ende alles explizit `return`en.
- Typen zentral in `src/types/index.ts` ablegen und mit `import type` importieren.
- Wegen `noUnusedLocals`/`noUnusedParameters` bricht jede ungenutzte Variable den type-check. Ungenutzte Parameter mit `_` prefixen.
- Neue Route = neue Datei in `src/views/` + Eintrag im `routes`-Array in `src/main.ts` inklusive `meta.title`; geschützte Routen bekommen `meta.requiresAuth`.

**Service-Layer**
- Aufrufe der Spotify Web API (`api.spotify.com`) laufen ausschließlich über `src/services/spotify.ts`. Kein `fetch` auf diese Domain in Views, Stores oder Composables. Nur `spotifyFetch` kennt Token, 401-Refresh, 429 mit `Retry-After` und das Fehler-Mapping auf `SpotifyApiError`.
- Zwei bewusste Ausnahmen, beide dokumentiert im Code: die Token-Endpunkte bei `accounts.spotify.com` (`stores/auth.ts`, `composables/useSpotifyAuth.ts`) und der einmalige Profilabruf direkt nach dem Token-Austausch, bei dem noch kein Token im Store liegt.
- Serialisierung (`services/export.ts`) und Browser-I/O (`services/download.ts`) gehören nicht in einen Store. Stores rufen die Services auf und halten nur Zustand.
- Die Backup-Formatversion steht ausschließlich in `BACKUP_FORMAT_VERSION` (`services/backup-format.ts`). Nirgends sonst eine Versionsnummer hart codieren; die lesbaren Versionen stehen in `SUPPORTED_BACKUP_VERSIONS` (`services/validate-backup.ts`).

**Setup-Flow**
- Der Setup-Assistent ist für die meisten Nutzer der einzige Weg in die App: Eine gehostete Instanz kann im
  Development Mode nur fünf Konten bedienen, alle anderen legen eine eigene Spotify App an. Änderungen dort
  gehen entsprechend vor Kosmetik woanders.
- Feldnamen aus dem Spotify-Dashboard bleiben **englisch und exakt** („App name", „Redirect URI",
  „User Management", „Basic Information"). Der erklärende Text drumherum ist deutsch.
- Werte, die jemand ins Dashboard übertragen muss, gehören in ein `CopyField` – nie nur als Fließtext.
- Die Client ID wird ausschließlich über `checkClientId` (`services/client-id.ts`) geprüft. Die Meldung nennt
  das konkrete Problem (Länge, unerlaubte Zeichen, versehentlich eine URL), nicht bloß „ungültig".
- Jeder OAuth-Fehler läuft über `describeAuthError` (`services/auth-errors.ts`). Neue Fehlercodes dort
  ergänzen, nicht im Template. Fehlt der eigene Eintrag unter „User Management", lehnt Spotify die Anmeldung
  ohne Erklärung ab – das ist der häufigste Stolperstein, deshalb setzt `userListLikely` in der
  `CallbackView` den direkten Weg zur Lösung nach oben.
- `handleCallback` wirft `SpotifyAuthError` mit dem Code von Spotify (`invalid_client`, `invalid_grant`, …)
  oder einem eigenen (`profile_forbidden`, `state_mismatch`, `missing_code`, `missing_verifier`). Ein
  generischer `Error` verliert diese Information.

**Sprache**
- UI-Texte, Toasts, Fehlermeldungen, README/Docs und Commit-Beschreibungen: **Deutsch**.
- Bezeichner, Typen und Code-Kommentare: Englisch.

**Styling**
- Tailwind-Utilities direkt im Template. Wiederkehrende Muster als Klassen in `src/style.css` unter `@layer components` (`.btn-primary`, `.card`, `.form-input`, `.status-*`, `.container-custom`).
- Alle themeabhängigen Farben sind CSS-Custom-Properties und stehen genau einmal in `src/style.css`: `:root` ist Light, `.dark` überschreibt auf Dark. `tailwind.config.js` referenziert sie über `rgb(var(--color-x) / <alpha-value>)`, Opacity-Modifier wie `bg-surface/80` funktionieren also weiter. Ein neuer Farbwert gehört als Token in **beide** Blöcke, nie als fester Wert in die Config oder ins Template.
- Tokens: Flächen `background`, `surface`, `surface-muted`, `surface-raised`; Linien `border`, `border-strong`; Text `text`, `text-secondary`, `text-muted`; Marke `brand`, `brand-strong` (Bernstein als Text, Rand oder Ring), `on-primary` (Text auf der Markenfläche), `on-status` (Icon auf farbiger Statusfläche); Status `success`, `error`, `warning`, `info` jeweils mit `-surface` und `-border`; dazu `spotify-line` für die grüne Linie am Spotify-Knopf.
- Die Skala `primary-50…900` bleibt fest: Das Marken-Bernstein `#E6A62E` ist in beiden Themes dieselbe Füllfarbe. Als **Text** oder Rand darf sie nicht verwendet werden – dafür gibt es `brand`, weil `#E6A62E` auf hellem Grund nur 1,9:1 erreicht. Aus demselben Grund steht auf Bernsteinflächen `text-on-primary` (nahezu Schwarz) statt Weiß.
- **Spotify-Grün ist keine Markenfarbe mehr.** Es bleibt allein dort, wo die Oberfläche auf Spotify selbst wirkt: der Anmeldeknopf, Klasse `.btn-spotify` in `src/style.css` (`bg-spotify`, Rand `border-spotify-line`, Label `text-on-spotify`). Die Klasse steht in `style.css` und nicht im Template, weil `#1DB954` ein fester Wert ist und `theme-tokens.test.ts` nur Templates prüft. Nirgends sonst Grün als Marke einsetzen.
- Das Zeichen ist eine Schallplatte mit Rille, Spindelloch und einem Pfeil gegen die Drehrichtung (`public/favicon.svg`, inline identisch in der Navigation in `src/App.vue`). Kein Häkchen, keine Anlehnung an Spotifys Bildsprache.
- Keine Farben aus Tailwinds fester Palette (`text-white`, `bg-gray-800`, …) im Template; `src/__tests__/theme-tokens.test.ts` bricht darüber.
- Kontraste: Jeder Text-Token erreicht auf jeder Fläche desselben Themes mindestens 4,5:1, Ränder und Marke mindestens 3:1. `src/__tests__/theme-contrast.test.ts` rechnet das bei jedem Lauf nach; eine Palettenänderung muss dort grün bleiben.
- Dark Mode über die Klasse `dark` auf `<html>`, gesteuert vom Theme-Store. `public/theme-init.js` setzt die Klasse schon vor dem ersten Paint; die Datei liegt bewusst in `public/` und nicht inline, weil die CSP nur `script-src 'self'` erlaubt. Speicher-Key und Werte dort mit `stores/theme.ts` synchron halten.

**Responsive**
- Zielbreiten sind 320, 375 und 414 px. Nichts darf horizontal scrollen und kein Text aus seiner Karte laufen;
  `tests/layout-overflow.test.ts` misst das gegen den gebauten Stand.
- Der globale Umbruch steht als `overflow-wrap: break-word` auf `body` in `src/style.css`. Er vererbt sich und
  bricht nur Wörter, die sonst überlaufen würden – nötig, weil Playlist-Namen, Anzeigenamen und API-Fehlertexte
  von Spotify kommen und ein einzelnes 100-Zeichen-Token sein können.
- Das reicht in Flex- und Grid-Zeilen aber nicht: Ein Flex-Kind hat `min-width: auto` und schrumpft nicht unter
  seinen Inhalt. Deshalb bekommt der Textcontainer neben einem `flex-shrink-0`-Icon, -Badge oder -Avatar immer
  `min-w-0`; ohne das schiebt der Text die Zeile aus dem Viewport, statt umzubrechen.
- Mehrspaltige Raster nur dort fest lassen, wo die Spalte bei 320 px noch Text trägt. Faustwert: bei drei
  Spalten bleiben rund 85 px je Karte, also `px-2 sm:px-6` statt des `p-6` aus `.card`.
- `truncate` ist erlaubt und vom Test ausgenommen, aber nur, wo eine Kürzung gewollt ist und die Spalte breit
  genug bleibt, um etwas zu erkennen.

**Persistenz im Browser**
- Nur im Arbeitsspeicher (Pinia-State, nirgends persistiert): Access-Token und `expiresAt`.
- `sessionStorage`: `spotify_refresh_token`, `spotify_user`, `spotify_granted_scopes` sowie während des OAuth-Flows `spotify_code_verifier` und `spotify_auth_state`.
- `localStorage`: `spotify_client_id`, `spotify_redirect_uri`, `theme-preference`.
- Alte Token-Keys im `localStorage` (`spotify_access_token`, `spotify_refresh_token`, `spotify_expires_at`, `spotify_user`) werden beim Start einmalig gelöscht (Migration in `stores/auth.ts`).
- Alle Spotify-Keys stehen zentral in `STORAGE_KEYS` (`src/stores/auth.ts`). Einzige Ausnahme ist `theme-preference`, das noch als Literal in `stores/theme.ts` steht. Neue Keys in `STORAGE_KEYS`, hier und in `PRIVACY.md` dokumentieren.

**Sicherheit**
- Kein Client-Secret, keine API-Keys im Repo oder in `.env`. Die Client-ID gibt der Nutzer in der App ein.
- Security-Header liefert der Webserver über `deploy/backspin.caddy`, die CSP steht zusätzlich als `<meta http-equiv>` in `index.html`. Keine Drittanbieter-Ressourcen: Inter kommt selbst gehostet aus `@fontsource/inter` (in `src/main.ts` importiert), Google Fonts ist entfernt. Neue externe Quellen brauchen einen CSP-Eintrag an beiden Stellen.
- Hochgeladene Backup-Dateien laufen zuerst durch `validateBackupFile` (`src/services/validate-backup.ts`), danach durch `normalizeBackup`.
- Spotify-API-Endpunkte: lesend `/v1/me`, `/v1/me/playlists`, `/v1/playlists/{id}/items`, `/v1/me/tracks`, `/v1/me/albums`, `/v1/me/following`; schreibend `POST /v1/me/playlists`, `POST /v1/playlists/{id}/items` (max. 100 URIs), `PUT /v1/me/library?uris=` und `GET /v1/me/library/contains?uris=` (max. 40 URIs). Deprecated Endpunkte (`/v1/users/{id}/playlists`, `PUT /me/tracks`) nicht verwenden; `PUT /v1/me/following?type=artist&ids=` nur als Fallback fürs Folgen von Künstlern (die Spec listet Artist-URIs nicht für `PUT /me/library`).
- Scopes (`SCOPES` in `composables/useSpotifyAuth.ts`): Lesen `playlist-read-private`, `playlist-read-collaborative`, `user-library-read`, `user-follow-read`, `user-read-private`, `user-read-email`; Schreiben (Import) `playlist-modify-public`, `playlist-modify-private`, `user-library-modify`, `user-follow-modify` (Liste auch in `IMPORT_SCOPES`, `stores/auth.ts`). Eine Änderung der Liste zwingt alle Nutzer zu einem erneuten Login. Die erteilten Scopes stehen nach dem Login in `authStore.grantedScopes`, geprüft über `hasImportScopes`.
- Änderungen an Auth/Token-Handling gegen `SECURITY.md` und `PRIVACY.md` abgleichen.

**Git**
- Commit-Präfixe wie in der Historie: `feat:`, `fix:`, `docs:`, `chore:`.
- Feature-Branches, PR gegen `main`, kleine fokussierte Änderungen.

## Bekannte Baustellen (Stand September 2026)

- **Einmal gegen die echte Spotify-API gelaufen, drei Stellen bleiben offen.** Am 09.09.2026 lief ein vollständiger Durchlauf mit einem Premium-Account über 156 Playlists. Dabei antworteten 47 der 156 Playlists mit HTTP 403, betroffen waren ausschließlich abonnierte fremde Playlists; `GET /me/library/contains` nimmt Artist-URIs an. Unsicher bleiben die drei im Code markierten Stellen: das Folgen von Künstlern funktioniert, aber welcher Pfad greift (`PUT /me/library` oder der Fallback `PUT /me/following`), ist unbestimmt, weil der Fallback den 400 still abfängt; dazu der Wortlaut der 403-Antwort bei fehlenden Scopes (`isInsufficientScope` in `stores/import.ts` prüft auf `insufficient`/`scope`) und die Frage, ob `POST /playlists/{id}/items` Episoden-URIs annimmt.
- **Light-Mode ist vollwertig** (seit dem Token-Umbau). Beide Themes kommen aus derselben Token-Liste in `src/style.css`; die alte Neutral-Rampe `accent-*` und die ungenutzte `secondary`-Rampe sind entfallen. Geprüft ist er rechnerisch über den Kontrast-Test und optisch über alle Views. Offen bleibt, dass `ThemeToggle` nur zwischen Light und Dark umschaltet: Der Store kennt zusätzlich `auto`, die UI bietet es nach dem ersten Klick aber nicht mehr an.
- **Deploy läuft per `deploy/deploy.sh` auf dem Host, es gibt keinen CI-Deploy.** Die CI baut nur; ausgeliefert wird der Stand, den das Skript auf dem Host aus `origin/main` baut. Der Live-Stand ist damit nicht automatisch einem Commit zuzuordnen. Seit dem Umstieg auf Caddy meldet `npm audit` sowohl im vollen Baum als auch mit `--omit=dev` null Findings.
- **Zwei Vue-Umbruchregeln sind bewusst aus.** `vue/max-attributes-per-line` und `vue/singleline-html-element-content-newline` aus `flat/recommended` sind in `eslint.config.js` mit Begründung deaktiviert: Sie würden die kompakten Tailwind-Templates über hunderte Stellen neu umbrechen, obwohl das Projekt laut Konvention ohne Prettier auskommt. Alle inhaltlichen Regeln (`vue/attributes-order`, `vue/html-self-closing`, …) sind aktiv.
- `og:url` und `twitter:url` sind aus `index.html` entfernt, weil sie auf eine fremde Domain zeigten und die URL beim Selbsthosten ohnehin nicht feststeht. Der Produktname lautet „Backspin" überall gleich: in den Routen-Titeln (`src/main.ts`), in Navigation und Footer (`src/App.vue`), im `author`-Meta-Tag und im `<title>` (`index.html`), in `package.json` und in `src/views/GuideView.vue`. Die alten Namen „SpotMyBackup 2" und „MySpotBackup 2.0" dürfen nirgends mehr auftauchen; `src/__tests__/main.test.ts` und `App.test.ts` prüfen das. Ausgenommen sind die Herkunftsangaben: der MIT-Copyright-Vermerk in `LICENSE`, die Danksagungen in `README.md` und die Fußzeile in `src/App.vue` nennen SpotMyBackup 2 weiterhin. Der Export-Dateiname beginnt mit `backspin-` (`services/export.ts`). Die Jahreszahl im Footer kommt aus `new Date().getFullYear()` und ist nicht fest eingetragen.
- `added_at` der Liked Songs lässt sich beim Import nicht wiederherstellen (`PUT /me/library` kennt keine Zeitstempel), deshalb werden sie in umgekehrter Reihenfolge gespeichert. Playlist-Cover und lokale Dateien lassen sich ebenfalls nicht wiederherstellen.
- Backup-Format 2.2: Playlist-Tracks liegen als `SpotifyPlaylistItem[]` (mit `added_at`, `is_local`) unter `tracks.items` (seit 2.1); 2.2 deklariert zusätzlich das optionale `external_ids` an `SpotifyTrack` (`isrc`) und `SpotifyAlbum` (`upc`), das die API ohnehin mitliefert. Die Formate 2.0 und 2.1 werden beim Import über `normalizeBackup` gehoben; für die externen IDs ist diese Hebung ein No-op: Ein älteres Backup, das die ISRC schon enthält – der Regelfall, weil `services/spotify.ts` nie ein `fields=` gesetzt und das Feld nie herausgefiltert hat –, behält sie, eines ohne bleibt ohne. Der CSV-Export liest die ISRC also allein aus den Daten, nicht aus der Formatversion.
- Seit Februar 2026 verlangt Spotify für Apps im Development Mode Premium-Accounts und erlaubt max. 5 Nutzer pro App (siehe README). Im selben Zug hat Spotify `GET /me` um `email`, `country`, `product` und `followers` gekürzt und `track`/`tracks.total` in `item`/`items.total` umbenannt; `services/spotify.ts` liest beide Formen.
- Der Umsetzungsstand aller Analyse-Maßnahmen steht in `ANALYSE.md` unter „Umsetzungsstand" und „Nächste Schritte".
