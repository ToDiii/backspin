import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the security headers against drift between the two deployments.
 *
 * The app is served twice: from a own host behind Caddy (deploy/backspin.caddy)
 * and from Cloudflare Pages (public/_headers, which ships to dist/ unchanged).
 * Both have to send the same six security headers and the same two cache rules.
 *
 * The Content-Security-Policy is the worst of it, because it lives in a third
 * place on top: the <meta http-equiv> in index.html, which covers hosters that
 * send no headers at all. Three copies of one string drift silently - a new
 * external source gets added to one of them and the other two start blocking
 * it. This test reads all three and fails the moment they disagree.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const caddy = read('deploy/backspin.caddy')
const headersFile = read('public/_headers')
const redirectsFile = read('public/_redirects')
const html = read('index.html')

/** `frame-ancestors` is ignored in a meta tag, so index.html deliberately omits it. */
const META_ONLY_EXCEPTION = "frame-ancestors 'none'"

/** Pulls `Name "value"` pairs out of the `header { ... }` block of the Caddy snippet. */
const readCaddyHeaders = (): Record<string, string> => {
  const block = /header\s*\{([\s\S]*?)\n\t\}/.exec(caddy)
  if (!block) throw new Error('No `header { ... }` block found in deploy/backspin.caddy')

  const headers: Record<string, string> = {}
  for (const [, name, value] of block[1].matchAll(/^\s*([A-Za-z-]+)\s+"(.*)"\s*$/gm)) {
    headers[name] = value
  }
  return headers
}

/** Reads a single-line `header <matcher> <Name> "<value>"` rule. */
const readCaddyRule = (matcher: string, name: string): string => {
  const escaped = matcher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = new RegExp(`header\\s+${escaped}\\s+${name}\\s+"([^"]*)"`).exec(caddy)
  if (!rule) throw new Error(`No \`header ${matcher} ${name}\` rule in deploy/backspin.caddy`)
  return rule[1]
}

interface PagesRule {
  /** Header name to value, in file order. */
  headers: Record<string, string>
  /** Names detached from a broader rule with the `! Name` form. */
  detached: string[]
}

/**
 * Parses Cloudflare's `_headers` format: a line starting at column 0 opens a
 * rule for that path, the indented lines below it are its headers. `# ...` is a
 * comment, `! Name` removes a header an earlier matching rule has set.
 */
const readPagesRules = (): Record<string, PagesRule> => {
  const rules: Record<string, PagesRule> = {}
  let current: PagesRule | undefined

  for (const line of headersFile.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    if (!/^\s/.test(line)) {
      current = { headers: {}, detached: [] }
      rules[trimmed] = current
      continue
    }
    if (!current) throw new Error(`Header line before any path in public/_headers: "${trimmed}"`)

    if (trimmed.startsWith('! ')) {
      current.detached.push(trimmed.slice(2).trim())
      continue
    }

    const separator = trimmed.indexOf(':')
    if (separator === -1) throw new Error(`Not a header line in public/_headers: "${trimmed}"`)
    current.headers[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim()
  }
  return rules
}

/** Splits a policy into its directives, so a diff names the directive that moved. */
const directives = (policy: string): string[] =>
  policy.split(';').map(directive => directive.trim()).filter(Boolean)

const caddyHeaders = readCaddyHeaders()
const pagesRules = readPagesRules()

const catchAll = pagesRules['/*']
const assets = pagesRules['/assets/*']

const metaCsp = (): string => {
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)
  if (!meta) throw new Error('No Content-Security-Policy meta tag found in index.html')
  return meta[1]
}

describe('Content-Security-Policy across all three sources', () => {
  it('finds a policy in each source', () => {
    expect(caddyHeaders['Content-Security-Policy']).toBeTruthy()
    expect(catchAll?.headers['Content-Security-Policy']).toBeTruthy()
    expect(metaCsp()).toBeTruthy()
  })

  it('is character identical between the Caddy snippet and the Pages headers', () => {
    expect(catchAll.headers['Content-Security-Policy']).toBe(caddyHeaders['Content-Security-Policy'])
  })

  it('keeps frame-ancestors in the header sources', () => {
    // Pinned on its own: the meta comparison below subtracts this directive, so
    // dropping it from the headers would otherwise make that comparison pass.
    expect(directives(caddyHeaders['Content-Security-Policy'])).toContain(META_ONLY_EXCEPTION)
  })

  it('matches the meta tag except for frame-ancestors, which a meta tag ignores', () => {
    const expected = directives(caddyHeaders['Content-Security-Policy'])
      .filter(directive => directive !== META_ONLY_EXCEPTION)

    expect(directives(metaCsp())).toEqual(expected)
  })

  it('never carries frame-ancestors in the meta tag', () => {
    expect(metaCsp()).not.toContain('frame-ancestors')
  })
})

describe('the other security headers across both deployments', () => {
  it('sends the same six headers from Caddy and from Pages', () => {
    const fromPages = Object.keys(catchAll.headers).filter(name => name !== 'Cache-Control')

    expect(fromPages.sort()).toEqual(Object.keys(caddyHeaders).sort())
    expect(fromPages).toHaveLength(6)
  })

  it.each(['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security'])(
    'sends the same value for %s',
    name => {
      expect(catchAll.headers[name]).toBe(caddyHeaders[name])
    },
  )
})

describe('cache rules across both deployments', () => {
  it('caches the hashed build artefacts the same way', () => {
    expect(assets.headers['Cache-Control']).toBe(readCaddyRule('/assets/*', 'Cache-Control'))
  })

  it('revalidates everything else the same way', () => {
    expect(catchAll.headers['Cache-Control']).toBe(readCaddyRule('@shell', 'Cache-Control'))
  })

  it('detaches the inherited Cache-Control before setting the immutable one', () => {
    // A Pages request matching both rules inherits both values and joins them
    // with a comma, so without the detach /assets/* would answer
    // "no-cache, public, max-age=31536000, immutable" and no-cache would win.
    expect(assets.detached).toContain('Cache-Control')
  })
})

describe('SPA fallback for Cloudflare Pages', () => {
  it('rewrites unknown paths to the app shell', () => {
    const rules = redirectsFile
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '' && !line.startsWith('#'))

    expect(rules).toEqual(['/*    /index.html    200'])
  })

  it('rewrites rather than redirects, so /callback keeps its query string', () => {
    // A 301/302 would drop the OAuth code and state on the way to index.html.
    expect(redirectsFile).toMatch(/^\/\*\s+\/index\.html\s+200$/m)
  })
})
