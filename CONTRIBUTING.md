# Beitragen (Contributing)

Danke für dein Interesse! So kannst du beitragen:

## Setup
1. Forke das Repository und klone deinen Fork.
2. `npm ci` installieren. Node >= 22.12 ist Pflicht (`engines`, von Vite 7 und Vitest 5 gefordert), getestet wird mit der Version aus `.nvmrc` (22).
3. Eine `.env` ist nicht nötig. Nur wenn du die Redirect-URI überschreiben willst, kopiere `env.example` nach `.env` und setze `VITE_APP_URL`.
4. Entwicklungsserver: `npm run dev`, erreichbar unter `http://127.0.0.1:3000`. Nicht `localhost` verwenden: Spotify akzeptiert `http`-Redirect-URIs nur für Loopback-Adressen, und die App leitet ihre Redirect-URI aus `window.location.origin` ab.

## Qualitätschecks
- Type-Check: `npm run type-check`
- Lint: `npm run lint` (prüfend, `--max-warnings 0`; automatisch korrigieren mit `npm run lint:fix`)
- Tests: `npm test` (Watch-Modus: `npm run test:watch`, Abdeckung: `npm run test:coverage`)
- Build: `npm run build`

Bitte stelle sicher, dass alle vier vor dem PR grün sind – die CI führt genau diese Schritte in dieser Reihenfolge aus.

## Tests
- Test-Runner ist Vitest mit `happy-dom`; `globals` ist aus, `describe`/`it`/`expect`/`vi` werden aus `vitest` importiert.
- Testdateien liegen neben dem getesteten Modul in `__tests__/` und heißen `<modul>.test.ts`
  (z. B. `src/services/__tests__/export.test.ts`).
- Gemeinsame Fixtures stehen in `src/test/fixtures.ts`, das globale Setup in `src/test/setup.ts`.
- Keine echten Netzwerkaufrufe: `fetch` wird im Setup durch einen Guard ersetzt, der jede
  ungemockte Anfrage mit einer klaren Fehlermeldung ablehnt. Jeder Test mockt `fetch` selbst.
- Testbeschreibungen sind – wie der übrige Code – auf Englisch.

## PR-Richtlinien
- Kleine, fokussierte Änderungen mit klarer Beschreibung.
- Keine Secrets/Access-Tokens in Commits.
- Verweise bei sicherheitsrelevanten Änderungen auf `SECURITY.md`.

## Verhaltenskodex
Sei respektvoll und konstruktiv. Wir schätzen sachliche, nachvollziehbare Reviews.
