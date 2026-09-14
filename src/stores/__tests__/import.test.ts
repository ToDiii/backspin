import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LIBRARY_BATCH_SIZE,
  PLAYLIST_ITEMS_BATCH_SIZE,
  SpotifyApiError,
  addItemsToPlaylist,
  chunk,
  createPlaylist,
  followArtists,
  getMyPlaylists,
  libraryContains,
  saveToLibrary
} from '@/services/spotify'
import type { BatchOptions } from '@/services/spotify'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { NOTHING_TO_DO_MESSAGE, useImportStore } from '@/stores/import'
import type { BackupData, ImportOptions, SpotifyPlaylist } from '@/types'
import {
  makeArtist,
  makeBackup,
  makeItem,
  makePlaylist,
  makeSavedAlbum,
  makeSavedTrack,
  makeTrack,
  makeTracks,
  makeUser
} from '@/test/fixtures'

// Only the network facing functions are replaced; chunk and the batch sizes stay real.
vi.mock('@/services/spotify', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/spotify')>()
  return {
    ...actual,
    getMyPlaylists: vi.fn(),
    createPlaylist: vi.fn(),
    addItemsToPlaylist: vi.fn(),
    libraryContains: vi.fn(),
    saveToLibrary: vi.fn(),
    followArtists: vi.fn()
  }
})

interface RecordedBatch {
  target: string
  uris: string[]
}

let addedBatches: RecordedBatch[] = []
let savedBatches: RecordedBatch[] = []
let followedBatches: RecordedBatch[] = []
let createdPlaylists: { name: string, public: boolean, collaborative?: boolean }[] = []
let alreadyInLibrary: Set<string>

/** Replays the batching contract of the real service so the store can be observed. */
const batched = (
  uris: string[],
  size: number,
  options: BatchOptions,
  onBatch: (batch: string[]) => void
): number => {
  let processed = 0
  for (const batch of chunk(uris, size)) {
    if (options.shouldStop?.()) break
    onBatch(batch)
    processed += batch.length
    options.onBatch?.(processed, uris.length)
  }
  return processed
}

const setupStore = (options: Partial<ImportOptions> = {}) => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.setClientId('client-1')
  authStore.login(makeUser(), 'access-token', 'refresh-token', 3600)

  const appStore = useAppStore()
  const store = useImportStore()
  store.setImportOptions({ ...store.importOptions, ...options })
  return { store, authStore, appStore }
}

const playlistWith = (
  id: string,
  name: string,
  trackCount: number,
  overrides: Partial<SpotifyPlaylist> = {}
): SpotifyPlaylist => {
  const items = makeTracks(trackCount, id).map(track => makeItem(track))
  return makePlaylist({ id, name, tracks: { total: items.length, items }, ...overrides })
}

const backupWith = (playlists: SpotifyPlaylist[], extra: Partial<BackupData> = {}): BackupData =>
  makeBackup({ playlists, ...extra })

const selection = (backup: BackupData): string[] => backup.playlists.map(playlist => playlist.id)

const lastToast = <T>(toasts: T[]): T => toasts[toasts.length - 1]

beforeEach(() => {
  addedBatches = []
  savedBatches = []
  followedBatches = []
  createdPlaylists = []
  alreadyInLibrary = new Set()

  vi.mocked(getMyPlaylists).mockResolvedValue([])

  vi.mocked(createPlaylist).mockImplementation(async input => {
    createdPlaylists.push({
      name: input.name,
      public: input.public,
      collaborative: input.collaborative
    })
    const id = `created-${createdPlaylists.length}`
    return { id, uri: `spotify:playlist:${id}` }
  })

  vi.mocked(addItemsToPlaylist).mockImplementation(async (playlistId, uris, options = {}) =>
    batched(uris, PLAYLIST_ITEMS_BATCH_SIZE, options, batch =>
      addedBatches.push({ target: playlistId, uris: batch })
    )
  )

  vi.mocked(libraryContains).mockImplementation(async (uris, options = {}) => {
    const flags: boolean[] = []
    batched(uris, LIBRARY_BATCH_SIZE, options, batch => {
      batch.forEach(uri => flags.push(alreadyInLibrary.has(uri)))
    })
    return flags
  })

  vi.mocked(saveToLibrary).mockImplementation(async (uris, options = {}) =>
    batched(uris, LIBRARY_BATCH_SIZE, options, batch =>
      savedBatches.push({ target: 'library', uris: batch })
    )
  )

  vi.mocked(followArtists).mockImplementation(async (uris, options = {}) =>
    batched(uris, LIBRARY_BATCH_SIZE, options, batch =>
      followedBatches.push({ target: 'following', uris: batch })
    )
  )
})

describe('guards', () => {
  it('refuses to run without a session', async () => {
    setActivePinia(createPinia())
    const store = useImportStore()
    await expect(store.runImport(makeBackup())).rejects.toThrow('nicht bei Spotify angemeldet')
  })

  it('refuses to run without the restore scopes and asks for a re-login', async () => {
    const { store, authStore, appStore } = setupStore()
    authStore.setGrantedScopes('playlist-read-private')

    await expect(store.runImport(makeBackup())).rejects.toThrow('ab- und wieder anmelden')
    expect(store.needsReauth).toBe(true)
    expect(appStore.toasts[0]).toMatchObject({ type: 'error', title: 'Berechtigungen fehlen' })
  })

  it('runs when the granted scopes are unknown', async () => {
    const { store } = setupStore()
    await expect(store.runImport(makeBackup())).resolves.toMatchObject({ playlistsCreated: 0 })
  })
})

describe('runImport (playlists)', () => {
  it('creates two playlists and sends 150 tracks in two batches', async () => {
    const backup = backupWith([playlistWith('p1', 'First', 150), playlistWith('p2', 'Second', 10)])
    const { store } = setupStore({ selectedPlaylists: selection(backup) })

    const result = await store.runImport(backup)

    expect(result.playlistsCreated).toBe(2)
    expect(result.tracksAdded).toBe(160)
    expect(createdPlaylists.map(entry => entry.name)).toEqual(['First', 'Second'])
    expect(addedBatches.map(batch => [batch.target, batch.uris.length])).toEqual([
      ['created-1', 100],
      ['created-1', 50],
      ['created-2', 10]
    ])
  })

  it('skips a local file and reports it', async () => {
    const playlist = playlistWith('p1', 'First', 150)
    playlist.tracks.items?.push(makeItem(makeTrack({ id: 'local' }), { is_local: true }))
    const backup = backupWith([playlist])
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backup)

    expect(result.tracksAdded).toBe(150)
    expect(result.tracksSkipped).toBe(1)
    expect(result.errors[0]).toContain('1 lokale Datei(en) übersprungen')
    expect(addedBatches.flatMap(batch => batch.uris)).not.toContain('spotify:track:local')
  })

  it('skips spotify:local: URIs as well', async () => {
    const playlist = playlistWith('p1', 'First', 1)
    playlist.tracks.items?.push(makeItem(makeTrack({ id: 'l', uri: 'spotify:local:x:y:z' })))
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backupWith([playlist]))
    expect(result.tracksAdded).toBe(1)
    expect(result.tracksSkipped).toBe(1)
  })

  it('counts entries without content as unavailable', async () => {
    const playlist = playlistWith('p1', 'First', 1)
    playlist.tracks.items?.push(makeItem(null))
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backupWith([playlist]))
    expect(result.tracksSkipped).toBe(1)
    expect(result.errors[0]).toContain('nicht mehr verfügbar')
  })

  it('rebuilds a missing uri from the id (format 2.0)', async () => {
    const playlist = makePlaylist({
      id: 'p1',
      tracks: { total: 1, items: [makeItem(makeTrack({ id: 'abc', uri: '' }))] }
    })
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    await store.runImport(backupWith([playlist]))
    expect(addedBatches[0].uris).toEqual(['spotify:track:abc'])
  })

  it('imports only the selected playlists', async () => {
    const backup = backupWith([playlistWith('p1', 'First', 1), playlistWith('p2', 'Second', 1)])
    const { store } = setupStore({ selectedPlaylists: ['p2'] })

    const result = await store.runImport(backup)
    expect(result.playlistsCreated).toBe(1)
    expect(createdPlaylists[0].name).toBe('Second')
  })

  it('keeps the original visibility by default', async () => {
    const backup = backupWith([
      playlistWith('p1', 'Public', 1, { public: true }),
      playlistWith('p2', 'Private', 1, { public: false })
    ])
    const { store } = setupStore({ selectedPlaylists: selection(backup) })

    await store.runImport(backup)
    expect(createdPlaylists.map(entry => entry.public)).toEqual([true, false])
  })

  it('forces private playlists when requested', async () => {
    const backup = backupWith([playlistWith('p1', 'Public', 1, { public: true })])
    const { store } = setupStore({ selectedPlaylists: ['p1'], playlistVisibility: 'private' })

    await store.runImport(backup)
    expect(createdPlaylists[0].public).toBe(false)
  })

  it('forwards the collaborative flag', async () => {
    const backup = backupWith([playlistWith('p1', 'Collab', 1, { public: false, collaborative: true })])
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    await store.runImport(backup)
    expect(createdPlaylists[0].collaborative).toBe(true)
  })

  it('sends nothing for an empty playlist', async () => {
    const backup = backupWith([playlistWith('p1', 'Empty', 0)])
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backup)
    expect(result.playlistsCreated).toBe(1)
    expect(addItemsToPlaylist).not.toHaveBeenCalled()
  })
})

describe('runImport (duplicates)', () => {
  beforeEach(() => {
    vi.mocked(getMyPlaylists).mockResolvedValue([makePlaylist({ id: 'existing', name: 'First' })])
  })

  it('skips an existing playlist with the skip strategy', async () => {
    const backup = backupWith([playlistWith('p1', 'First', 5), playlistWith('p2', 'Second', 5)])
    const { store } = setupStore({ selectedPlaylists: selection(backup), duplicateStrategy: 'skip' })

    const result = await store.runImport(backup)

    expect(result.playlistsSkipped).toBe(1)
    expect(result.playlistsCreated).toBe(1)
    expect(createdPlaylists.map(entry => entry.name)).toEqual(['Second'])
  })

  it('compares names case insensitively and ignores surrounding spaces', async () => {
    const backup = backupWith([playlistWith('p1', '  first  ', 1)])
    const { store } = setupStore({ selectedPlaylists: ['p1'], duplicateStrategy: 'skip' })

    expect((await store.runImport(backup)).playlistsSkipped).toBe(1)
  })

  it('appends a dated suffix with the rename strategy', async () => {
    const backup = backupWith([playlistWith('p1', 'First', 1)])
    const { store } = setupStore({ selectedPlaylists: ['p1'], duplicateStrategy: 'rename' })

    await store.runImport(backup)
    const today = new Date().toISOString().slice(0, 10)
    expect(createdPlaylists[0].name).toBe(`First (Import ${today})`)
  })

  it('creates a second playlist with the same name with the create strategy', async () => {
    const backup = backupWith([playlistWith('p1', 'First', 1)])
    const { store } = setupStore({ selectedPlaylists: ['p1'], duplicateStrategy: 'create' })

    await store.runImport(backup)
    expect(createdPlaylists[0].name).toBe('First')
  })

  it('treats a playlist created during the run as existing', async () => {
    const backup = backupWith([playlistWith('p1', 'New', 1), playlistWith('p2', 'New', 1)])
    const { store } = setupStore({ selectedPlaylists: selection(backup), duplicateStrategy: 'skip' })

    const result = await store.runImport(backup)
    expect(result.playlistsCreated).toBe(1)
    expect(result.playlistsSkipped).toBe(1)
  })

  it('continues without the duplicate check when the playlist list fails', async () => {
    vi.mocked(getMyPlaylists).mockRejectedValue(new SpotifyApiError(500, 'Server kaputt', '/me/playlists'))
    const backup = backupWith([playlistWith('p1', 'First', 1)])
    const { store } = setupStore({ selectedPlaylists: ['p1'], duplicateStrategy: 'skip' })

    const result = await store.runImport(backup)
    expect(result.playlistsCreated).toBe(1)
    expect(result.errors[0]).toContain('Vorhandene Playlists: Server kaputt (HTTP 500)')
  })
})

describe('runImport (library)', () => {
  const likedBackup = (count: number): BackupData =>
    backupWith([], {
      savedTracks: makeTracks(count, 'liked').map((track, index) =>
        makeSavedTrack(track, `2023-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`)
      )
    })

  it('restores 45 liked songs in two batches', async () => {
    const { store } = setupStore()
    const result = await store.runImport(likedBackup(45))

    expect(result.savedTracksAdded).toBe(45)
    expect(savedBatches.map(batch => batch.uris.length)).toEqual([40, 5])
    expect(vi.mocked(libraryContains)).toHaveBeenCalledTimes(1)
  })

  it('restores the oldest liked song first', async () => {
    const { store } = setupStore()
    await store.runImport(likedBackup(3))

    expect(savedBatches[0].uris).toEqual([
      'spotify:track:liked-2',
      'spotify:track:liked-1',
      'spotify:track:liked-0'
    ])
  })

  it('skips liked songs that are already in the library', async () => {
    alreadyInLibrary = new Set(['spotify:track:liked-0', 'spotify:track:liked-1'])
    const { store } = setupStore()

    const result = await store.runImport(likedBackup(5))
    expect(result.savedTracksAdded).toBe(3)
    expect(savedBatches[0].uris).not.toContain('spotify:track:liked-0')
  })

  it('sends everything when the library check fails', async () => {
    vi.mocked(libraryContains).mockRejectedValue(new SpotifyApiError(500, 'kaputt', '/me/library/contains'))
    const { store } = setupStore()

    const result = await store.runImport(likedBackup(5))
    expect(result.savedTracksAdded).toBe(5)
    expect(result.errors[0]).toContain('Gespeicherte Songs: Abgleich fehlgeschlagen')
  })

  it('records an error when saving fails but keeps going', async () => {
    vi.mocked(saveToLibrary).mockRejectedValue(new SpotifyApiError(500, 'kaputt', '/me/library'))
    const backup = backupWith([], {
      savedTracks: [makeSavedTrack()],
      savedAlbums: [makeSavedAlbum()]
    })
    const { store } = setupStore()

    const result = await store.runImport(backup)
    expect(result.savedTracksAdded).toBe(0)
    expect(result.errors.some(error => error.startsWith('Gespeicherte Songs:'))).toBe(true)
    expect(result.errors.some(error => error.startsWith('Gespeicherte Alben:'))).toBe(true)
  })

  it('restores saved albums oldest first', async () => {
    const backup = backupWith([], {
      savedAlbums: [
        makeSavedAlbum({ ...makeSavedAlbum().album, id: 'a1', uri: 'spotify:album:a1' }),
        makeSavedAlbum({ ...makeSavedAlbum().album, id: 'a2', uri: 'spotify:album:a2' })
      ]
    })
    const { store } = setupStore()

    const result = await store.runImport(backup)
    expect(result.savedAlbumsAdded).toBe(2)
    expect(savedBatches[0].uris).toEqual(['spotify:album:a2', 'spotify:album:a1'])
  })

  it('follows the artists of the backup', async () => {
    const backup = backupWith([], { followedArtists: [makeArtist({ id: 'x', uri: undefined })] })
    const { store } = setupStore()

    const result = await store.runImport(backup)
    expect(result.artistsFollowed).toBe(1)
    expect(followedBatches[0].uris).toEqual(['spotify:artist:x'])
  })

  it('honours the include flags', async () => {
    const backup = backupWith([], {
      savedTracks: [makeSavedTrack()],
      savedAlbums: [makeSavedAlbum()],
      followedArtists: [makeArtist()]
    })
    const { store } = setupStore({
      includeSavedTracks: false,
      includeSavedAlbums: false,
      includeFollowedArtists: false
    })

    const result = await store.runImport(backup)
    expect(result.savedTracksAdded).toBe(0)
    expect(saveToLibrary).not.toHaveBeenCalled()
    expect(followArtists).not.toHaveBeenCalled()
  })
})

describe('runImport (cancel)', () => {
  it('stops between two track batches', async () => {
    vi.mocked(addItemsToPlaylist).mockImplementation(async (playlistId, uris, options = {}) =>
      batched(uris, PLAYLIST_ITEMS_BATCH_SIZE, options, batch => {
        addedBatches.push({ target: playlistId, uris: batch })
        store.cancel()
      })
    )

    const backup = backupWith([playlistWith('p1', 'First', 300)])
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backup)
    expect(result.tracksAdded).toBe(100)
    expect(addedBatches).toHaveLength(1)
    expect(store.currentOperation).toBe('Import abgebrochen')
  })

  it('does not start the next playlist after a cancel', async () => {
    vi.mocked(createPlaylist).mockImplementation(async input => {
      createdPlaylists.push({ name: input.name, public: input.public })
      store.cancel()
      return { id: `created-${createdPlaylists.length}`, uri: 'spotify:playlist:x' }
    })

    const backup = backupWith([playlistWith('p1', 'First', 1), playlistWith('p2', 'Second', 1)])
    const { store } = setupStore({ selectedPlaylists: selection(backup) })

    const result = await store.runImport(backup)
    expect(result.playlistsCreated).toBe(1)
    expect(createdPlaylists).toHaveLength(1)
  })

  it('skips the library restore after a cancel', async () => {
    vi.mocked(createPlaylist).mockImplementation(async input => {
      createdPlaylists.push({ name: input.name, public: input.public })
      store.cancel()
      return { id: 'created-1', uri: 'spotify:playlist:x' }
    })

    const backup = backupWith([playlistWith('p1', 'First', 1)], { savedTracks: [makeSavedTrack()] })
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backup)
    expect(result.savedTracksAdded).toBe(0)
    expect(saveToLibrary).not.toHaveBeenCalled()
  })

  it('ignores a cancel while nothing is running', () => {
    const { store } = setupStore()
    store.cancel()
    expect(store.cancelRequested).toBe(false)
  })

  it('resets the cancel flag after the run', async () => {
    const { store } = setupStore()
    await store.runImport(makeBackup())
    expect(store.cancelRequested).toBe(false)
    expect(store.isImporting).toBe(false)
  })
})

describe('runImport (errors)', () => {
  it('keeps importing the next playlist after a failure', async () => {
    vi.mocked(createPlaylist)
      .mockRejectedValueOnce(new SpotifyApiError(500, 'Server kaputt', '/me/playlists'))
      .mockImplementation(async input => {
        createdPlaylists.push({ name: input.name, public: input.public })
        return { id: 'created-2', uri: 'spotify:playlist:created-2' }
      })

    const backup = backupWith([playlistWith('p1', 'First', 5), playlistWith('p2', 'Second', 5)])
    const { store } = setupStore({ selectedPlaylists: selection(backup) })

    const result = await store.runImport(backup)

    expect(result.playlistsCreated).toBe(1)
    expect(result.tracksAdded).toBe(5)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toBe('Playlist "First": Server kaputt (HTTP 500)')
    expect(createdPlaylists.map(entry => entry.name)).toEqual(['Second'])
  })

  it('aborts the whole run when a scope is missing', async () => {
    vi.mocked(createPlaylist).mockRejectedValue(
      new SpotifyApiError(403, 'Insufficient client scope', '/me/playlists')
    )
    const backup = backupWith([playlistWith('p1', 'First', 1), playlistWith('p2', 'Second', 1)])
    const { store, appStore } = setupStore({ selectedPlaylists: selection(backup) })

    await expect(store.runImport(backup)).rejects.toThrow('Insufficient client scope')
    expect(store.needsReauth).toBe(true)
    expect(createPlaylist).toHaveBeenCalledTimes(1)
    expect(lastToast(appStore.toasts)).toMatchObject({ title: 'Berechtigungen fehlen' })
    expect(store.currentOperation).toBe('Import fehlgeschlagen')
  })

  it('warns instead of celebrating when there were hints', async () => {
    const playlist = playlistWith('p1', 'First', 1)
    playlist.tracks.items?.push(makeItem(makeTrack({ id: 'local' }), { is_local: true }))
    const { store, appStore } = setupStore({ selectedPlaylists: ['p1'] })

    await store.runImport(backupWith([playlist]))
    expect(lastToast(appStore.toasts)).toMatchObject({ type: 'warning' })
  })

  it('shows a success toast for a clean run', async () => {
    const backup = backupWith([playlistWith('p1', 'First', 1)])
    const { store, appStore } = setupStore({ selectedPlaylists: ['p1'] })

    await store.runImport(backup)
    expect(lastToast(appStore.toasts)).toMatchObject({ type: 'success', title: 'Import erfolgreich' })
  })
})

describe('runImport (summary)', () => {
  it('names saved albums and followed artists in the summary', async () => {
    const backup = backupWith([], {
      savedAlbums: [makeSavedAlbum()],
      followedArtists: [makeArtist()]
    })
    const { store, appStore } = setupStore()

    const result = await store.runImport(backup)

    expect(result.savedAlbumsAdded).toBe(1)
    expect(result.artistsFollowed).toBe(1)
    expect(lastToast(appStore.toasts)).toMatchObject({
      type: 'success',
      message: '1 gespeicherte Alben, 1 gefolgte Künstler.'
    })
    expect(store.resultSummary).toBe('1 gespeicherte Alben, 1 gefolgte Künstler.')
  })

  it('lists only the categories with a value', async () => {
    const backup = backupWith([playlistWith('p1', 'First', 2)])
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    await store.runImport(backup)
    expect(store.resultSummary).toBe('1 Playlist(s), 2 Titel.')
  })

  it('reports nothing to do instead of a success when nothing was written', async () => {
    alreadyInLibrary = new Set(['spotify:track:track-1', 'spotify:album:album-1'])
    const backup = backupWith([], {
      savedTracks: [makeSavedTrack()],
      savedAlbums: [makeSavedAlbum()]
    })
    const { store, appStore } = setupStore({ includeFollowedArtists: false })

    const result = await store.runImport(backup)

    expect(result.savedTracksAdded).toBe(0)
    expect(result.savedAlbumsAdded).toBe(0)
    expect(saveToLibrary).not.toHaveBeenCalled()
    expect(store.nothingToDo).toBe(true)
    expect(store.resultSummary).toBe(NOTHING_TO_DO_MESSAGE)
    expect(store.currentOperation).toBe('Nichts zu tun')
    expect(lastToast(appStore.toasts)).toMatchObject({ type: 'info', title: 'Nichts zu tun' })
  })

  it('keeps the success toast apart from the nothing to do case', async () => {
    const backup = backupWith([playlistWith('p1', 'First', 1)])
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    await store.runImport(backup)
    expect(store.nothingToDo).toBe(false)
    expect(store.currentOperation).toBe('Import abgeschlossen')
  })

  it('reports an empty cancel as an abort, not as nothing to do', async () => {
    vi.mocked(createPlaylist).mockImplementation(async () => {
      store.cancel()
      throw new SpotifyApiError(500, 'kaputt', '/me/playlists')
    })
    const backup = backupWith([playlistWith('p1', 'First', 1)])
    const { store, appStore } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backup)

    expect(result.cancelled).toBe(true)
    expect(store.wasCancelled).toBe(true)
    expect(store.nothingToDo).toBe(false)
    expect(store.currentOperation).toBe('Import abgebrochen')
    expect(store.resultSummary).toBe('Bis zum Abbruch wurde nichts übertragen.')
    expect(store.resultSummary).not.toBe(NOTHING_TO_DO_MESSAGE)
    expect(lastToast(appStore.toasts)).toMatchObject({
      type: 'warning',
      title: 'Import abgebrochen',
      message: 'Bis zum Abbruch wurde nichts übertragen.'
    })
  })

  it('names what was transferred before an abort', async () => {
    vi.mocked(addItemsToPlaylist).mockImplementation(async (playlistId, uris, options = {}) =>
      batched(uris, PLAYLIST_ITEMS_BATCH_SIZE, options, batch => {
        addedBatches.push({ target: playlistId, uris: batch })
        store.cancel()
      })
    )
    const backup = backupWith([playlistWith('p1', 'First', 300)])
    const { store, appStore } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backup)

    expect(result.cancelled).toBe(true)
    expect(store.nothingToDo).toBe(false)
    expect(store.resultSummary).toBe('Bis zum Abbruch übertragen: 1 Playlist(s), 100 Titel.')
    expect(lastToast(appStore.toasts)).toMatchObject({
      type: 'warning',
      title: 'Import abgebrochen',
      message: 'Bis zum Abbruch übertragen: 1 Playlist(s), 100 Titel.'
    })
  })

  it('leaves a finished run unmarked', async () => {
    const backup = backupWith([playlistWith('p1', 'First', 1)])
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backup)
    expect(result.cancelled).toBe(false)
    expect(store.wasCancelled).toBe(false)
  })
})

describe('progress and state', () => {
  it('ends at 100 percent', async () => {
    const backup = backupWith([playlistWith('p1', 'First', 150)], {
      savedTracks: [makeSavedTrack()]
    })
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    await store.runImport(backup)
    expect(store.progress).toBe(100)
    expect(store.currentOperation).toBe('Import abgeschlossen')
  })

  it('publishes the result on the store', async () => {
    const backup = backupWith([playlistWith('p1', 'First', 1)])
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backup)
    // The store exposes a reactive proxy of the same result object
    expect(store.results).toStrictEqual(result)
  })

  it('reset clears results and the re-auth hint', async () => {
    const { store } = setupStore()
    await store.runImport(makeBackup())
    store.reset()

    expect(store.results).toBeNull()
    expect(store.progress).toBe(0)
    expect(store.needsReauth).toBe(false)
  })

  it('reset also clears the operation, the errors and the selection', async () => {
    const playlist = playlistWith('p1', 'First', 1)
    playlist.tracks.items?.push(makeItem(null))
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backupWith([playlist]))
    expect(result.errors.length).toBeGreaterThan(0)

    store.reset()

    expect(store.results).toBeNull()
    expect(store.currentOperation).toBe('')
    expect(store.resultSummary).toBe('')
    expect(store.nothingToDo).toBe(false)
    expect(store.importOptions.selectedPlaylists).toEqual([])
    expect(store.existingPlaylistNames).toEqual([])
  })

  it('leaves a running import untouched when the guarded reset fires', async () => {
    const observed: boolean[] = []

    vi.mocked(addItemsToPlaylist).mockImplementation(async (playlistId, uris, options = {}) =>
      batched(uris, PLAYLIST_ITEMS_BATCH_SIZE, options, batch => {
        addedBatches.push({ target: playlistId, uris: batch })
        // Same guard the view applies when the route is entered again mid-run
        if (!store.isImporting) store.reset()
        observed.push(store.isImporting)
      })
    )

    const backup = backupWith([playlistWith('p1', 'First', 150)])
    const { store } = setupStore({ selectedPlaylists: ['p1'] })

    const result = await store.runImport(backup)

    expect(observed).toEqual([true, true])
    expect(result.tracksAdded).toBe(150)
    expect(store.results).not.toBeNull()
    expect(store.progress).toBe(100)
  })
})

describe('loadExistingPlaylists', () => {
  it('keeps only the playlists of the signed in user', async () => {
    vi.mocked(getMyPlaylists).mockResolvedValue([
      makePlaylist({ id: 'a', name: 'Mine' }),
      makePlaylist({ id: 'b', name: 'Theirs', owner: { id: 'user-2', display_name: 'Other' } })
    ])
    const { store } = setupStore()

    await expect(store.loadExistingPlaylists()).resolves.toEqual(['Mine'])
  })

  it('caches the result until a reload is forced', async () => {
    const { store } = setupStore()
    await store.loadExistingPlaylists()
    await store.loadExistingPlaylists()
    expect(getMyPlaylists).toHaveBeenCalledTimes(1)

    await store.loadExistingPlaylists(true)
    expect(getMyPlaylists).toHaveBeenCalledTimes(2)
  })
})
