import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `src/main.ts` bootstraps and mounts the app as a side effect of being imported,
 * and by project convention the routes stay inline in that file instead of being
 * exported from a separate router module. The route titles are therefore read
 * from the source text, which is enough to guard the product name.
 */
const source = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8')
const routeTitles = [...source.matchAll(/title:\s*'([^']*)'/g)].map(match => match[1])

describe('route titles in main.ts', () => {
  it('defines a title for every route', () => {
    expect(routeTitles.length).toBeGreaterThan(0)
  })

  it('never uses either of the old product names', () => {
    // 'MySpotBackup 2.0' was the name in the titles before the first rename,
    // 'SpotMyBackup 2' the one before the rename to Backspin.
    for (const old of ['MySpotBackup', 'SpotMyBackup']) {
      expect(routeTitles.filter(title => title.includes(old))).toEqual([])
      expect(source).not.toContain(old)
    }
  })

  it('names the product Backspin in every title', () => {
    expect(routeTitles.filter(title => !title.includes('Backspin'))).toEqual([])
  })
})
