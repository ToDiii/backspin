# Deployment mit Caddy

Backspin ist eine reine Client-App. Es gibt kein Backend und keine
Datenbank; ein Deploy besteht darin, das Repository zu bauen und das erzeugte
`dist/` statisch auszuliefern. Diese Anleitung beschreibt den Weg über
[Caddy 2](https://caddyserver.com/) auf einem Linux-Host.

## Dateien in diesem Verzeichnis

| Datei | Zweck |
|---|---|
| `backspin.caddy` | Der eigentliche Inhalt: Wurzelverzeichnis, Kompression, Security-Header, Cache-Regeln, SPA-Fallback. Wird von beiden Caddyfiles per `import` eingebunden, damit die Header nur an einer Stelle stehen. |
| `Caddyfile.site` | Site-Block zum Einfügen in ein bestehendes Caddyfile. Für Hosts hinter einem Tunnel (TLS extern, Caddy intern nur HTTP). |
| `Caddyfile.standalone` | Vollständiges Caddyfile für einen Host, auf dem Caddy selbst Auto-HTTPS macht. |
| `deploy.sh` | Update-Skript für den Host: neuesten `main`-Stand holen, bauen, Caddy neu laden. |

Beide Caddyfiles enthalten denselben Inhalt und unterscheiden sich nur darin,
wie die Adresse notiert ist. `<deine-domain>` ist überall ein Platzhalter: In
keiner Datei dieses Repositories steht eine feste Domain, die App leitet ihre
Redirect-URI zur Laufzeit aus `window.location.origin` ab. Wer die Beispiele
wörtlich nachvollziehen will, setzt für `<deine-domain>` seine eigene Adresse
ein, etwa `backspin.maxds.me`.

## Voraussetzungen auf dem Host

- Node.js >= 22.12 und npm (siehe `.nvmrc` im Repository)
- git
- Caddy 2, als systemd-Dienst `caddy` installiert
- Der Nutzer, der `deploy.sh` ausführt, darf `systemctl reload caddy` aufrufen

## 1. Deploy-Key erzeugen und in GitHub eintragen

Das Repository ist öffentlich, ein Klon über HTTPS funktioniert also auch ohne
Schlüssel. Ein Deploy-Key hat trotzdem Vorteile: Er bindet den Host an genau
dieses Repository, funktioniert unverändert, falls das Repository später
privat wird, und braucht kein Passwort im Skript.

Auf dem Host, als der Nutzer, dem der Klon gehören soll:

```bash
ssh-keygen -t ed25519 -C "backspin-deploy" -f ~/.ssh/backspin_deploy -N ""
cat ~/.ssh/backspin_deploy.pub
```

Den ausgegebenen öffentlichen Schlüssel in GitHub eintragen: Repository,
Settings, Deploy keys, Add deploy key. Titel frei wählen, den Schlüssel
einfügen und **"Allow write access" nicht** anhaken. Der Host soll nur lesen.

Damit git den Schlüssel benutzt, in `~/.ssh/config` ergänzen:

```
Host github.com-backspin
    HostName github.com
    User git
    IdentityFile ~/.ssh/backspin_deploy
    IdentitiesOnly yes
```

Verbindung einmal testen (die Antwort "does not provide shell access" ist der
Erfolgsfall):

```bash
ssh -T git@github.com-backspin
```

## 2. Klon nach /opt/backspin

```bash
sudo mkdir -p /opt/backspin
sudo chown "$USER":"$USER" /opt/backspin
git clone git@github.com-backspin:ToDiii/backspin.git /opt/backspin
```

Ohne Deploy-Key genügt stattdessen:

```bash
git clone https://github.com/ToDiii/backspin.git /opt/backspin
```

## 3. Erster Build

```bash
cd /opt/backspin
npm ci --no-audit --no-fund
npm run build
```

Danach liegt die fertige Seite in `/opt/backspin/dist`. Genau auf dieses
Verzeichnis zeigt `root` in `backspin.caddy`. Eine `.env` wird nicht
gebraucht, die Spotify Client-ID gibt der Nutzer später in der App ein.

## 4. Caddy einbinden

Die Snippet-Datei an einen festen Ort legen:

```bash
sudo cp /opt/backspin/deploy/backspin.caddy /etc/caddy/backspin.caddy
```

### Variante A: bestehendes Caddyfile hinter einem Tunnel

Der Host liefert bereits andere Seiten auf Port 80 aus und ist von außen über
einen Tunnel erreichbar, der TLS terminiert. Im globalen Optionsblock steht
dort `auto_https off`, Caddy spricht intern nur HTTP.

In `/etc/caddy/Caddyfile` den Inhalt von `Caddyfile.site` ergänzen, also die
`import`-Zeile und den Site-Block. Wichtig: Der `import` der Snippet-Datei
steht auf oberster Ebene und **vor** dem Site-Block, der ihn verwendet.

```
import /etc/caddy/backspin.caddy

http://<deine-domain> {
	import backspin
}
```

Das Präfix `http://` ist bei `auto_https off` nicht optional: Ohne das Präfix
würde Caddy die Adresse als HTTPS-Site behandeln und auf Port 443 lauschen,
den der Tunnel gar nicht anspricht.

### Variante B: Caddy macht Auto-HTTPS selbst

`Caddyfile.standalone` als `/etc/caddy/Caddyfile` verwenden, `<deine-domain>`
und die E-Mail-Adresse ersetzen. Voraussetzung: Port 80 und 443 sind von außen
erreichbar und der DNS-Record der Domain zeigt auf diesen Host.

### Prüfen und neu laden

```bash
caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

`caddy validate` meldet Syntaxfehler, bevor der laufende Dienst sie zu sehen
bekommt. `reload` tauscht die Konfiguration ohne Verbindungsabbruch aus.

## 5. Tunnel oder DNS auf den Host zeigen lassen

- **Mit Tunnel:** Im Tunnel eine Ingress-Regel anlegen, die `<deine-domain>`
  auf den Host und den Port weiterleitet, auf dem Caddy lauscht (bei Variante A
  ist das Port 80, also ein Ziel der Form `http://<host>:80`). Der öffentliche
  DNS-Record der Domain zeigt dann auf den Tunnel, nicht auf den Host.
- **Ohne Tunnel:** Einen A- beziehungsweise AAAA-Record für `<deine-domain>`
  auf die öffentliche IP-Adresse des Hosts setzen und Port 80 und 443
  freigeben.

## 6. Spotify Redirect-URI eintragen

Im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) die
eigene App öffnen, unter Settings die Redirect-URI eintragen:

```
https://<deine-domain>/callback
```

Exakt so, mit `https` und ohne abschließenden Schrägstrich. Die App leitet den
Wert aus `window.location.origin` ab, er muss also genau der Adresse
entsprechen, unter der die Seite aufgerufen wird.

Im selben Dialog den eigenen Spotify-Account in die Nutzerliste aufnehmen:
Apps im Development Mode erlauben höchstens 5 autorisierte Nutzer, und jeder
davon braucht Spotify Premium.

Anschließend in der App die Seite `/setup` öffnen und die Client-ID
hinterlegen. Sie wird nur im `localStorage` des Browsers gespeichert.

## 7. Verantwortliche Stelle in PRIVACY.md eintragen

`PRIVACY.md` im Repository ist eine Vorlage. Verantwortliche Stelle im
datenschutzrechtlichen Sinn ist der Betreiber dieser Instanz, nicht das Projekt
und nicht der Autor des Quellcodes. Im Abschnitt „Verantwortliche Stelle“
stehen deshalb die Platzhalter `<NAME DES BETREIBERS>`, `<ANSCHRIFT>` und
`<KONTAKT-E-MAIL>`; solange sie unersetzt sind, fehlt die Angabe, an wen sich
Nutzer mit Fragen wenden können.

Die Angaben gehören in den eigenen Fork und damit in den Stand, den `deploy.sh`
aus `origin/main` baut. Eine Änderung direkt im Klon unter `/opt/backspin`
überlebt das nächste Update nicht, weil das Skript mit `git reset --hard`
arbeitet (siehe Abschnitt „Updates“).

## 8. Header kontrollieren

Die ausgelieferten Header stimmen nicht automatisch mit der Konfiguration
überein, deshalb einmal direkt abfragen:

```bash
curl -I https://<deine-domain>/
# Ein konkreter Dateiname aus /opt/backspin/dist/assets/, die Namen sind gehasht:
curl -I "https://<deine-domain>/assets/$(ls /opt/backspin/dist/assets | grep '\.js$' | head -1)"
```

Erwartet werden für `/`:

- `content-security-policy` mit `connect-src 'self' https://api.spotify.com https://accounts.spotify.com`
- `strict-transport-security: max-age=31536000; includeSubDomains`
- `x-content-type-options: nosniff`, `x-frame-options: DENY`
- `referrer-policy: strict-origin-when-cross-origin`
- `permissions-policy: camera=(), microphone=(), geolocation=()`
- `cache-control: no-cache`

Für eine Datei unter `/assets/` stattdessen
`cache-control: public, max-age=31536000, immutable`.

Steht ein CDN oder Tunnel davor, kann dieser Header ergänzen oder
überschreiben. Weichen die Werte ab, zuerst direkt gegen den Host prüfen:

```bash
curl -I -H "Host: <deine-domain>" http://127.0.0.1/
```

## 9. Updates

```bash
/opt/backspin/deploy/deploy.sh
```

Das Skript holt `origin/main`, setzt den Arbeitsbaum hart darauf, installiert
die Abhängigkeiten aus dem Lockfile, baut nach `dist/` und lädt Caddy neu. Es
bricht bei jedem Fehler ab (`set -euo pipefail`), es bleibt also kein halb
gebautes `dist/` zurück, wenn der Build fehlschlägt. Lokale Änderungen im
Klon gehen durch `git reset --hard` verloren; das Verzeichnis ist bewusst nur
eine Kopie des Repository-Stands.

Für regelmäßige Deploys eignet sich ein systemd-Timer oder ein Cron-Eintrag,
der `deploy.sh` aufruft.

## Content Security Policy an zwei Stellen

Die CSP steht doppelt im Projekt:

1. als Header in `deploy/backspin.caddy`
2. als `<meta http-equiv="Content-Security-Policy">` in `index.html`

Das ist Absicht: Der Meta-Tag greift auch dann, wenn die Seite von einem
anderen Host ohne passende Header ausgeliefert wird. Beide Stellen müssen
inhaltlich übereinstimmen. Wer eine neue externe Quelle einbindet, also ein
Skript, eine Schrift, eine Bildquelle oder einen API-Host, muss sie in beiden
Dateien eintragen. Zwei unterschiedliche Policies heben sich nicht auf,
sondern gelten beide, und der Browser wendet jeweils die strengere an.

`frame-ancestors` ist im Meta-Tag wirkungslos und steht deshalb nur im Header.
