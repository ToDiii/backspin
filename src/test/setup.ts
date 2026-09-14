import { afterEach, beforeEach, vi } from 'vitest'

/**
 * Global test setup.
 *
 * Tests must never touch the network: `fetch` is replaced by a guard that
 * fails loudly, so a forgotten mock shows up as a clear error instead of a
 * timeout or a real request to Spotify.
 */
const unmockedFetch = (input: unknown): never => {
  const target = typeof input === 'string' ? input : String(input)
  throw new Error(
    `Unmocked network request to "${target}". Stub globalThis.fetch in the test.`
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(unmockedFetch))
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
