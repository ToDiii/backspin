import { BACKUP_FORMAT_VERSION } from '@/services/backup-format'
import type {
  BackupData,
  BackupMetadata,
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyEpisode,
  SpotifyPlaylist,
  SpotifyPlaylistItem,
  SpotifySavedAlbum,
  SpotifySavedTrack,
  SpotifyTrack,
  SpotifyUser
} from '@/types'

/** Minimal but complete fixtures, so tests only spell out the fields they care about. */

export const makeUser = (overrides: Partial<SpotifyUser> = {}): SpotifyUser => ({
  id: 'user-1',
  display_name: 'Test User',
  images: [],
  ...overrides
})

export const makeArtist = (overrides: Partial<SpotifyArtist> = {}): SpotifyArtist => ({
  id: 'artist-1',
  name: 'Artist One',
  external_urls: { spotify: 'https://open.spotify.com/artist/artist-1' },
  uri: 'spotify:artist:artist-1',
  ...overrides
})

export const makeAlbum = (overrides: Partial<SpotifyAlbum> = {}): SpotifyAlbum => ({
  id: 'album-1',
  name: 'Album One',
  artists: [makeArtist()],
  images: [],
  release_date: '2020-01-01',
  external_urls: { spotify: 'https://open.spotify.com/album/album-1' },
  uri: 'spotify:album:album-1',
  total_tracks: 10,
  external_ids: { upc: '00602557000001' },
  ...overrides
})

export const makeTrack = (overrides: Partial<SpotifyTrack> = {}): SpotifyTrack => ({
  id: 'track-1',
  name: 'Track One',
  artists: [makeArtist()],
  album: makeAlbum(),
  duration_ms: 210_000,
  explicit: false,
  uri: 'spotify:track:track-1',
  external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
  external_ids: { isrc: 'DEQ621500001' },
  ...overrides
})

export const makeEpisode = (overrides: Partial<SpotifyEpisode> = {}): SpotifyEpisode => ({
  type: 'episode',
  id: 'episode-1',
  name: 'Episode One',
  uri: 'spotify:episode:episode-1',
  duration_ms: 1_800_000,
  external_urls: { spotify: 'https://open.spotify.com/episode/episode-1' },
  ...overrides
})

export const makeItem = (
  item: SpotifyTrack | SpotifyEpisode | null,
  overrides: Partial<SpotifyPlaylistItem> = {}
): SpotifyPlaylistItem => ({
  added_at: '2023-05-01T10:00:00Z',
  added_by: { id: 'user-1' },
  is_local: false,
  item,
  ...overrides
})

export const makePlaylist = (overrides: Partial<SpotifyPlaylist> = {}): SpotifyPlaylist => ({
  id: 'playlist-1',
  name: 'Playlist One',
  description: 'A description',
  public: true,
  collaborative: false,
  owner: { id: 'user-1', display_name: 'Test User' },
  images: [{ url: 'https://example.test/cover.jpg', height: 300, width: 300 }],
  external_urls: { spotify: 'https://open.spotify.com/playlist/playlist-1' },
  tracks: { total: 0, items: [] },
  ...overrides
})

export const makeSavedTrack = (
  track: SpotifyTrack = makeTrack(),
  added_at = '2023-01-01T00:00:00Z'
): SpotifySavedTrack => ({ added_at, track })

export const makeSavedAlbum = (
  album: SpotifyAlbum = makeAlbum(),
  added_at = '2023-01-01T00:00:00Z'
): SpotifySavedAlbum => ({ added_at, album })

export const makeMetadata = (overrides: Partial<BackupMetadata> = {}): BackupMetadata => ({
  totalPlaylists: 0,
  totalTracks: 0,
  totalSavedTracks: 0,
  ...overrides
})

export const makeBackup = (overrides: Partial<BackupData> = {}): BackupData => ({
  version: BACKUP_FORMAT_VERSION,
  exportDate: '2024-03-01T12:00:00.000Z',
  user: makeUser(),
  playlists: [],
  savedTracks: [],
  metadata: makeMetadata(),
  ...overrides
})

/** `n` saved albums with predictable ids, used for count assertions in views. */
export const makeSavedAlbums = (count: number, prefix = 'album'): SpotifySavedAlbum[] =>
  Array.from({ length: count }, (_value, index) =>
    makeSavedAlbum(
      makeAlbum({
        id: `${prefix}-${index}`,
        name: `${prefix} ${index}`,
        uri: `spotify:album:${prefix}-${index}`
      })
    )
  )

/** `n` artists with predictable ids, used for count assertions in views. */
export const makeArtists = (count: number, prefix = 'artist'): SpotifyArtist[] =>
  Array.from({ length: count }, (_value, index) =>
    makeArtist({
      id: `${prefix}-${index}`,
      name: `${prefix} ${index}`,
      uri: `spotify:artist:${prefix}-${index}`
    })
  )

/** `n` tracks with predictable ids, used for batch size assertions. */
export const makeTracks = (count: number, prefix = 'track'): SpotifyTrack[] =>
  Array.from({ length: count }, (_value, index) =>
    makeTrack({
      id: `${prefix}-${index}`,
      name: `${prefix} ${index}`,
      uri: `spotify:track:${prefix}-${index}`
    })
  )
