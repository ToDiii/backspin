import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import type { Browser, Page, Route } from 'playwright'
import { preview } from 'vite'
import type { PreviewServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Guards the app against horizontal overflow on phones.
 *
 * happy-dom has no layout engine, so this is the one suite that drives a real
 * browser: it serves the production build, walks every view at the three
 * common phone widths and measures what actually got laid out. It is not part
 * of `npm test` because it needs a Chromium binary; CI runs it as its own step
 * (`npm run test:layout`) after the build.
 *
 * Two things are checked, matching the two ways this breaks in practice:
 *   1. The document must not scroll sideways at all.
 *   2. No box may spill its own content, which is how a long playlist name
 *      used to run out of its card without widening the page.
 */

const WIDTHS = [320, 375, 414] as const

/** Spotify allows 100 characters per playlist name, emoji included. */
const LONG_NAME = '🎧 Sommer 2024 — Roadtrip durch Südfrankreich mit den Jungs und allen Klassikern 🌊🍷☀️ Teil 2'
/** The harder case: no space at all, so the line can only break inside the word. */
const UNBREAKABLE_NAME = 'Musik_zum_Programmieren_ohne_Leerzeichen_und_sehr_lang_damit_nichts_umbrechen_kann_abcdefghij'

const USER = {
  id: 'maxi',
  display_name: 'Maxi Muster mit einem außergewöhnlich langen Anzeigenamen',
  email: 'maxi.muster.mit.langer.adresse@beispiel-domain-die-lang-ist.example.com',
  images: [],
}

const SCOPES = [
  'playlist-read-private', 'playlist-read-collaborative', 'user-library-read',
  'user-follow-read', 'user-read-private', 'user-read-email',
  'playlist-modify-public', 'playlist-modify-private', 'user-library-modify',
  'user-follow-modify',
]

const makeTrack = (index: number) => ({
  added_at: '2026-01-01T10:00:00Z',
  is_local: false,
  item: {
    id: `t${index}`,
    name: `Ein außergewöhnlich langer Songtitel der nicht umbrechen möchte ${index}`,
    uri: `spotify:track:t${index}`,
    duration_ms: 200000,
    artists: [{ id: 'a1', name: `Künstler mit sehr langem Namen ${index}` }],
    album: { id: 'al1', name: `Album ${index}`, images: [] },
  },
})

const makePlaylist = (index: number, name: string) => ({
  id: `p${index}`,
  name,
  uri: `spotify:playlist:p${index}`,
  public: index % 2 === 0,
  collaborative: false,
  description: `Eine ziemlich lange Beschreibung der Playlist, die auf schmalen Displays umbrechen muss ${index}`,
  images: [],
  owner: { id: 'maxi', display_name: 'Maxi Muster' },
  items: { total: 12 },
  tracks: { total: 12 },
})

const asJson = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

/** Answers every Spotify call from fixtures; two playlists fail with 403. */
const stubSpotify = async (page: Page): Promise<void> => {
  await page.route('**/accounts.spotify.com/api/token', (route: Route) =>
    route.fulfill(asJson({
      access_token: 'fake-token',
      refresh_token: 'fake-refresh',
      expires_in: 3600,
      scope: SCOPES.join(' '),
    })))

  await page.route('**/api.spotify.com/**', (route: Route) => {
    const path = new URL(route.request().url()).pathname

    if (path === '/v1/me') return route.fulfill(asJson(USER))
    if (path === '/v1/me/playlists') {
      return route.fulfill(asJson({
        items: [
          makePlaylist(1, LONG_NAME),
          makePlaylist(2, UNBREAKABLE_NAME),
          makePlaylist(3, 'Kurz'),
          makePlaylist(4, 'Abendlicht'),
        ],
        next: null,
        total: 4,
      }))
    }
    // The two long named playlists fail, so their names land in the result card
    if (/^\/v1\/playlists\/p[12]\/items$/.test(path)) {
      return route.fulfill(asJson({ error: { status: 403, message: 'Forbidden' } }, 403))
    }
    if (/^\/v1\/playlists\/.+\/items$/.test(path)) {
      return route.fulfill(asJson({ items: [makeTrack(1), makeTrack(2)], next: null, total: 2 }))
    }
    if (path === '/v1/me/tracks') {
      const track = makeTrack(3)
      return route.fulfill(asJson({
        items: [{ added_at: track.added_at, track: track.item, item: track.item }],
        next: null,
        total: 1,
      }))
    }
    if (path === '/v1/me/albums') {
      return route.fulfill(asJson({
        items: [{
          added_at: '2026-02-01T10:00:00Z',
          album: { id: 'al9', name: 'Ganzes Album', uri: 'spotify:album:al9', artists: [{ id: 'a2', name: 'Band' }], images: [] },
        }],
        next: null,
        total: 1,
      }))
    }
    if (path === '/v1/me/following') {
      return route.fulfill(asJson({
        artists: { items: [{ id: 'a1', name: 'Artist 1', uri: 'spotify:artist:a1', images: [] }], cursors: { after: null }, next: null, total: 1 },
      }))
    }
    return route.fulfill(asJson({}))
  })
}

/** Pretends a finished login so the guarded views render their real content. */
const seedSession = (): void => {
  localStorage.setItem('spotify_client_id', '0123456789abcdef0123456789abcdef')
  sessionStorage.setItem('spotify_refresh_token', 'fake-refresh')
  sessionStorage.setItem('spotify_user', JSON.stringify({
    id: 'maxi',
    display_name: 'Maxi Muster mit einem außergewöhnlich langen Anzeigenamen',
    email: 'maxi.muster.mit.langer.adresse@beispiel-domain-die-lang-ist.example.com',
    images: [],
  }))
  sessionStorage.setItem('spotify_granted_scopes', JSON.stringify([
    'playlist-read-private', 'playlist-read-collaborative', 'user-library-read',
    'user-follow-read', 'user-read-private', 'user-read-email',
    'playlist-modify-public', 'playlist-modify-private', 'user-library-modify',
    'user-follow-modify',
  ]))
}

interface Offender {
  tag: string
  cls: string
  text: string
  overflow: number
  kind: 'page' | 'box'
}

/**
 * Runs inside the page. Reports the document scrolling sideways and every box
 * whose content sticks out of it.
 *
 * Two kinds of element are exempt from the box check: those that clip or scroll
 * their own overflow (`truncate` is exactly that, and its ellipsis is the point),
 * and those holding an out-of-flow child, because a badge placed with negative
 * offsets is meant to stick out.
 */
const collectOverflow = (): Offender[] => {
  const root = document.documentElement
  const found: Offender[] = []

  if (root.scrollWidth - root.clientWidth > 1) {
    found.push({
      tag: 'html',
      cls: '',
      text: '',
      overflow: root.scrollWidth - root.clientWidth,
      kind: 'page',
    })
  }

  for (const element of Array.from(document.querySelectorAll('*'))) {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue

    const style = getComputedStyle(element)
    if (style.overflowX !== 'visible') continue
    if (element.querySelector(':scope > *')) {
      const hasOutOfFlowChild = Array.from(element.children).some(child => {
        const position = getComputedStyle(child).position
        return position === 'absolute' || position === 'fixed'
      })
      if (hasOutOfFlowChild) continue
    }

    const overflow = element.scrollWidth - element.clientWidth
    if (overflow > 1) {
      found.push({
        tag: element.tagName.toLowerCase(),
        cls: (typeof element.className === 'string' ? element.className : '').slice(0, 90),
        text: (element.textContent ?? '').trim().slice(0, 60),
        overflow,
        kind: 'box',
      })
    }
  }

  return found
}

const describeOffenders = (offenders: Offender[]): string =>
  offenders
    .map(o => o.kind === 'page'
      ? `Seite scrollt ${o.overflow}px horizontal`
      : `<${o.tag} class="${o.cls}"> ragt ${o.overflow}px aus der eigenen Box: "${o.text}"`)
    .join('\n')

let server: PreviewServer
let browser: Browser
const results = new Map<string, Offender[]>()

const key = (width: number, view: string): string => `${width}:${view}`

beforeAll(async () => {
  if (!existsSync(resolve(process.cwd(), 'dist/index.html'))) {
    throw new Error('dist/ fehlt – zuerst `npm run build` ausführen.')
  }

  server = await preview({ preview: { host: '127.0.0.1', port: 4180, strictPort: false }, logLevel: 'silent' })
  const base = server.resolvedUrls?.local[0]
  if (!base) throw new Error('Vite-Preview lieferte keine URL.')

  // Falls jemand kein von Playwright heruntergeladenes Chromium hat, kann
  // CHROMIUM_EXECUTABLE_PATH auf ein vorhandenes zeigen.
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined })

  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 780 } })
    const page = await context.newPage()
    await stubSpotify(page)
    await page.addInitScript(seedSession)

    const record = async (view: string): Promise<void> => {
      await page.waitForTimeout(350)
      results.set(key(width, view), await page.evaluate(collectOverflow))
    }

    for (const [view, path] of [['landing', '/'], ['setup', '/setup'], ['guide', '/guide']] as const) {
      await page.goto(base + path.slice(1), { waitUntil: 'networkidle' })
      await record(view)
    }

    await page.goto(`${base}backup`, { waitUntil: 'networkidle' })
    await record('backup')

    await page.getByRole('button', { name: /backup erstellen/i }).first().click()
    await page.waitForTimeout(2500)
    await record('backup-result')

    await page.getByText(/Betroffene Playlists/).first().click()
    await record('backup-result-expanded')

    await page.getByRole('button', { name: /vorschau/i }).first().click()
    await page.waitForTimeout(900)
    await record('backup-preview')

    await page.goto(`${base}import`, { waitUntil: 'networkidle' })
    await record('import')

    await page.goto(`${base}callback?error=access_denied`, { waitUntil: 'networkidle' })
    await record('callback')

    await context.close()
  }
}, 240000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

const VIEWS = [
  'landing', 'setup', 'guide', 'backup', 'backup-result',
  'backup-result-expanded', 'backup-preview', 'import', 'callback',
] as const

describe('horizontal overflow on phone widths', () => {
  it('visited every view at every width', () => {
    expect(results.size).toBe(WIDTHS.length * VIEWS.length)
  })

  for (const width of WIDTHS) {
    describe(`${width}px`, () => {
      it.each(VIEWS)('%s stays inside the viewport', view => {
        const offenders = results.get(key(width, view))
        expect(offenders, `${view} wurde nicht gemessen`).toBeDefined()
        expect(describeOffenders(offenders ?? [])).toBe('')
      })
    })
  }
})
