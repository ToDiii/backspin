import { useAuthStore } from '@/stores/auth'
import type {
  SpotifyArtist,
  SpotifyEpisode,
  SpotifyPlaylist,
  SpotifyPlaylistItem,
  SpotifySavedAlbum,
  SpotifySavedTrack,
  SpotifyTrack,
  SpotifyUser
} from '@/types'

const API_BASE = 'https://api.spotify.com/v1'

// Spotify counts requests in a rolling 30 second window and answers 429 with Retry-After.
const MAX_RETRY_AFTER_SECONDS = 60
const MAX_RATE_LIMIT_RETRIES = 3
const MAX_SERVER_ERROR_RETRIES = 2

// Page size limit of the Web API (50 for every paged read endpoint used here)
const PAGE_LIMIT = 50

export class SpotifyApiError extends Error {
  readonly status: number
  readonly path: string

  constructor(status: number, message: string, path: string) {
    super(message)
    this.name = 'SpotifyApiError'
    this.status = status
    this.path = path
  }
}

export type ProgressCallback = (loaded: number, total: number) => void

interface PagingObject<T> {
  items?: T[]
  next?: string | null
  total?: number
}

interface CursorPagingResponse<T> {
  artists?: {
    items?: T[]
    next?: string | null
    total?: number
    cursors?: {
      after?: string | null
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms) })

// `next` links of the API are absolute URLs, every other caller passes a relative path
const buildUrl = (path: string): string =>
  path.startsWith('http://') || path.startsWith('https://') ? path : `${API_BASE}${path}`

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json() as { error?: { message?: string } | string }
    if (typeof body.error === 'string' && body.error) return body.error
    if (body.error && typeof body.error === 'object' && body.error.message) return body.error.message
  } catch {
    // body was empty or not JSON – fall through to the generic message
  }
  return `Spotify-Fehler ${response.status}`
}

/** Write endpoints answer 200 with an empty body, so response.json() alone would throw. */
const parseJsonBody = async <T>(response: Response, path: string): Promise<T> => {
  const text = await response.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new SpotifyApiError(response.status, 'Spotify hat eine unlesbare Antwort geschickt.', path)
  }
}

const sessionExpiredError = (path: string): SpotifyApiError =>
  new SpotifyApiError(401, 'Deine Spotify-Sitzung ist abgelaufen. Bitte melde dich erneut an.', path)

/**
 * Single entry point for every Spotify Web API request.
 * Handles auth (token per request), 401 with one refresh, 429 with Retry-After and 5xx with backoff.
 */
export async function spotifyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const authStore = useAuthStore()
  const url = buildUrl(path)

  let rateLimitRetries = 0
  let serverErrorRetries = 0
  let refreshAttempted = false

  for (;;) {
    const token = await authStore.getValidAccessToken()
    if (!token) {
      authStore.logout()
      throw sessionExpiredError(path)
    }

    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${token}`
        }
      })
    } catch (error) {
      if (serverErrorRetries < MAX_SERVER_ERROR_RETRIES) {
        serverErrorRetries += 1
        await sleep(serverErrorRetries * 1000)
        continue
      }
      const message = error instanceof Error ? error.message : 'Netzwerkfehler'
      throw new SpotifyApiError(0, `Netzwerkfehler bei der Spotify-Anfrage: ${message}`, path)
    }

    if (response.status === 204 || response.status === 205) {
      return undefined as T
    }

    if (response.ok) {
      return await parseJsonBody<T>(response, path)
    }

    if (response.status === 401 && !refreshAttempted) {
      refreshAttempted = true
      const refreshed = await authStore.refreshAccessToken()
      if (refreshed) continue
      authStore.logout()
      throw sessionExpiredError(path)
    }

    if (response.status === 429) {
      const header = Number.parseInt(response.headers.get('Retry-After') ?? '', 10)
      const waitSeconds = Number.isFinite(header) && header > 0 ? header : 1

      if (waitSeconds > MAX_RETRY_AFTER_SECONDS) {
        throw new SpotifyApiError(
          429,
          `Spotify drosselt die Anfragen für ${waitSeconds} Sekunden. Bitte versuche es später erneut.`,
          path
        )
      }
      if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
        throw new SpotifyApiError(
          429,
          'Spotify drosselt die Anfragen (Rate-Limit). Bitte versuche es später erneut.',
          path
        )
      }

      rateLimitRetries += 1
      await sleep(waitSeconds * 1000)
      continue
    }

    if (response.status >= 500 && serverErrorRetries < MAX_SERVER_ERROR_RETRIES) {
      serverErrorRetries += 1
      await sleep(serverErrorRetries * 1000)
      continue
    }

    if (response.status === 401) {
      authStore.logout()
      throw sessionExpiredError(path)
    }

    throw new SpotifyApiError(response.status, await readErrorMessage(response), path)
  }
}

/** Follows the `next` links of an offset paged endpoint and collects all items. */
export async function paginate<T>(firstPath: string, onProgress?: ProgressCallback): Promise<T[]> {
  const items: T[] = []
  let path: string | null = firstPath

  while (path) {
    const page: PagingObject<T> = await spotifyFetch<PagingObject<T>>(path)
    items.push(...(page.items ?? []))
    onProgress?.(items.length, page.total ?? items.length)
    path = page.next ?? null
  }

  return items
}

/** Cursor pagination of GET /me/following: the next page is addressed via artists.cursors.after. */
export async function paginateCursor<T>(basePath: string, onProgress?: ProgressCallback): Promise<T[]> {
  const items: T[] = []
  let after: string | null = null

  for (;;) {
    const separator = basePath.includes('?') ? '&' : '?'
    const path: string = after ? `${basePath}${separator}after=${encodeURIComponent(after)}` : basePath
    const page: CursorPagingResponse<T> = await spotifyFetch<CursorPagingResponse<T>>(path)
    const cursorPage: CursorPagingResponse<T>['artists'] = page.artists
    if (!cursorPage) break

    items.push(...(cursorPage.items ?? []))
    onProgress?.(items.length, cursorPage.total ?? items.length)

    after = cursorPage.cursors?.after ?? null
    if (!after || !cursorPage.next) break
  }

  return items
}

// Raw shapes as delivered by the API, including the deprecated aliases from before Feb 2026
interface RawSimplifiedPlaylist extends Omit<SpotifyPlaylist, 'tracks'> {
  items?: { total?: number }
  tracks?: { total?: number }
}

interface RawPlaylistItem {
  added_at?: string | null
  added_by?: { id: string } | null
  is_local?: boolean
  item?: SpotifyTrack | SpotifyEpisode | null
  track?: SpotifyTrack | SpotifyEpisode | null
}

const toPlaylist = (raw: RawSimplifiedPlaylist): SpotifyPlaylist => {
  const { items, tracks, ...rest } = raw
  return {
    ...rest,
    // `items.total` replaces the deprecated `tracks.total`
    tracks: { total: items?.total ?? tracks?.total ?? 0 }
  }
}

export const getMe = (): Promise<SpotifyUser> => spotifyFetch<SpotifyUser>('/me')

export const getMyPlaylists = async (onProgress?: ProgressCallback): Promise<SpotifyPlaylist[]> => {
  const raw = await paginate<RawSimplifiedPlaylist>(`/me/playlists?limit=${PAGE_LIMIT}`, onProgress)
  return raw.map(toPlaylist)
}

/**
 * GET /playlists/{id}/items – readable for own and collaborative playlists only.
 * Local files and episodes are kept, entries without content (item === null) are dropped.
 */
export const getPlaylistItems = async (
  playlistId: string,
  onProgress?: ProgressCallback
): Promise<SpotifyPlaylistItem[]> => {
  const path = `/playlists/${encodeURIComponent(playlistId)}/items?limit=${PAGE_LIMIT}&additional_types=track,episode`
  const raw = await paginate<RawPlaylistItem>(path, onProgress)

  return raw
    .map(entry => ({
      added_at: entry.added_at ?? null,
      added_by: entry.added_by ?? null,
      is_local: entry.is_local ?? false,
      // `item` is the current field, `track` only the deprecated alias
      item: entry.item ?? entry.track ?? null
    }))
    .filter(entry => entry.item !== null)
}

export const getSavedTracks = (onProgress?: ProgressCallback): Promise<SpotifySavedTrack[]> =>
  paginate<SpotifySavedTrack>(`/me/tracks?limit=${PAGE_LIMIT}`, onProgress)

export const getSavedAlbums = (onProgress?: ProgressCallback): Promise<SpotifySavedAlbum[]> =>
  paginate<SpotifySavedAlbum>(`/me/albums?limit=${PAGE_LIMIT}`, onProgress)

export const getFollowedArtists = (onProgress?: ProgressCallback): Promise<SpotifyArtist[]> =>
  paginateCursor<SpotifyArtist>(`/me/following?type=artist&limit=${PAGE_LIMIT}`, onProgress)

// ---------------------------------------------------------------------------
// Write operations (restore)
// ---------------------------------------------------------------------------

/** POST /playlists/{id}/items accepts at most 100 URIs per request. */
export const PLAYLIST_ITEMS_BATCH_SIZE = 100

/** PUT/GET /me/library accept at most 40 URIs per request. */
export const LIBRARY_BATCH_SIZE = 40

/** Deprecated PUT /me/following accepts at most 50 IDs per request. */
export const FOLLOW_BATCH_SIZE = 50

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export interface BatchOptions {
  /** Called after every finished batch with the number of processed items. */
  onBatch?: (processed: number, total: number) => void
  /** Checked before every batch; returning true stops the remaining batches. */
  shouldStop?: () => boolean
}

export const chunk = <T>(values: T[], size: number): T[][] => {
  const batches: T[][] = []
  for (let i = 0; i < values.length; i += size) {
    batches.push(values.slice(i, i + size))
  }
  return batches
}

export interface CreatePlaylistInput {
  name: string
  description?: string
  public: boolean
  collaborative?: boolean
}

export interface CreatedPlaylist {
  id: string
  uri: string
  snapshot_id?: string
}

/**
 * POST /me/playlists (POST /users/{id}/playlists was removed in February 2026).
 * `collaborative` requires `public: false`, otherwise Spotify answers 400.
 */
export const createPlaylist = async (input: CreatePlaylistInput): Promise<CreatedPlaylist> => {
  const body: Record<string, unknown> = {
    name: input.name,
    public: input.public
  }
  if (input.description) body.description = input.description
  if (input.collaborative && !input.public) body.collaborative = true

  const created = await spotifyFetch<CreatedPlaylist>('/me/playlists', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  })

  return created
}

/**
 * POST /playlists/{id}/items in batches of 100, sequentially and without `position`,
 * so the items keep the order of the backup.
 * Returns the number of URIs that were actually sent.
 */
export const addItemsToPlaylist = async (
  playlistId: string,
  uris: string[],
  options: BatchOptions = {}
): Promise<number> => {
  const path = `/playlists/${encodeURIComponent(playlistId)}/items`
  let processed = 0

  for (const batch of chunk(uris, PLAYLIST_ITEMS_BATCH_SIZE)) {
    if (options.shouldStop?.()) break
    await spotifyFetch<{ snapshot_id?: string }>(path, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ uris: batch })
    })
    processed += batch.length
    options.onBatch?.(processed, uris.length)
  }

  return processed
}

/**
 * PUT /me/library?uris= in batches of 40. Replaces the deprecated
 * PUT /me/tracks and PUT /me/albums. Returns the number of saved URIs.
 */
export const saveToLibrary = async (uris: string[], options: BatchOptions = {}): Promise<number> => {
  let processed = 0

  for (const batch of chunk(uris, LIBRARY_BATCH_SIZE)) {
    if (options.shouldStop?.()) break
    await spotifyFetch<void>(`/me/library?uris=${encodeURIComponent(batch.join(','))}`, {
      method: 'PUT'
    })
    processed += batch.length
    options.onBatch?.(processed, uris.length)
  }

  return processed
}

/**
 * GET /me/library/contains?uris= in batches of 40.
 * Accepts artist URIs as well and returns one boolean per input URI.
 */
export const libraryContains = async (uris: string[], options: BatchOptions = {}): Promise<boolean[]> => {
  const result: boolean[] = []

  for (const batch of chunk(uris, LIBRARY_BATCH_SIZE)) {
    if (options.shouldStop?.()) break
    const flags = await spotifyFetch<boolean[]>(
      `/me/library/contains?uris=${encodeURIComponent(batch.join(','))}`
    )
    result.push(...(Array.isArray(flags) ? flags : batch.map(() => false)))
    options.onBatch?.(result.length, uris.length)
  }

  return result
}

/**
 * Following artists.
 *
 * The February 2026 spec lists artist URIs for GET /me/library/contains but *not* for
 * PUT /me/library, while the deprecated PUT /me/following says to use /me/library instead.
 * Because of that contradiction /me/library is tried first and a 400 (unsupported URI type)
 * falls back to the deprecated PUT /me/following?type=artist&ids=.
 * Returns the number of followed artists.
 */
export const followArtists = async (artistUris: string[], options: BatchOptions = {}): Promise<number> => {
  let processed = 0
  let libraryEndpointUsable = true

  const followViaFollowing = async (uris: string[]): Promise<void> => {
    const ids = uris.map(uri => uri.split(':').pop() ?? '').filter(Boolean)
    for (const idBatch of chunk(ids, FOLLOW_BATCH_SIZE)) {
      await spotifyFetch<void>(
        `/me/following?type=artist&ids=${encodeURIComponent(idBatch.join(','))}`,
        { method: 'PUT' }
      )
    }
  }

  for (const batch of chunk(artistUris, LIBRARY_BATCH_SIZE)) {
    if (options.shouldStop?.()) break

    if (libraryEndpointUsable) {
      try {
        await spotifyFetch<void>(`/me/library?uris=${encodeURIComponent(batch.join(','))}`, {
          method: 'PUT'
        })
      } catch (error) {
        if (!(error instanceof SpotifyApiError) || error.status !== 400) throw error
        libraryEndpointUsable = false
        await followViaFollowing(batch)
      }
    } else {
      await followViaFollowing(batch)
    }

    processed += batch.length
    options.onBatch?.(processed, artistUris.length)
  }

  return processed
}
