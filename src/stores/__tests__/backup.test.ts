import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SpotifyApiError,
  getFollowedArtists,
  getMe,
  getMyPlaylists,
  getPlaylistItems,
  getSavedAlbums,
  getSavedTracks
} from '@/services/spotify'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useBackupStore } from '@/stores/backup'
import type { SpotifyPlaylist } from '@/types'
import { makeItem, makePlaylist, makeTrack, makeUser } from '@/test/fixtures'

// Only the network facing reads are replaced; SpotifyApiError stays real.
vi.mock('@/services/spotify', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/spotify')>()
  return {
    ...actual,
    getMe: vi.fn(),
    getMyPlaylists: vi.fn(),
    getPlaylistItems: vi.fn(),
    getSavedTracks: vi.fn(),
    getSavedAlbums: vi.fn(),
    getFollowedArtists: vi.fn()
  }
})

const getMeMock = vi.mocked(getMe)
const getMyPlaylistsMock = vi.mocked(getMyPlaylists)
const getPlaylistItemsMock = vi.mocked(getPlaylistItems)
const getSavedTracksMock = vi.mocked(getSavedTracks)
const getSavedAlbumsMock = vi.mocked(getSavedAlbums)
const getFollowedArtistsMock = vi.mocked(getFollowedArtists)

const ownPlaylist = (id: string, name: string, total: number): SpotifyPlaylist =>
  makePlaylist({ id, name, tracks: { total, items: [] } })

/** The 403 Spotify answers with for subscribed playlists of other users. */
const forbidden = (path = '/playlists/p/items'): SpotifyApiError =>
  new SpotifyApiError(403, 'Forbidden', path)

/** Creates the stores on a fresh Pinia and logs the user in. */
const createStores = () => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.login(makeUser(), 'access-token', 'refresh-token', 3600)
  return {
    appStore: useAppStore(),
    backupStore: useBackupStore()
  }
}

const toastTypes = (appStore: ReturnType<typeof useAppStore>): string[] =>
  appStore.toasts.map(toast => toast.type)

beforeEach(() => {
  getMeMock.mockReset().mockResolvedValue(makeUser())
  getMyPlaylistsMock.mockReset().mockResolvedValue([])
  getPlaylistItemsMock.mockReset().mockResolvedValue([])
  getSavedTracksMock.mockReset().mockResolvedValue([])
  getSavedAlbumsMock.mockReset().mockResolvedValue([])
  getFollowedArtistsMock.mockReset().mockResolvedValue([])
})

describe('createBackup run result', () => {
  it('records failed playlists with their names', async () => {
    const { backupStore } = createStores()
    getMyPlaylistsMock.mockResolvedValue([
      ownPlaylist('p1', 'Eigene Playlist', 2),
      ownPlaylist('p2', 'Abonnierter Mix', 87),
      ownPlaylist('p3', 'Fremde Sammlung', 12)
    ])
    getPlaylistItemsMock.mockImplementation(async (id: string) => {
      if (id === 'p1') return [makeItem(makeTrack({ id: 't1' })), makeItem(makeTrack({ id: 't2' }))]
      throw forbidden()
    })

    await backupStore.createBackup()

    expect(backupStore.lastRunResult).not.toBeNull()
    expect(backupStore.lastRunResult?.loadedPlaylists).toBe(1)
    expect(backupStore.lastRunResult?.failedPlaylistNames).toEqual([
      'Abonnierter Mix',
      'Fremde Sammlung'
    ])
    expect(backupStore.lastRunResult?.errors).toHaveLength(2)
    expect(backupStore.lastRunResult?.errors[0]).toContain('Abonnierter Mix')
    expect(backupStore.lastRunResult?.errors[0]).toContain('HTTP 403')
    expect(backupStore.lastRunResult?.finishedAt).toEqual(expect.any(String))
  })

  it('keeps the result available after the run has finished', async () => {
    const { backupStore } = createStores()
    getMyPlaylistsMock.mockResolvedValue([ownPlaylist('p1', 'Abonnierter Mix', 87)])
    getPlaylistItemsMock.mockRejectedValue(forbidden())

    await backupStore.createBackup()

    expect(backupStore.isBackingUp).toBe(false)
    expect(backupStore.lastRunResult?.failedPlaylistNames).toEqual(['Abonnierter Mix'])
  })

  it('resets the result when the next run starts', async () => {
    const { backupStore } = createStores()
    getMyPlaylistsMock.mockResolvedValue([ownPlaylist('p1', 'Abonnierter Mix', 87)])
    getPlaylistItemsMock.mockRejectedValue(forbidden())
    await backupStore.createBackup()
    expect(backupStore.lastRunResult?.failedPlaylistNames).toHaveLength(1)

    getMyPlaylistsMock.mockResolvedValue([ownPlaylist('p1', 'Eigene Playlist', 1)])
    getPlaylistItemsMock.mockResolvedValue([makeItem(makeTrack())])
    await backupStore.createBackup()

    expect(backupStore.lastRunResult?.failedPlaylistNames).toEqual([])
    expect(backupStore.lastRunResult?.loadedPlaylists).toBe(1)
  })

  it('clears the result while a failing run is in flight', async () => {
    const { backupStore } = createStores()
    getMyPlaylistsMock.mockResolvedValue([ownPlaylist('p1', 'Abonnierter Mix', 87)])
    getPlaylistItemsMock.mockRejectedValue(forbidden())
    await backupStore.createBackup()

    getMeMock.mockRejectedValue(new SpotifyApiError(500, 'Server Error', '/me'))
    await expect(backupStore.createBackup()).rejects.toThrow('Server Error')

    expect(backupStore.lastRunResult).toBeNull()
  })

  it('is cleared by reset', async () => {
    const { backupStore } = createStores()
    getMyPlaylistsMock.mockResolvedValue([ownPlaylist('p1', 'Eigene Playlist', 0)])
    await backupStore.createBackup()
    expect(backupStore.lastRunResult).not.toBeNull()

    backupStore.reset()

    expect(backupStore.lastRunResult).toBeNull()
  })
})

describe('createBackup toasts', () => {
  it('shows a warning and no success toast when playlists fail', async () => {
    const { appStore, backupStore } = createStores()
    getMyPlaylistsMock.mockResolvedValue([ownPlaylist('p1', 'Abonnierter Mix', 87)])
    getPlaylistItemsMock.mockRejectedValue(forbidden())

    await backupStore.createBackup()

    expect(toastTypes(appStore)).toEqual(['warning'])
    expect(appStore.toasts[0].title).toBe('Backup unvollständig')
    expect(appStore.toasts[0].message).toContain('1 Playlist(s)')
  })

  it('shows a warning and no success toast when a section fails', async () => {
    const { appStore, backupStore } = createStores()
    getMyPlaylistsMock.mockResolvedValue([ownPlaylist('p1', 'Eigene Playlist', 1)])
    getPlaylistItemsMock.mockResolvedValue([makeItem(makeTrack())])
    getSavedTracksMock.mockRejectedValue(forbidden())

    await backupStore.createBackup()

    expect(toastTypes(appStore)).toEqual(['warning'])
    expect(appStore.toasts[0].message).toContain('1 Bereich(e)')
  })

  it('shows a single success toast when nothing failed', async () => {
    const { appStore, backupStore } = createStores()
    getMyPlaylistsMock.mockResolvedValue([ownPlaylist('p1', 'Eigene Playlist', 1)])
    getPlaylistItemsMock.mockResolvedValue([makeItem(makeTrack())])

    await backupStore.createBackup()

    expect(toastTypes(appStore)).toEqual(['success'])
    expect(appStore.toasts[0].title).toBe('Backup erfolgreich')
    expect(backupStore.lastRunResult?.errors).toEqual([])
  })
})

describe('createBackup metadata', () => {
  it('counts only the items that really landed in the backup', async () => {
    const { backupStore } = createStores()
    getMyPlaylistsMock.mockResolvedValue([
      ownPlaylist('p1', 'Eigene Playlist', 2),
      ownPlaylist('p2', 'Abonnierter Mix', 87)
    ])
    getPlaylistItemsMock.mockImplementation(async (id: string) =>
      id === 'p1' ? [makeItem(makeTrack({ id: 't1' })), makeItem(makeTrack({ id: 't2' }))] : Promise.reject(forbidden())
    )

    const data = await backupStore.createBackup()

    expect(data.metadata.totalPlaylists).toBe(2)
    expect(data.metadata.totalTracks).toBe(2)
    expect(data.playlists[1].tracks.items).toEqual([])
    expect(data.playlists[1].tracks.total).toBe(87)
  })
})
