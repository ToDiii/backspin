import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FOLLOW_BATCH_SIZE,
  LIBRARY_BATCH_SIZE,
  PLAYLIST_ITEMS_BATCH_SIZE,
  SpotifyApiError,
  addItemsToPlaylist,
  chunk,
  createPlaylist,
  followArtists,
  getFollowedArtists,
  getMe,
  getMyPlaylists,
  getPlaylistItems,
  getSavedTracks,
  libraryContains,
  paginate,
  paginateCursor,
  saveToLibrary,
  spotifyFetch
} from '@/services/spotify'

/** The auth store is replaced entirely: spotifyFetch only needs these three actions. */
const auth = vi.hoisted(() => ({
  getValidAccessToken: vi.fn<() => Promise<string | null>>(),
  refreshAccessToken: vi.fn<() => Promise<boolean>>(),
  logout: vi.fn()
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

interface FakeResponse {
  status?: number
  body?: unknown
  text?: string
  headers?: Record<string, string>
}

/** Minimal stand-in for the parts of `Response` that spotifyFetch touches. */
const res = (init: FakeResponse = {}): Response => {
  const status = init.status ?? 200
  const text = init.text ?? (init.body === undefined ? '' : JSON.stringify(init.body))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => init.headers?.[name] ?? null },
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text))
  } as unknown as Response
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

const requestUrls = (): string[] => fetchMock.mock.calls.map(call => call[0])

const requestBody = (index: number): unknown =>
  JSON.parse(String(fetchMock.mock.calls[index][1]?.body))

/**
 * Advances the fake timers until a retrying request has settled.
 * The rejection is captured first, so an expected failure never surfaces as an
 * unhandled rejection while the timers are still being advanced.
 */
const settle = async <T>(promise: Promise<T>): Promise<T> => {
  const captured = promise.then(
    value => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error })
  )
  for (let i = 0; i < 10; i += 1) {
    await vi.advanceTimersByTimeAsync(60_000)
  }
  const result = await captured
  if (!result.ok) throw result.error
  return result.value
}

beforeEach(() => {
  auth.getValidAccessToken.mockResolvedValue('token-1')
  auth.refreshAccessToken.mockResolvedValue(true)
  auth.logout.mockReturnValue(undefined)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('spotifyFetch (happy path)', () => {
  it('returns the parsed JSON body', async () => {
    fetchMock.mockResolvedValue(res({ body: { id: 'user-1' } }))
    await expect(spotifyFetch('/me')).resolves.toEqual({ id: 'user-1' })
  })

  it('prefixes relative paths with the API base and sends the bearer token', async () => {
    fetchMock.mockResolvedValue(res({ body: {} }))
    await spotifyFetch('/me')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestUrls()[0]).toBe('https://api.spotify.com/v1/me')
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer token-1')
  })

  it('keeps absolute next links untouched', async () => {
    fetchMock.mockResolvedValue(res({ body: {} }))
    await spotifyFetch('https://api.spotify.com/v1/me/tracks?offset=50')
    expect(requestUrls()[0]).toBe('https://api.spotify.com/v1/me/tracks?offset=50')
  })

  it('keeps method and custom headers of the caller', async () => {
    fetchMock.mockResolvedValue(res({ status: 204 }))
    await spotifyFetch('/me/library?uris=x', { method: 'PUT', headers: { 'X-Test': '1' } })
    const init = fetchMock.mock.calls[0][1]
    expect(init?.method).toBe('PUT')
    expect(init?.headers).toMatchObject({ 'X-Test': '1', Authorization: 'Bearer token-1' })
  })

  it.each([204, 205])('returns undefined for status %i', async status => {
    fetchMock.mockResolvedValue(res({ status }))
    await expect(spotifyFetch('/me/library')).resolves.toBeUndefined()
  })

  it('returns undefined for a 200 with an empty body', async () => {
    fetchMock.mockResolvedValue(res({ status: 200, text: '' }))
    await expect(spotifyFetch('/me/library')).resolves.toBeUndefined()
  })

  it('throws for a 200 with an unreadable body', async () => {
    fetchMock.mockResolvedValue(res({ status: 200, text: 'not json' }))
    await expect(spotifyFetch('/me')).rejects.toThrow('Spotify hat eine unlesbare Antwort geschickt.')
  })
})

describe('spotifyFetch (authentication)', () => {
  it('logs out and fails when no token is available', async () => {
    auth.getValidAccessToken.mockResolvedValue(null)
    await expect(spotifyFetch('/me')).rejects.toThrow('Deine Spotify-Sitzung ist abgelaufen')
    expect(auth.logout).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes once on 401 and retries the request', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ status: 401, body: { error: { message: 'expired' } } }))
      .mockResolvedValueOnce(res({ body: { id: 'user-1' } }))

    await expect(spotifyFetch('/me')).resolves.toEqual({ id: 'user-1' })
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(auth.logout).not.toHaveBeenCalled()
  })

  it('logs out when the refresh fails', async () => {
    auth.refreshAccessToken.mockResolvedValue(false)
    fetchMock.mockResolvedValue(res({ status: 401, body: {} }))

    const error = await spotifyFetch('/me').catch((value: unknown) => value)
    expect(error).toBeInstanceOf(SpotifyApiError)
    expect((error as SpotifyApiError).status).toBe(401)
    expect(auth.logout).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('logs out when the retried request answers 401 again', async () => {
    fetchMock.mockResolvedValue(res({ status: 401, body: {} }))

    await expect(spotifyFetch('/me')).rejects.toThrow('Bitte melde dich erneut an.')
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(auth.logout).toHaveBeenCalledTimes(1)
  })

  it('fetches a token for every attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ status: 401, body: {} }))
      .mockResolvedValueOnce(res({ body: {} }))
    await spotifyFetch('/me')
    expect(auth.getValidAccessToken).toHaveBeenCalledTimes(2)
  })
})

describe('spotifyFetch (rate limiting)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('waits for Retry-After and retries', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(res({ body: { ok: true } }))

    const promise = spotifyFetch('/me')
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to one second without a Retry-After header', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ status: 429 }))
      .mockResolvedValueOnce(res({ body: { ok: true } }))

    const promise = spotifyFetch('/me')
    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).resolves.toEqual({ ok: true })
  })

  it('gives up immediately for a Retry-After above 60 seconds', async () => {
    fetchMock.mockResolvedValue(res({ status: 429, headers: { 'Retry-After': '90' } }))

    await expect(settle(spotifyFetch('/me'))).rejects.toThrow(
      'Spotify drosselt die Anfragen für 90 Sekunden.'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up after three retries', async () => {
    fetchMock.mockResolvedValue(res({ status: 429, headers: { 'Retry-After': '1' } }))

    await expect(settle(spotifyFetch('/me'))).rejects.toThrow('Rate-Limit')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})

describe('spotifyFetch (server and network errors)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('retries a 500 with a growing backoff', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ status: 500 }))
      .mockResolvedValueOnce(res({ status: 502 }))
      .mockResolvedValueOnce(res({ body: { ok: true } }))

    const promise = spotifyFetch('/me')
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toEqual({ ok: true })
  })

  it('surfaces the Spotify message after the retries are used up', async () => {
    fetchMock.mockResolvedValue(res({ status: 503, body: { error: { message: 'Server kaputt' } } }))

    await expect(settle(spotifyFetch('/me'))).rejects.toThrow('Server kaputt')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries a network error and succeeds afterwards', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(res({ body: { ok: true } }))

    await expect(settle(spotifyFetch('/me'))).resolves.toEqual({ ok: true })
  })

  it('reports a permanent network error with status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await settle(spotifyFetch('/me')).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(SpotifyApiError)
    expect((error as SpotifyApiError).status).toBe(0)
    expect((error as SpotifyApiError).message).toContain('Netzwerkfehler')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('spotifyFetch (client errors)', () => {
  it('uses error.message from the body', async () => {
    fetchMock.mockResolvedValue(res({ status: 403, body: { error: { message: 'Insufficient scope' } } }))

    const error = await spotifyFetch('/me/library').catch((value: unknown) => value)
    expect(error).toBeInstanceOf(SpotifyApiError)
    expect((error as SpotifyApiError).status).toBe(403)
    expect((error as SpotifyApiError).message).toBe('Insufficient scope')
    expect((error as SpotifyApiError).path).toBe('/me/library')
  })

  it('uses a string error body', async () => {
    fetchMock.mockResolvedValue(res({ status: 400, body: { error: 'invalid_request' } }))
    await expect(spotifyFetch('/me')).rejects.toThrow('invalid_request')
  })

  it('falls back to a generic message for a non-JSON body', async () => {
    fetchMock.mockResolvedValue(res({ status: 404, text: '<html>nope</html>' }))
    await expect(spotifyFetch('/me')).rejects.toThrow('Spotify-Fehler 404')
  })

  it('does not retry a 404', async () => {
    fetchMock.mockResolvedValue(res({ status: 404, text: '' }))
    await expect(spotifyFetch('/me')).rejects.toBeInstanceOf(SpotifyApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('paginate', () => {
  it('follows the next links until the end', async () => {
    fetchMock
      .mockResolvedValueOnce(
        res({ body: { items: [1, 2], total: 3, next: 'https://api.spotify.com/v1/me/tracks?offset=2' } })
      )
      .mockResolvedValueOnce(res({ body: { items: [3], total: 3, next: null } }))

    await expect(paginate<number>('/me/tracks?limit=2')).resolves.toEqual([1, 2, 3])
    expect(requestUrls()).toEqual([
      'https://api.spotify.com/v1/me/tracks?limit=2',
      'https://api.spotify.com/v1/me/tracks?offset=2'
    ])
  })

  it('reports the progress of every page', async () => {
    fetchMock
      .mockResolvedValueOnce(
        res({ body: { items: [1, 2], total: 3, next: 'https://api.spotify.com/v1/next' } })
      )
      .mockResolvedValueOnce(res({ body: { items: [3], total: 3 } }))

    const onProgress = vi.fn()
    await paginate<number>('/me/tracks', onProgress)
    expect(onProgress.mock.calls).toEqual([[2, 3], [3, 3]])
  })

  it('handles a page without items', async () => {
    fetchMock.mockResolvedValue(res({ body: {} }))
    await expect(paginate<number>('/me/tracks')).resolves.toEqual([])
  })

  it('falls back to the collected count when total is missing', async () => {
    fetchMock.mockResolvedValue(res({ body: { items: [1] } }))
    const onProgress = vi.fn()
    await paginate<number>('/me/tracks', onProgress)
    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })
})

describe('paginateCursor', () => {
  it('follows artists.cursors.after', async () => {
    fetchMock
      .mockResolvedValueOnce(
        res({
          body: {
            artists: {
              items: [{ id: 'a' }],
              total: 2,
              next: 'https://api.spotify.com/v1/me/following?after=a',
              cursors: { after: 'a' }
            }
          }
        })
      )
      .mockResolvedValueOnce(
        res({ body: { artists: { items: [{ id: 'b' }], total: 2, next: null, cursors: {} } } })
      )

    await expect(paginateCursor('/me/following?type=artist')).resolves.toEqual([
      { id: 'a' },
      { id: 'b' }
    ])
    expect(requestUrls()[1]).toBe('https://api.spotify.com/v1/me/following?type=artist&after=a')
  })

  it('appends the cursor with a "?" when the base path has no query', async () => {
    fetchMock
      .mockResolvedValueOnce(
        res({ body: { artists: { items: [], next: 'x', cursors: { after: 'a b' } } } })
      )
      .mockResolvedValueOnce(res({ body: { artists: { items: [], cursors: {} } } }))

    await paginateCursor('/me/following')
    expect(requestUrls()[1]).toBe('https://api.spotify.com/v1/me/following?after=a%20b')
  })

  it('stops when next is null even if a cursor is present', async () => {
    fetchMock.mockResolvedValue(
      res({ body: { artists: { items: [{ id: 'a' }], next: null, cursors: { after: 'a' } } } })
    )
    await expect(paginateCursor('/me/following')).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops when the response has no artists object', async () => {
    fetchMock.mockResolvedValue(res({ body: {} }))
    await expect(paginateCursor('/me/following')).resolves.toEqual([])
  })

  it('reports the progress', async () => {
    fetchMock.mockResolvedValue(
      res({ body: { artists: { items: [{ id: 'a' }], total: 1, cursors: {} } } })
    )
    const onProgress = vi.fn()
    await paginateCursor('/me/following', onProgress)
    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })
})

describe('read endpoints', () => {
  it('getMe requests /me', async () => {
    fetchMock.mockResolvedValue(res({ body: { id: 'user-1' } }))
    await expect(getMe()).resolves.toEqual({ id: 'user-1' })
    expect(requestUrls()[0]).toBe('https://api.spotify.com/v1/me')
  })

  it('getMyPlaylists prefers items.total over the deprecated tracks.total', async () => {
    fetchMock.mockResolvedValue(
      res({
        body: {
          items: [
            { id: 'p1', name: 'A', items: { total: 7 }, tracks: { total: 3 } },
            { id: 'p2', name: 'B', tracks: { total: 4 } },
            { id: 'p3', name: 'C' }
          ]
        }
      })
    )

    const playlists = await getMyPlaylists()
    expect(playlists.map(playlist => playlist.tracks.total)).toEqual([7, 4, 0])
    expect(playlists[0]).not.toHaveProperty('items')
    expect(requestUrls()[0]).toContain('/me/playlists?limit=50')
  })

  it('getPlaylistItems normalises item, the deprecated track alias and is_local', async () => {
    fetchMock.mockResolvedValue(
      res({
        body: {
          items: [
            { added_at: '2023-01-01T00:00:00Z', is_local: true, item: { id: 't1' } },
            { track: { id: 't2' } },
            { item: null, track: null }
          ]
        }
      })
    )

    const items = await getPlaylistItems('37i9dQ')
    expect(items).toEqual([
      { added_at: '2023-01-01T00:00:00Z', added_by: null, is_local: true, item: { id: 't1' } },
      { added_at: null, added_by: null, is_local: false, item: { id: 't2' } }
    ])
  })

  it('getPlaylistItems asks for tracks and episodes and encodes the id', async () => {
    fetchMock.mockResolvedValue(res({ body: { items: [] } }))
    await getPlaylistItems('a/b')
    expect(requestUrls()[0]).toBe(
      'https://api.spotify.com/v1/playlists/a%2Fb/items?limit=50&additional_types=track,episode'
    )
  })

  it('getSavedTracks pages /me/tracks', async () => {
    fetchMock.mockResolvedValue(res({ body: { items: [{ added_at: 'x' }] } }))
    await expect(getSavedTracks()).resolves.toHaveLength(1)
    expect(requestUrls()[0]).toContain('/me/tracks?limit=50')
  })

  it('getFollowedArtists uses the cursor endpoint', async () => {
    fetchMock.mockResolvedValue(res({ body: { artists: { items: [{ id: 'a' }], cursors: {} } } }))
    await expect(getFollowedArtists()).resolves.toHaveLength(1)
    expect(requestUrls()[0]).toContain('/me/following?type=artist&limit=50')
  })
})

describe('chunk', () => {
  it('splits into full batches plus a remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns one batch when everything fits', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]])
  })

  it('returns nothing for an empty list', () => {
    expect(chunk([], 10)).toEqual([])
  })
})

describe('createPlaylist', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(res({ body: { id: 'new-1', uri: 'spotify:playlist:new-1' } }))
  })

  it('posts to /me/playlists', async () => {
    await expect(createPlaylist({ name: 'Mix', public: false })).resolves.toEqual({
      id: 'new-1',
      uri: 'spotify:playlist:new-1'
    })
    expect(requestUrls()[0]).toBe('https://api.spotify.com/v1/me/playlists')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })

  it('sends collaborative only for a private playlist', async () => {
    await createPlaylist({ name: 'Mix', public: false, collaborative: true })
    expect(requestBody(0)).toEqual({ name: 'Mix', public: false, collaborative: true })
  })

  it('omits collaborative for a public playlist', async () => {
    await createPlaylist({ name: 'Mix', public: true, collaborative: true })
    expect(requestBody(0)).toEqual({ name: 'Mix', public: true })
  })

  it('omits collaborative when it is not requested', async () => {
    await createPlaylist({ name: 'Mix', public: false })
    expect(requestBody(0)).toEqual({ name: 'Mix', public: false })
  })

  it('sends a non-empty description only', async () => {
    await createPlaylist({ name: 'Mix', public: false, description: 'Hallo' })
    expect(requestBody(0)).toMatchObject({ description: 'Hallo' })

    await createPlaylist({ name: 'Mix', public: false, description: '' })
    expect(requestBody(1)).not.toHaveProperty('description')
  })
})

describe('addItemsToPlaylist', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(res({ body: { snapshot_id: 's1' } }))
  })

  it('sends batches of at most 100 URIs', async () => {
    expect(PLAYLIST_ITEMS_BATCH_SIZE).toBe(100)
    const uris = Array.from({ length: 250 }, (_value, index) => `spotify:track:${index}`)

    await expect(addItemsToPlaylist('p1', uris)).resolves.toBe(250)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((requestBody(0) as { uris: string[] }).uris).toHaveLength(100)
    expect((requestBody(2) as { uris: string[] }).uris).toEqual(uris.slice(200))
  })

  it('keeps the order of the backup', async () => {
    const uris = Array.from({ length: 150 }, (_value, index) => `spotify:track:${index}`)
    await addItemsToPlaylist('p1', uris)
    const sent = fetchMock.mock.calls.flatMap(
      (_call, index) => (requestBody(index) as { uris: string[] }).uris
    )
    expect(sent).toEqual(uris)
  })

  it('encodes the playlist id', async () => {
    await addItemsToPlaylist('a b', ['spotify:track:1'])
    expect(requestUrls()[0]).toBe('https://api.spotify.com/v1/playlists/a%20b/items')
  })

  it('reports the progress per batch', async () => {
    const onBatch = vi.fn()
    await addItemsToPlaylist('p1', Array.from({ length: 150 }, () => 'spotify:track:1'), { onBatch })
    expect(onBatch.mock.calls).toEqual([[100, 150], [150, 150]])
  })

  it('stops between batches when shouldStop turns true', async () => {
    let stop = false
    const uris = Array.from({ length: 300 }, (_value, index) => `spotify:track:${index}`)

    const processed = await addItemsToPlaylist('p1', uris, {
      shouldStop: () => stop,
      onBatch: () => {
        stop = true
      }
    })
    expect(processed).toBe(100)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends nothing for an empty list', async () => {
    await expect(addItemsToPlaylist('p1', [])).resolves.toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('saveToLibrary / libraryContains', () => {
  it('saves in batches of 40', async () => {
    expect(LIBRARY_BATCH_SIZE).toBe(40)
    fetchMock.mockResolvedValue(res({ status: 200 }))
    const uris = Array.from({ length: 45 }, (_value, index) => `spotify:track:${index}`)

    await expect(saveToLibrary(uris)).resolves.toBe(45)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect(decodeURIComponent(requestUrls()[1])).toBe(
      `https://api.spotify.com/v1/me/library?uris=${uris.slice(40).join(',')}`
    )
  })

  it('stops between batches on request', async () => {
    fetchMock.mockResolvedValue(res({ status: 200 }))
    let stop = false
    const processed = await saveToLibrary(
      Array.from({ length: 120 }, () => 'spotify:track:1'),
      { shouldStop: () => stop, onBatch: () => { stop = true } }
    )
    expect(processed).toBe(40)
  })

  it('libraryContains returns one flag per URI across batches', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ body: Array.from({ length: 40 }, () => true) }))
      .mockResolvedValueOnce(res({ body: [false, true] }))

    const flags = await libraryContains(Array.from({ length: 42 }, () => 'spotify:track:1'))
    expect(flags).toHaveLength(42)
    expect(flags[40]).toBe(false)
    expect(requestUrls()[0]).toContain('/me/library/contains?uris=')
  })

  it('libraryContains falls back to false when the answer is not an array', async () => {
    fetchMock.mockResolvedValue(res({ body: { error: 'x' } }))
    await expect(libraryContains(['spotify:track:1'])).resolves.toEqual([false])
  })
})

describe('followArtists', () => {
  it('uses PUT /me/library while it works', async () => {
    fetchMock.mockResolvedValue(res({ status: 200 }))
    const uris = Array.from({ length: 50 }, (_value, index) => `spotify:artist:${index}`)

    await expect(followArtists(uris)).resolves.toBe(50)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestUrls().every(url => url.includes('/me/library?uris='))).toBe(true)
  })

  it('falls back to the deprecated /me/following after a 400', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ status: 400, body: { error: { message: 'unsupported uri' } } }))
      .mockResolvedValue(res({ status: 200 }))

    const uris = Array.from({ length: 80 }, (_value, index) => `spotify:artist:${index}`)
    await expect(followArtists(uris)).resolves.toBe(80)

    const following = requestUrls().filter(url => url.includes('/me/following'))
    expect(following).toHaveLength(2)
    expect(decodeURIComponent(following[0])).toContain('type=artist&ids=0,1,2,3')
  })

  it('does not retry /me/library once the fallback is active', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ status: 400, body: { error: { message: 'unsupported uri' } } }))
      .mockResolvedValue(res({ status: 200 }))

    await followArtists(Array.from({ length: 80 }, (_value, index) => `spotify:artist:${index}`))
    expect(requestUrls().filter(url => url.includes('/me/library?uris='))).toHaveLength(1)
  })

  it('splits the fallback into batches of at most 50 ids', async () => {
    expect(FOLLOW_BATCH_SIZE).toBe(50)
    fetchMock
      .mockResolvedValueOnce(res({ status: 400, body: { error: { message: 'unsupported uri' } } }))
      .mockResolvedValue(res({ status: 200 }))

    await followArtists(Array.from({ length: 40 }, (_value, index) => `spotify:artist:${index}`))
    expect(requestUrls().filter(url => url.includes('/me/following'))).toHaveLength(1)
  })

  it('propagates errors other than 400', async () => {
    fetchMock.mockResolvedValue(res({ status: 403, body: { error: { message: 'Insufficient scope' } } }))
    await expect(followArtists(['spotify:artist:1'])).rejects.toThrow('Insufficient scope')
  })

  it('reports the progress per batch', async () => {
    fetchMock.mockResolvedValue(res({ status: 200 }))
    const onBatch = vi.fn()
    await followArtists(Array.from({ length: 45 }, () => 'spotify:artist:1'), { onBatch })
    expect(onBatch.mock.calls).toEqual([[40, 45], [45, 45]])
  })
})
