import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Guards the color tokens in src/style.css against contrast regressions.
 *
 * The tokens are the single source of truth for both themes, so a token that
 * gets nudged for looks can silently push text below WCAG AA. This test reads
 * the stylesheet, resolves both token blocks and checks every text/surface
 * combination the UI can actually produce.
 */

const AA_TEXT = 4.5 // WCAG 2.1 SC 1.4.3, normal size text
const AA_UI = 3 // WCAG 2.1 SC 1.4.11, boundaries of UI components

const stylesheet = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')

type Tokens = Record<string, string>

/** Pulls the `--color-*` declarations out of one selector block. */
const readTokens = (selector: string): Tokens => {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(stylesheet)
  if (!block) throw new Error(`No "${selector}" block found in style.css`)

  const tokens: Tokens = {}
  for (const [, name, value] of block[1].matchAll(/--color-([a-z-]+):\s*([0-9\s]+);/g)) {
    tokens[name] = value.trim()
  }
  return tokens
}

const light = readTokens(':root')
const dark = readTokens('\\.dark')

const channels = (value: string): [number, number, number] => {
  const parts = value.split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((c) => Number.isNaN(c) || c < 0 || c > 255)) {
    throw new Error(`Not an RGB triplet: "${value}"`)
  }
  return parts as [number, number, number]
}

const luminance = (value: string): number => {
  const [r, g, b] = channels(value).map((channel) => {
    const srgb = channel / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string): number => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

/** The brand amber. Fixed in both themes, therefore not a token. */
const PRIMARY = '230 166 46'

/** Spotify green, the fill of the sign in button. Fixed in both themes too. */
const SPOTIFY = '29 185 84'

/** Its near black label. Fixed in tailwind.config.js, therefore not a token. */
const ON_SPOTIFY = '7 19 11'

const NEUTRAL_SURFACES = ['background', 'surface', 'surface-muted', 'surface-raised']
const TEXT_ON_NEUTRAL = ['text', 'text-secondary', 'text-muted', 'brand', 'brand-strong']
const STATUS = ['success', 'error', 'warning'] as const

const themes: Array<[string, Tokens]> = [
  ['light', light],
  ['dark', dark],
]

describe('theme color tokens', () => {
  it('defines the same tokens in both themes', () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort())
  })

  it('defines every token as an RGB triplet', () => {
    for (const [, tokens] of themes) {
      for (const value of Object.values(tokens)) {
        expect(() => channels(value)).not.toThrow()
      }
    }
  })

  describe.each(themes)('%s theme', (_name, tokens) => {
    it.each(
      TEXT_ON_NEUTRAL.flatMap((fg) => NEUTRAL_SURFACES.map((bg) => [fg, bg] as const)),
    )('has AA contrast for %s on %s', (fg, bg) => {
      expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(AA_TEXT)
    })

    it.each(STATUS)('has AA contrast for %s text on its own tinted panel', (status) => {
      expect(contrast(tokens[status], tokens[`${status}-surface`])).toBeGreaterThanOrEqual(AA_TEXT)
    })

    it.each(STATUS)('has AA contrast for %s text on the plain surfaces', (status) => {
      for (const bg of NEUTRAL_SURFACES) {
        expect(contrast(tokens[status], tokens[bg])).toBeGreaterThanOrEqual(AA_TEXT)
      }
    })

    it.each(STATUS)('has AA contrast for body text inside a %s panel', (status) => {
      for (const fg of ['text', 'text-secondary']) {
        expect(contrast(tokens[fg], tokens[`${status}-surface`])).toBeGreaterThanOrEqual(AA_TEXT)
      }
    })

    it('has AA contrast for body text inside an info panel', () => {
      for (const fg of ['text', 'text-secondary']) {
        expect(contrast(tokens[fg], tokens['info-surface'])).toBeGreaterThanOrEqual(AA_TEXT)
      }
    })

    it('has AA contrast for the label on a primary fill', () => {
      expect(contrast(tokens['on-primary'], PRIMARY)).toBeGreaterThanOrEqual(AA_TEXT)
    })

    it('has AA contrast for the label on the Spotify fill', () => {
      // .btn-spotify keeps Spotify's green, so its label needs its own check.
      expect(contrast(ON_SPOTIFY, SPOTIFY)).toBeGreaterThanOrEqual(AA_TEXT)
    })

    it.each(STATUS)('has AA contrast for an icon on a solid %s fill', (status) => {
      expect(contrast(tokens['on-status'], tokens[status])).toBeGreaterThanOrEqual(AA_TEXT)
    })

    it('keeps input borders visible as UI boundaries', () => {
      for (const bg of NEUTRAL_SURFACES) {
        expect(contrast(tokens['border-strong'], tokens[bg])).toBeGreaterThanOrEqual(AA_UI)
      }
    })

    it('keeps the brand border around a primary fill visible', () => {
      // .btn-primary draws `border-brand` around the fixed amber fill, which on
      // its own only reaches 1.9:1 against a light page.
      for (const bg of NEUTRAL_SURFACES) {
        expect(contrast(tokens.brand, tokens[bg])).toBeGreaterThanOrEqual(AA_UI)
      }
    })

    it('keeps the green border around the Spotify fill visible', () => {
      // Same problem for .btn-spotify: #1DB954 reaches only 2.6:1 on a light
      // page, so the button is outlined with the themed green instead.
      for (const bg of NEUTRAL_SURFACES) {
        expect(contrast(tokens['spotify-line'], tokens[bg])).toBeGreaterThanOrEqual(AA_UI)
      }
    })

    it.each(STATUS)('keeps the border of a %s panel visible against it', (status) => {
      // Not AA relevant on its own, but a panel whose border vanishes into its
      // own fill loses the shape the status is read from.
      expect(contrast(tokens[`${status}-border`], tokens[`${status}-surface`])).toBeGreaterThan(1.2)
    })
  })
})
