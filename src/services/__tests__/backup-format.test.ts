import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT_VERSION,
  applyBackupOptions,
  countPlaylistItems,
  defaultBackupFilters,
  normalizeBackup
} from '@/services/backup-format'
import type { BackupData, BackupFilters, BackupOptions, SpotifyTrack } from '@/types'
import {
  makeArtist,
  makeBackup,
  makeItem,
  makePlaylist,
  makeSavedAlbum,
  makeSavedTrack,
  makeTrack,
  makeUser
} from '@/test/fixtures'

/** A raw 2.0 file: playlist items are bare track objects, no `item` wrapper. */
const legacyBackup = (): Record<string, unknown> => ({
  version: '2.0',
  exportDate: '2023-01-01T00:00:00.000Z',
  user: { id: 'user-1', display_name: 'Test User', images: [] },
  playlists: [
    {
      id: 'playlist-1',
      name: 'Old Playlist',
      description: 'legacy',
      public: true,
      collaborative: false,
      owner: { id: 'user-1', display_name: 'Test User' },
      images: [],
      external_urls: { spotify: 'https://open.spotify.com/playlist/playlist-1' },
      tracks: {
        total: 2,
        items: [
          {
            id: 'track-a',
            name: 'Legacy A',
            uri: 'spotify:track:track-a',
            added_at: '2021-06-01T12:00:00Z',
            artists: [],
            album: { id: 'album-a', name: 'Album A' },
            external_ids: { isrc: 'DEA621500001' },
            duration_ms: 1000,
            explicit: false,
            external_urls: { spotify: 'https://open.spotify.com/track/track-a' }
          },
          {
            id: 'track-b',
            name: 'Legacy B',
            artists: [],
            album: { id: 'album-b', name: 'Album B' },
            duration_ms: 2000,
            explicit: false,
            external_urls: { spotify: 'https://open.spotify.com/track/track-b' }
          }
        ]
      }
    }
  ],
  savedTracks: [{ added_at: '2021-01-01T00:00:00Z', track: { id: 'saved-1', name: 'Saved' } }],
  metadata: { totalPlaylists: 99, totalTracks: 99, totalSavedTracks: 99 }
})

const options = (
  selectedPlaylists: string[],
  filters: Partial<BackupFilters> = {}
): BackupOptions => ({
  selectedPlaylists,
  filters: { ...defaultBackupFilters(), ...filters },
  exportFormat: 'json'
})

describe('defaultBackupFilters', () => {
  it('enables every section and restricts to own playlists', () => {
    const filters = defaultBackupFilters()
    expect(filters.onlyOwnPlaylists).toBe(true)
    expect(Object.values(filters).every(Boolean)).toBe(true)
  })

  it('returns a fresh object on every call', () => {
    expect(defaultBackupFilters()).not.toBe(defaultBackupFilters())
  })
})

describe('countPlaylistItems', () => {
  it('sums the loaded items, not tracks.total', () => {
    const playlists = [
      makePlaylist({ id: 'a', tracks: { total: 500, items: [makeItem(makeTrack())] } }),
      makePlaylist({ id: 'b', tracks: { total: 0, items: [makeItem(makeTrack()), makeItem(null)] } })
    ]
    expect(countPlaylistItems(playlists)).toBe(3)
  })

  it('is 0 for playlists without loaded items', () => {
    expect(countPlaylistItems([makePlaylist({ tracks: { total: 10 } })])).toBe(0)
  })
})

describe('normalizeBackup (2.0 to 2.2)', () => {
  it('reports the current format version', () => {
    expect(normalizeBackup(legacyBackup()).version).toBe(BACKUP_FORMAT_VERSION)
    expect(BACKUP_FORMAT_VERSION).toBe('2.2')
  })

  it('lifts bare tracks into playlist items', () => {
    const items = normalizeBackup(legacyBackup()).playlists[0].tracks.items ?? []
    expect(items).toHaveLength(2)
    expect(items[0].item?.name).toBe('Legacy A')
    expect(items[0].is_local).toBe(false)
    expect(items[0].added_by).toBeNull()
  })

  it('keeps the added_at of a legacy track entry', () => {
    const items = normalizeBackup(legacyBackup()).playlists[0].tracks.items ?? []
    expect(items[0].added_at).toBe('2021-06-01T12:00:00Z')
  })

  it('uses null for a legacy entry without added_at', () => {
    const items = normalizeBackup(legacyBackup()).playlists[0].tracks.items ?? []
    expect(items[1].added_at).toBeNull()
  })

  it('recalculates the metadata instead of trusting the file', () => {
    const normalized = normalizeBackup(legacyBackup())
    expect(normalized.metadata).toMatchObject({
      totalPlaylists: 1,
      totalTracks: 2,
      totalSavedTracks: 1
    })
  })

  it('keeps the export date of the file', () => {
    expect(normalizeBackup(legacyBackup()).exportDate).toBe('2023-01-01T00:00:00.000Z')
  })

  it('falls back to now when the export date is missing', () => {
    const raw = legacyBackup()
    delete raw.exportDate
    expect(Number.isNaN(Date.parse(normalizeBackup(raw).exportDate))).toBe(false)
  })

  it('derives tracks.total from the items when the file has none', () => {
    const raw = legacyBackup() as { playlists: { tracks: { total?: number } }[] }
    delete raw.playlists[0].tracks.total
    expect(normalizeBackup(raw).playlists[0].tracks.total).toBe(2)
  })

  it('keeps an ISRC that a 2.0 file already carried', () => {
    const items = normalizeBackup(legacyBackup()).playlists[0].tracks.items ?? []
    expect((items[0].item as SpotifyTrack).external_ids?.isrc).toBe('DEA621500001')
  })

  it('invents no ISRC for a legacy entry without one', () => {
    const items = normalizeBackup(legacyBackup()).playlists[0].tracks.items ?? []
    expect((items[1].item as SpotifyTrack).external_ids).toBeUndefined()
  })

  it('keeps errors from the metadata', () => {
    const raw = legacyBackup()
    raw.metadata = { errors: ['Playlist X konnte nicht geladen werden'] }
    expect(normalizeBackup(raw).metadata.errors).toEqual(['Playlist X konnte nicht geladen werden'])
  })

  it('drops non-array errors', () => {
    const raw = legacyBackup()
    raw.metadata = { errors: 'kaputt' }
    expect(normalizeBackup(raw).metadata.errors).toBeUndefined()
  })
})

describe('normalizeBackup (2.1 and 2.2 passthrough)', () => {
  const current = (): BackupData =>
    makeBackup({
      playlists: [
        makePlaylist({
          tracks: {
            total: 2,
            items: [
              makeItem(makeTrack({ id: 'keep' }), { added_at: '2024-01-01T00:00:00Z', is_local: true }),
              makeItem(makeTrack({ id: 'other' }))
            ]
          }
        })
      ],
      savedTracks: [makeSavedTrack()],
      savedAlbums: [makeSavedAlbum()],
      followedArtists: [makeArtist()]
    })

  it('keeps added_at, added_by and is_local of 2.1 entries', () => {
    const items = normalizeBackup(current()).playlists[0].tracks.items ?? []
    expect(items[0].added_at).toBe('2024-01-01T00:00:00Z')
    expect(items[0].is_local).toBe(true)
    expect(items[0].added_by).toEqual({ id: 'user-1' })
  })

  it('drops entries whose item is null', () => {
    const backup = current()
    backup.playlists[0].tracks.items = [makeItem(null), makeItem(makeTrack())]
    expect(normalizeBackup(backup).playlists[0].tracks.items).toHaveLength(1)
  })

  it('lifts a 2.1 file to the current version and keeps the ISRC and the UPC', () => {
    const backup = { ...current(), version: '2.1' }
    const normalized = normalizeBackup(backup)
    expect(normalized.version).toBe(BACKUP_FORMAT_VERSION)
    const item = normalized.playlists[0].tracks.items?.[0].item as SpotifyTrack
    expect(item.external_ids?.isrc).toBe('DEQ621500001')
    expect(normalized.savedTracks[0].track.external_ids?.isrc).toBe('DEQ621500001')
    expect(normalized.savedAlbums?.[0].album.external_ids?.upc).toBe('00602557000001')
  })

  it('stays valid for a backup whose tracks carry no external ids', () => {
    const backup = current()
    backup.playlists[0].tracks.items = [makeItem(makeTrack({ external_ids: undefined }))]
    backup.savedTracks = [makeSavedTrack(makeTrack({ external_ids: undefined }))]
    const normalized = normalizeBackup(backup)
    expect(normalized.version).toBe(BACKUP_FORMAT_VERSION)
    expect((normalized.playlists[0].tracks.items?.[0].item as SpotifyTrack).external_ids)
      .toBeUndefined()
    expect(normalized.savedTracks[0].track.external_ids).toBeUndefined()
  })

  it('keeps saved albums and followed artists', () => {
    const normalized = normalizeBackup(current())
    expect(normalized.savedAlbums).toHaveLength(1)
    expect(normalized.followedArtists).toHaveLength(1)
    expect(normalized.metadata.totalSavedAlbums).toBe(1)
    expect(normalized.metadata.totalFollowedArtists).toBe(1)
  })

  it('leaves the optional sections undefined when they are absent', () => {
    const normalized = normalizeBackup(makeBackup())
    expect(normalized.savedAlbums).toBeUndefined()
    expect(normalized.followedArtists).toBeUndefined()
    expect(normalized.metadata.totalSavedAlbums).toBeUndefined()
  })

  it('is idempotent', () => {
    const once = normalizeBackup(current())
    expect(normalizeBackup(once)).toEqual(once)
  })
})

describe('normalizeBackup (invalid input)', () => {
  it.each([null, 42, 'text', [1, 2]])('rejects %j as a non-object', value => {
    expect(() => normalizeBackup(value)).toThrow('Ungültige Backup-Datei: kein Objekt')
  })

  it.each([
    ['version', { user: {}, playlists: [], savedTracks: [] }],
    ['user', { version: '2.1', playlists: [], savedTracks: [] }],
    ['playlists', { version: '2.1', user: {}, savedTracks: [] }],
    ['savedTracks', { version: '2.1', user: {}, playlists: [] }]
  ])('rejects a file without %s', (_field, value) => {
    expect(() => normalizeBackup(value)).toThrow('Pflichtfelder fehlen')
  })
})

describe('applyBackupOptions', () => {
  const backup = (): BackupData =>
    makeBackup({
      playlists: [
        makePlaylist({
          id: 'own-public',
          name: 'Own public',
          public: true,
          tracks: { total: 1, items: [makeItem(makeTrack())] }
        }),
        makePlaylist({ id: 'own-private', name: 'Own private', public: false }),
        makePlaylist({ id: 'own-collab', name: 'Own collaborative', public: false, collaborative: true }),
        makePlaylist({
          id: 'foreign',
          name: 'Someone else',
          owner: { id: 'user-2', display_name: 'Other' }
        })
      ],
      savedTracks: [makeSavedTrack()],
      savedAlbums: [makeSavedAlbum()],
      followedArtists: [makeArtist()],
      user: makeUser({ id: 'user-1' })
    })

  const ids = (data: BackupData): string[] => data.playlists.map(playlist => playlist.id)

  it('keeps only the selected playlists', () => {
    const result = applyBackupOptions(backup(), options(['own-public']))
    expect(ids(result)).toEqual(['own-public'])
  })

  it('returns nothing when nothing is selected', () => {
    expect(ids(applyBackupOptions(backup(), options([])))).toEqual([])
  })

  it('drops foreign playlists with onlyOwnPlaylists', () => {
    const result = applyBackupOptions(backup(), options(['own-public', 'foreign']))
    expect(ids(result)).toEqual(['own-public'])
  })

  it('keeps foreign playlists without onlyOwnPlaylists', () => {
    const result = applyBackupOptions(
      backup(),
      options(['own-public', 'foreign'], { onlyOwnPlaylists: false })
    )
    expect(ids(result)).toEqual(['own-public', 'foreign'])
  })

  it('filters public playlists', () => {
    const result = applyBackupOptions(
      backup(),
      options(['own-public', 'own-private'], { includePublicPlaylists: false })
    )
    expect(ids(result)).toEqual(['own-private'])
  })

  it('filters private playlists', () => {
    const result = applyBackupOptions(
      backup(),
      options(['own-public', 'own-private'], { includePrivatePlaylists: false })
    )
    expect(ids(result)).toEqual(['own-public'])
  })

  it('treats a collaborative playlist as collaborative, not as private', () => {
    const onlyCollab = applyBackupOptions(
      backup(),
      options(['own-private', 'own-collab'], { includePrivatePlaylists: false })
    )
    expect(ids(onlyCollab)).toEqual(['own-collab'])

    const withoutCollab = applyBackupOptions(
      backup(),
      options(['own-private', 'own-collab'], { includeCollaborativePlaylists: false })
    )
    expect(ids(withoutCollab)).toEqual(['own-private'])
  })

  it('drops saved tracks when includeSavedTracks is off', () => {
    const result = applyBackupOptions(backup(), options([], { includeSavedTracks: false }))
    expect(result.savedTracks).toEqual([])
    expect(result.metadata.totalSavedTracks).toBe(0)
  })

  it('drops saved albums when includeSavedAlbums is off', () => {
    const result = applyBackupOptions(backup(), options([], { includeSavedAlbums: false }))
    expect(result.savedAlbums).toBeUndefined()
    expect(result.metadata.totalSavedAlbums).toBeUndefined()
  })

  it('drops followed artists when includeFollowedArtists is off', () => {
    const result = applyBackupOptions(backup(), options([], { includeFollowedArtists: false }))
    expect(result.followedArtists).toBeUndefined()
  })

  it('keeps description and images with includeMetadata', () => {
    const result = applyBackupOptions(backup(), options(['own-public']))
    expect(result.playlists[0].description).toBe('A description')
    expect(result.playlists[0].images).toHaveLength(1)
  })

  it('strips description and images without includeMetadata', () => {
    const result = applyBackupOptions(backup(), options(['own-public'], { includeMetadata: false }))
    expect(result.playlists[0].description).toBe('')
    expect(result.playlists[0].images).toEqual([])
    expect(result.playlists[0].tracks.items).toHaveLength(1)
  })

  it('does not mutate the source backup', () => {
    const source = backup()
    applyBackupOptions(source, options(['own-public'], { includeMetadata: false }))
    expect(source.playlists[0].description).toBe('A description')
  })

  it('recalculates the metadata for the selection', () => {
    const result = applyBackupOptions(backup(), options(['own-public']))
    expect(result.metadata).toMatchObject({
      totalPlaylists: 1,
      totalTracks: 1,
      totalSavedTracks: 1,
      totalSavedAlbums: 1,
      totalFollowedArtists: 1
    })
  })

  it('stamps the current format version and keeps user and export date', () => {
    const source = backup()
    const result = applyBackupOptions(source, options(['own-public']))
    expect(result.version).toBe(BACKUP_FORMAT_VERSION)
    expect(result.exportDate).toBe(source.exportDate)
    expect(result.user).toBe(source.user)
  })

  it('carries over the collected errors', () => {
    const source = backup()
    source.metadata.errors = ['Playlist Y']
    expect(applyBackupOptions(source, options([])).metadata.errors).toEqual(['Playlist Y'])
  })
})
