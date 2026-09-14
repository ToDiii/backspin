# Datenschutz / Privacy

Diese Anwendung ist bewusst so gebaut, dass keine personenbezogenen Daten auf einem Server der Instanz gespeichert werden. Die App ist ein statisches Frontend und kommuniziert direkt mit der Spotify Web API.

## Was wird gespeichert?
Alles bleibt in deinem Browser, nichts davon erreicht den Server, der die App ausliefert.

Nur im Arbeitsspeicher (weg, sobald du die Seite neu lädst oder schließt):
- Access-Token und dessen Ablaufzeitpunkt.

Im `sessionStorage` (weg, sobald du den Tab schließt):
- Refresh-Token (`spotify_refresh_token`) und dein Spotify-Profil (`spotify_user`), damit die Sitzung im Tab bestehen bleibt.
- Die von Spotify erteilten Berechtigungen (`spotify_granted_scopes`), damit die App vor einem Import prüfen kann, ob Schreibrechte vorliegen.
- Während des OAuth-Flows der PKCE Code Verifier (`spotify_code_verifier`) und ein zufälliger CSRF-Schutzwert (`spotify_auth_state`); beide werden nach Abschluss des Flows entfernt – auch im Fehlerfall und beim Abmelden.

Im `localStorage` (bleibt bis zum Löschen erhalten):
- Deine lokal eingegebene Spotify Client-ID (`spotify_client_id`) und die Redirect-URI (`spotify_redirect_uri`).
- Die Theme-Präferenz (`theme-preference`, `light`/`dark`).

Frühere Versionen haben Tokens im `localStorage` abgelegt. Diese Schlüssel (`spotify_access_token`, `spotify_refresh_token`, `spotify_expires_at`, `spotify_user`) werden beim Start der App automatisch gelöscht.

Siehe Implementierung im Code:
- `src/composables/useSpotifyAuth.ts` (OAuth-Flow, `sessionStorage` für `spotify_code_verifier` und `spotify_auth_state`)
- `src/services/pkce.ts` (Erzeugung von Code Verifier, Code Challenge und CSRF-State)
- `src/stores/auth.ts` (Access-Token nur im Speicher, Refresh-Token und Nutzer im `sessionStorage`)
- `src/stores/theme.ts` (Theme-Präferenz im `localStorage`)

## Was wird nicht gespeichert?
- Es gibt keinen eigenen Backend-Server für Nutzerdaten.
- Es gibt keine Tracking-Cookies, kein Analytics und keine serverseitigen Nutzerprofile.
- Die App selbst legt keine serverseitigen Protokolle über personenbezogene Anfragen an. Ob der Webserver oder ein davorgeschaltetes CDN Zugriffe protokolliert, entscheidet der Betreiber der Instanz (siehe „Datenflüsse“).
- Es werden keine Ressourcen von Drittanbietern geladen: Die Schrift „Inter“ liefert die Instanz selbst aus, Google Fonts wird nicht mehr eingebunden (dadurch geht auch keine IP-Adresse mehr an Google).

## Datenflüsse
- Dein Browser kommuniziert direkt mit den Spotify-Endpunkten:
  - `https://accounts.spotify.com/api/token` (Token-Austausch/Refresh)
  - `https://api.spotify.com/v1/*` (Lesen deiner Daten für das Backup und, nur wenn du einen Import startest, Schreiben in deinen Account: Playlists anlegen, Titel hinzufügen, Songs und Alben speichern, Künstlern folgen)
- Das Frontend selbst wird als statische Dateien hinter einem Caddy-Webserver ausgeliefert, betrieben vom jeweiligen Fork-Betreiber. Läuft davor ein CDN beziehungsweise ein Tunnel wie Cloudflare, sieht dieser die Verbindungsmetadaten (IP-Adresse, Zeitpunkt, angefragter Pfad, User-Agent) und terminiert die TLS-Verbindung. Die App selbst verarbeitet Daten ausschließlich clientseitig; die Backup-Inhalte laufen zu keinem Zeitpunkt über den Webserver.

## Wie kann ich meine Daten löschen?
- In der App über „Abmelden“ werden Tokens im Browser entfernt, die OAuth-Zwischenwerte gelöscht und die im Speicher gehaltenen Backup-Daten verworfen; das Schließen des Tabs beendet die Sitzung ohnehin.
- Du kannst jederzeit den Browser-Storage (localStorage/sessionStorage) manuell leeren.
- Du kannst im Spotify Dashboard den App-Zugriff widerrufen, um Tokens ungültig zu machen.

## Verantwortliche Stelle
Verantwortliche Stelle im datenschutzrechtlichen Sinn ist immer der Betreiber der jeweiligen Instanz, also wer dieses `dist/` unter seiner Domain ausliefert. Das ist weder das Projekt Backspin noch der Autor des Quellcodes: Beide stellen nur den Code bereit und betreiben keine Instanz und keinen Server, über den Daten von Nutzern laufen.

Diese Datei ist deshalb eine Vorlage. Wer eine Instanz betreibt, trägt seine eigenen Angaben hier ein:

```
Verantwortlich für diese Instanz:
<NAME DES BETREIBERS>
<ANSCHRIFT>
<KONTAKT-E-MAIL>
```

Solange die Platzhalter `<NAME DES BETREIBERS>`, `<ANSCHRIFT>` und `<KONTAKT-E-MAIL>` nicht ersetzt sind, ist diese Datenschutzerklärung unvollständig: Es fehlt die Angabe, an wen sich Nutzer mit Fragen oder Auskunftsersuchen wenden können. Welche Angaben ein Betreiber darüber hinaus machen muss, hängt von seinem Deployment und seinem Rechtsraum ab und wird hier nicht beantwortet.

## Transparenz
Der vollständige Quellcode ist öffentlich einsehbar (GitHub). Bitte prüfe bei Bedarf die oben genannten Dateien, um das Verhalten der App zu verifizieren.
