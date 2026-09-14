import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every color in the UI has to come from a theme token, otherwise it stays
 * frozen on one theme. This is exactly how the light mode used to be broken:
 * the palette was hard coded to dark values, so the toggle changed almost
 * nothing. The test scans the templates for Tailwind's fixed palette and for
 * the neutral ramps the project used before the tokens existed.
 */
const SRC = resolve(process.cwd(), 'src')

const FIXED_PALETTE = [
  'white', 'black',
  'gray', 'slate', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'emerald', 'green', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
  // Ramps this project defined itself and replaced with semantic tokens.
  'accent', 'secondary',
]

const COLOR_UTILITIES = 'bg|text|border|ring|divide|placeholder|from|via|to|fill|stroke|shadow|outline|accent|caret|decoration'

// The lookbehind keeps the utility at the start of a class, so a token name
// that merely ends in one of these words (`text-text-secondary`) is not a hit.
const forbidden = new RegExp(
  `(?<![\\w-])(?:${COLOR_UTILITIES})-(?:${FIXED_PALETTE.join('|')})(?:-\\d{2,3})?(?![\\w-])`,
  'g',
)

const collect = (dir: string, extension: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : collect(path, extension)
    return entry.name.endsWith(extension) ? [path] : []
  })

const components = collect(SRC, '.vue')

describe('color tokens in the templates', () => {
  it('finds the components to scan', () => {
    expect(components.length).toBeGreaterThan(5)
  })

  it.each(components.map(path => [relative(SRC, path), path]))(
    '%s uses theme tokens only',
    (_name, path) => {
      const matches = readFileSync(path, 'utf8').match(forbidden) ?? []
      expect(matches).toEqual([])
    },
  )

  it('keeps the token definitions out of the templates', () => {
    // A `--color-*` override outside style.css would split the palette again.
    for (const path of components) {
      expect(readFileSync(path, 'utf8')).not.toMatch(/--color-[a-z-]+:/)
    }
  })
})
