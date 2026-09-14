import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IMPORT_SCOPES, STORAGE_KEYS, useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/fixtures'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

const tokenResponse = (body: TokenResponse, ok = true): Response =>
  ({ ok, json: () => Promise.resolve(body) }) as unknown as Response

/** Creates a store on a fresh Pinia; the setup reads the storage immediately. */
const createStore = (): ReturnType<typeof useAuthStore> => {
  setActivePinia(createPinia())
  return useAuthStore()
}

const storageEntries = (storage: Storage): string[] =>
  Array.from({ length: storage.length }, (_value, index) => storage.key(index) ?? '')
    .map(key => `${key}=${storage.getItem(key)}`)

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(tokenResponse({ access_token: 'fresh', expires_in: 3600 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('isTokenExpired', () => {
  it('is expired without an expiry', () => {
    expect(createStore().isTokenExpired()).toBe(true)
  })

  it('is valid well before the expiry', () => {
    const store = createStore()
    store.setTokens('access', 'refresh', 3600)
    expect(store.isTokenExpired()).toBe(false)
  })

  it('is already expired inside the 60 second buffer', () => {
    const store = createStore()
    store.setTokens('access', 'refresh', 30)
    expect(store.isTokenExpired()).toBe(true)
  })

  it('flips exactly at the 60 second buffer', () => {
    vi.useFakeTimers()
    const store = createStore()
    store.setTokens('access', 'refresh', 120)
    expect(store.isTokenExpired()).toBe(false)
    vi.advanceTimersByTime(60_000)
    expect(store.isTokenExpired()).toBe(true)
  })

  it('is expired for a token that already ran out', () => {
    const store = createStore()
    store.setTokens('access', 'refresh', -10)
    expect(store.isTokenExpired()).toBe(true)
  })
})

describe('login', () => {
  it('marks the session as authenticated and keeps the token in memory', () => {
    const store = createStore()
    store.login(makeUser(), 'access-token', 'refresh-token', 3600)

    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.id).toBe('user-1')
    expect(store.accessToken).toBe('access-token')
    expect(store.expiresAt).toBeGreaterThan(Date.now())
  })

  it('persists only the refresh token and the user in sessionStorage', () => {
    const store = createStore()
    store.login(makeUser(), 'access-token', 'refresh-token', 3600)

    expect(sessionStorage.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-token')
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEYS.user) ?? '{}')).toMatchObject({
      id: 'user-1'
    })
  })

  it('never writes the access token into any browser storage', () => {
    const store = createStore()
    store.login(makeUser(), 'super-secret-access-token', 'refresh-token', 3600)

    const everything = [...storageEntries(localStorage), ...storageEntries(sessionStorage)].join('|')
    expect(everything).not.toContain('super-secret-access-token')
  })

  it('writes nothing about the session to localStorage', () => {
    const store = createStore()
    store.login(makeUser(), 'access-token', 'refresh-token', 3600)
    expect(localStorage.getItem(STORAGE_KEYS.refreshToken)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.user)).toBeNull()
  })

  it('stores the granted scopes of the token response', () => {
    const store = createStore()
    store.login(makeUser(), 'access-token', 'refresh-token', 3600, 'playlist-read-private user-library-read')

    expect(store.grantedScopes).toEqual(['playlist-read-private', 'user-library-read'])
    expect(sessionStorage.getItem(STORAGE_KEYS.grantedScopes)).toBe(
      'playlist-read-private user-library-read'
    )
  })

  it('leaves the scopes unknown when Spotify sends none', () => {
    const store = createStore()
    store.login(makeUser(), 'access-token', 'refresh-token', 3600, null)
    expect(store.grantedScopes).toEqual([])
  })
})

describe('hasImportScopes', () => {
  it('is true while the granted scopes are unknown', () => {
    expect(createStore().hasImportScopes).toBe(true)
  })

  it('is true when every restore scope was granted', () => {
    const store = createStore()
    store.setGrantedScopes([...IMPORT_SCOPES, 'user-read-email'].join(' '))
    expect(store.hasImportScopes).toBe(true)
  })

  it('is false when one restore scope is missing', () => {
    const store = createStore()
    store.setGrantedScopes(IMPORT_SCOPES.slice(1).join(' '))
    expect(store.hasImportScopes).toBe(false)
  })

  it('ignores extra whitespace in the scope string', () => {
    const store = createStore()
    store.setGrantedScopes(`  ${IMPORT_SCOPES.join('   ')}  `)
    expect(store.grantedScopes).toEqual(IMPORT_SCOPES)
  })
})

describe('loadFromStorage', () => {
  it('removes tokens that older versions wrote to localStorage', () => {
    localStorage.setItem('spotify_access_token', 'legacy-access')
    localStorage.setItem('spotify_refresh_token', 'legacy-refresh')
    localStorage.setItem('spotify_expires_at', '123')
    localStorage.setItem('spotify_user', '{"id":"legacy"}')

    createStore()

    expect(localStorage.getItem('spotify_access_token')).toBeNull()
    expect(localStorage.getItem('spotify_refresh_token')).toBeNull()
    expect(localStorage.getItem('spotify_expires_at')).toBeNull()
    expect(localStorage.getItem('spotify_user')).toBeNull()
  })

  it('restores the session from sessionStorage and refreshes the token', async () => {
    localStorage.setItem(STORAGE_KEYS.clientId, 'client-1')
    sessionStorage.setItem(STORAGE_KEYS.refreshToken, 'refresh-token')
    sessionStorage.setItem(STORAGE_KEYS.user, JSON.stringify(makeUser()))

    const store = createStore()
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.id).toBe('user-1')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe(TOKEN_URL)
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('grant_type=refresh_token')
  })

  it('restores the granted scopes', () => {
    sessionStorage.setItem(STORAGE_KEYS.grantedScopes, IMPORT_SCOPES.join(' '))
    expect(createStore().grantedScopes).toEqual(IMPORT_SCOPES)
  })

  it('stays logged out without a stored session', () => {
    const store = createStore()
    expect(store.isAuthenticated).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stays logged out when only the user is stored', () => {
    sessionStorage.setItem(STORAGE_KEYS.user, JSON.stringify(makeUser()))
    expect(createStore().isAuthenticated).toBe(false)
  })

  it('logs out when the stored user is not valid JSON', () => {
    sessionStorage.setItem(STORAGE_KEYS.refreshToken, 'refresh-token')
    sessionStorage.setItem(STORAGE_KEYS.user, '{broken')

    const store = createStore()
    expect(store.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem(STORAGE_KEYS.refreshToken)).toBeNull()
  })
})

describe('refreshAccessToken', () => {
  const readyStore = (): ReturnType<typeof useAuthStore> => {
    const store = createStore()
    store.setClientId('client-1')
    store.login(makeUser(), 'old-access', 'old-refresh', 3600)
    fetchMock.mockClear()
    return store
  }

  it('does nothing without a refresh token', async () => {
    const store = createStore()
    store.setClientId('client-1')
    await expect(store.refreshAccessToken()).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does nothing without a client id', async () => {
    const store = createStore()
    store.setTokens('access', 'refresh', 3600)
    await expect(store.refreshAccessToken()).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends client_id in the body and no Authorization header (PKCE)', async () => {
    const store = readyStore()
    await store.refreshAccessToken()

    const init = fetchMock.mock.calls[0][1]
    expect(init?.method).toBe('POST')
    expect(String(init?.body)).toContain('client_id=client-1')
    expect(init?.headers).not.toHaveProperty('Authorization')
  })

  it('stores the new access token', async () => {
    const store = readyStore()
    fetchMock.mockResolvedValue(tokenResponse({ access_token: 'new-access', expires_in: 3600 }))

    await expect(store.refreshAccessToken()).resolves.toBe(true)
    expect(store.accessToken).toBe('new-access')
    expect(store.isTokenExpired()).toBe(false)
  })

  it('keeps the old refresh token when Spotify sends none', async () => {
    const store = readyStore()
    await store.refreshAccessToken()

    expect(store.refreshToken).toBe('old-refresh')
    expect(sessionStorage.getItem(STORAGE_KEYS.refreshToken)).toBe('old-refresh')
  })

  it('handles a rotated refresh token and persists it', async () => {
    const store = readyStore()
    fetchMock.mockResolvedValue(
      tokenResponse({ access_token: 'new-access', refresh_token: 'rotated', expires_in: 3600 })
    )

    await store.refreshAccessToken()
    expect(store.refreshToken).toBe('rotated')
    expect(sessionStorage.getItem(STORAGE_KEYS.refreshToken)).toBe('rotated')
  })

  it('updates the granted scopes from the response', async () => {
    const store = readyStore()
    fetchMock.mockResolvedValue(
      tokenResponse({ access_token: 'a', expires_in: 3600, scope: IMPORT_SCOPES.join(' ') })
    )

    await store.refreshAccessToken()
    expect(store.grantedScopes).toEqual(IMPORT_SCOPES)
  })

  it('logs out when Spotify rejects the refresh token', async () => {
    const store = readyStore()
    fetchMock.mockResolvedValue(tokenResponse({}, false))

    await expect(store.refreshAccessToken()).resolves.toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(store.refreshToken).toBeNull()
    expect(sessionStorage.getItem(STORAGE_KEYS.refreshToken)).toBeNull()
  })

  it('logs out on a network error', async () => {
    const store = readyStore()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(store.refreshAccessToken()).resolves.toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })

  it('collapses parallel calls into a single token request', async () => {
    const store = readyStore()
    const [first, second, third] = await Promise.all([
      store.refreshAccessToken(),
      store.refreshAccessToken(),
      store.refreshAccessToken()
    ])

    expect([first, second, third]).toEqual([true, true, true])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('allows a new request after the previous one finished', async () => {
    const store = readyStore()
    await store.refreshAccessToken()
    await store.refreshAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('getValidAccessToken', () => {
  it('returns the token in memory while it is valid', async () => {
    const store = createStore()
    store.setClientId('client-1')
    store.login(makeUser(), 'access-token', 'refresh-token', 3600)
    fetchMock.mockClear()

    await expect(store.getValidAccessToken()).resolves.toBe('access-token')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes an expired token', async () => {
    const store = createStore()
    store.setClientId('client-1')
    store.login(makeUser(), 'access-token', 'refresh-token', 10)
    fetchMock.mockClear()
    fetchMock.mockResolvedValue(tokenResponse({ access_token: 'refreshed', expires_in: 3600 }))

    await expect(store.getValidAccessToken()).resolves.toBe('refreshed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null without a refresh token', async () => {
    await expect(createStore().getValidAccessToken()).resolves.toBeNull()
  })

  it('returns null when the refresh fails', async () => {
    const store = createStore()
    store.setClientId('client-1')
    store.login(makeUser(), 'access-token', 'refresh-token', 10)
    fetchMock.mockClear()
    fetchMock.mockResolvedValue(tokenResponse({}, false))

    await expect(store.getValidAccessToken()).resolves.toBeNull()
  })
})

describe('logout', () => {
  it('clears the state', () => {
    const store = createStore()
    store.login(makeUser(), 'access-token', 'refresh-token', 3600, IMPORT_SCOPES.join(' '))
    store.logout()

    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.accessToken).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.expiresAt).toBeNull()
    expect(store.grantedScopes).toEqual([])
  })

  it('clears every session key including pending OAuth artifacts', () => {
    const store = createStore()
    store.login(makeUser(), 'access-token', 'refresh-token', 3600, IMPORT_SCOPES.join(' '))
    sessionStorage.setItem(STORAGE_KEYS.codeVerifier, 'verifier')
    sessionStorage.setItem(STORAGE_KEYS.authState, 'state')

    store.logout()

    expect(storageEntries(sessionStorage)).toEqual([])
  })

  it('keeps the user settings in localStorage', () => {
    const store = createStore()
    store.setClientId('client-1')
    store.setRedirectUri('https://example.test/callback')
    store.logout()

    expect(localStorage.getItem(STORAGE_KEYS.clientId)).toBe('client-1')
    expect(localStorage.getItem(STORAGE_KEYS.redirectUri)).toBe('https://example.test/callback')
  })
})

describe('user settings', () => {
  it('persists the client id in localStorage', () => {
    const store = createStore()
    store.setClientId('client-1')
    expect(localStorage.getItem(STORAGE_KEYS.clientId)).toBe('client-1')
    expect(store.clientId).toBe('client-1')
  })

  it('loads client id and redirect URI on creation', () => {
    localStorage.setItem(STORAGE_KEYS.clientId, 'stored-client')
    localStorage.setItem(STORAGE_KEYS.redirectUri, 'https://stored.test/callback')

    const store = createStore()
    expect(store.clientId).toBe('stored-client')
    expect(store.redirectUri).toBe('https://stored.test/callback')
  })

  it('defaults the redirect URI to the current origin', () => {
    expect(createStore().redirectUri).toBe(`${window.location.origin}/callback`)
  })
})
