# Security Policy

## Supported versions
- Node.js >= 22.12 (`engines` in `package.json`; getestet mit der Version aus `.nvmrc`, aktuell 22)
- Aktuelle Browser-Versionen entsprechend der Angaben in der README

## Reporting a vulnerability
Zuständig für dieses Repository (`ToDiii/backspin`) ist [@ToDiii](https://github.com/ToDiii). Meldungen an den Autor von `MaximilianRTS/SpotMyBackup2`, dem Projekt, auf das Backspin zurückgeht, erreichen Backspin nicht.

Wenn du eine Schwachstelle findest, melde sie bitte verantwortungsvoll über die private Schwachstellenmeldung von GitHub:
- Im Repository unter „Security" → „Report a vulnerability" ein GitHub Security Advisory anlegen. Der Bericht ist nur für [@ToDiii](https://github.com/ToDiii) sichtbar, nicht öffentlich.
- Eine E-Mail-Adresse gibt es hier bewusst nicht: Das Repository ist öffentlich, eine hier eingetragene Adresse wäre für jeden und für Crawler lesbar.

Bitte keine sensiblen Details öffentlich posten, also insbesondere nicht in einem normalen Issue oder Pull Request, bevor ein Fix bereitsteht.

## Projekt-Charakteristik
- Reines Frontend ohne eigenes Backend.
- OAuth 2.0 mit PKCE (ohne Client Secret im Frontend).
- Token-Haltung im Browser (siehe `src/stores/auth.ts`):
  - Access-Token und Ablaufzeitpunkt liegen ausschließlich im Arbeitsspeicher (Pinia-State) und werden nirgends persistiert.
  - Refresh-Token, Nutzerprofil und die von Spotify erteilten Scopes liegen im `sessionStorage` und sind mit dem Schließen des Tabs weg.
  - Nur Client-ID, Redirect-URI und Theme-Präferenz liegen im `localStorage`.
  - Alte Token-Schlüssel im `localStorage` (`spotify_access_token`, `spotify_refresh_token`, `spotify_expires_at`, `spotify_user`) werden beim Start einmalig gelöscht.
  - PKCE Code Verifier (`spotify_code_verifier`) und der CSRF-State (`spotify_auth_state`) liegen nur während des OAuth-Flows im `sessionStorage` und werden danach entfernt, auch im Fehlerfall und beim Abmelden.
  - Access-Tokens werden mit 60 Sekunden Vorlauf als abgelaufen behandelt und erneuert; Token-Werte werden nie geloggt.

## Security-Header
Der Webserver setzt die Header für alle Pfade. Die mitgelieferte Konfiguration dafür ist der Caddy-Snippet `deploy/backspin.caddy` (eingebunden über `deploy/Caddyfile.site` oder `deploy/Caddyfile.standalone`, Anleitung in `deploy/README.md`). Zusätzlich steht die CSP als `<meta http-equiv>` in `index.html`, damit sie auch bei anderen Hostern greift (ohne `frame-ancestors`, das ist per Meta-Tag wirkungslos):
- `Content-Security-Policy`: `default-src 'self'`, Skripte nur von `'self'` (kein `unsafe-inline`), Styles zusätzlich `'unsafe-inline'` (Vue- und Tailwind-Inline-Styles), Bilder von `'self'`, `data:` sowie den Spotify-Bild-CDNs `*.scdn.co` und `*.spotifycdn.com`, Schriften nur von `'self'`, Verbindungen nur zu `api.spotify.com` und `accounts.spotify.com`, `form-action 'self' https://accounts.spotify.com`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `upgrade-insecure-requests`.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- Die gehashten Build-Artefakte unter `/assets/` werden mit `Cache-Control: public, max-age=31536000, immutable` ausgeliefert, alles andere (die App-Shell, also `/`, `/index.html` und jede SPA-Route) mit `no-cache`.
- *Noch offen:* Die Header sind gegen einen lokalen Caddy geprüft, aber noch nicht am tatsächlich betriebenen Host. Nach dem nächsten Deploy mit `curl -I` verifizieren (siehe `deploy/README.md`). Steht ein CDN oder Tunnel davor, kann dieser Header ergänzen oder überschreiben.
- Es werden keine Drittanbieter-Ressourcen geladen: Die Schrift Inter liegt als `@fontsource/inter` im eigenen Bundle, Google Fonts wird nicht mehr eingebunden.

## Import von Backup-Dateien
`src/services/validate-backup.ts` prüft hochgeladene Dateien vor der Verarbeitung: maximal 50 MB, Dateiname auf `.json` und passender MIME-Typ, gültiges JSON, eine unterstützte Formatversion (`2.0` oder `2.1`) und eine strukturelle Prüfung der Felder (`version`, `exportDate`, `user.id`, `playlists`, `savedTracks`) samt der einzelnen Playlist- und Track-Einträge. Erst danach hebt `normalizeBackup` die Datei auf das aktuelle Format.

## Empfehlungen für Beiträge
- Keine Secrets in Commits oder in der README.
- `npm run type-check && npm run lint && npm test && npm run build` lokal ausführen, bevor PRs erstellt werden.
- Neue externe Quellen (Skripte, Schriften, Bilder, API-Hosts) brauchen einen CSP-Eintrag an zwei Stellen: `deploy/backspin.caddy` und `index.html`.
