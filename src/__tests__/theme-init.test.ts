import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `public/theme-init.js` runs before the first paint and duplicates the theme
 * decision of `src/stores/theme.ts` in plain JavaScript, because it has to be
 * served as a static file (the CSP forbids an inline script). The test lives
 * here since public/ is not part of the module tree; it evaluates the file the
 * same way the browser would.
 */
const source = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf8')

const runWith = (options: { stored?: string; prefersDark?: boolean }): void => {
  document.documentElement.className = ''
  localStorage.clear()
  if (options.stored !== undefined) localStorage.setItem('theme-preference', options.stored)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: options.prefersDark ?? false })))
  new Function(source)()
}

const classes = (): string[] => Array.from(document.documentElement.classList)

beforeEach(() => {
  document.documentElement.className = ''
})

describe('pre-paint theme bootstrap', () => {
  it('follows a dark system preference when nothing is stored', () => {
    runWith({ prefersDark: true })
    expect(classes()).toEqual(['dark'])
  })

  it('follows a light system preference when nothing is stored', () => {
    runWith({ prefersDark: false })
    expect(classes()).toEqual(['light'])
  })

  it('honours a stored dark choice against a light system', () => {
    runWith({ stored: 'dark', prefersDark: false })
    expect(classes()).toEqual(['dark'])
  })

  it('honours a stored light choice against a dark system', () => {
    runWith({ stored: 'light', prefersDark: true })
    expect(classes()).toEqual(['light'])
  })

  it('treats a stored auto like no choice at all', () => {
    runWith({ stored: 'auto', prefersDark: true })
    expect(classes()).toEqual(['dark'])
  })

  it('falls back to light when storage is unavailable', () => {
    document.documentElement.className = ''
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled')
      },
    })

    new Function(source)()

    expect(classes()).toEqual(['light'])
  })
})
