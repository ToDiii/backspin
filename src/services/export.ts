import JSZip from 'jszip'
import type {
  BackupData,
  SpotifyEpisode,
  SpotifyPlaylist,
  SpotifyPlaylistItem,
  SpotifyTrack
} from '@/types'

export const LIKED_SONGS_NAME = 'Liked Songs'

const CSV_COLUMNS = ['playlist', 'track', 'artists', 'album', 'duration_s', 'added_at', 'is_local', 'uri', 'isrc']
const ALBUM_CSV_COLUMNS = ['album', 'artists', 'release_date', 'total_tracks', 'added_at', 'uri', 'upc']
const ARTIST_CSV_COLUMNS = ['artist', 'genres', 'uri']

// Excel only detects UTF-8 in CSV files that start with a byte order mark
const UTF8_BOM = '\uFEFF'
const CRLF = '\r\n'
const MAX_FILE_NAME_LENGTH = 100

const isEpisode = (item: SpotifyTrack | SpotifyEpisode): item is SpotifyEpisode =>
  (item as SpotifyEpisode).type === 'episode'

/** RFC 4180: quote every field, double inner quotes, prefix formula triggers against CSV injection. */
const escapeCsvValue = (value: unknown): string => {
  const raw = value === null || value === undefined ? '' : String(value)
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${guarded.replace(/"/g, '""')}"`
}

const csvRow = (values: unknown[]): string => values.map(escapeCsvValue).join(',')

const toIsoDate = (value: string | null | undefined): string => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

const artistNames = (item: SpotifyTrack | SpotifyEpisode): string =>
  isEpisode(item) ? '' : item.artists.map(artist => artist.name).join(', ')

const durationSeconds = (item: SpotifyTrack | SpotifyEpisode): number =>
  Math.floor((item.duration_ms ?? 0) / 1000)

const itemUri = (item: SpotifyTrack | SpotifyEpisode): string =>
  item.uri || item.external_urls?.spotify || ''

/** Empty for episodes, for local files and whenever the data carries no ISRC at all. */
const itemIsrc = (item: SpotifyTrack | SpotifyEpisode): string =>
  isEpisode(item) ? '' : item.external_ids?.isrc ?? ''

const trackRow = (playlistName: string, entry: SpotifyPlaylistItem): string | null => {
  const item = entry.item
  if (!item) return null

  return csvRow([
    playlistName,
    item.name,
    artistNames(item),
    isEpisode(item) ? '' : item.album?.name ?? '',
    durationSeconds(item),
    toIsoDate(entry.added_at),
    entry.is_local ? 'true' : 'false',
    itemUri(item),
    itemIsrc(item)
  ])
}

/** Liked Songs as a synthetic playlist, so tracks and playlists share one code path. */
export const likedSongsPlaylist = (backup: BackupData): SpotifyPlaylist | null => {
  if (!backup.savedTracks || backup.savedTracks.length === 0) return null

  return {
    id: 'liked-songs',
    name: LIKED_SONGS_NAME,
    description: '',
    public: false,
    collaborative: false,
    owner: { id: backup.user?.id ?? '', display_name: backup.user?.display_name ?? '' },
    images: [],
    external_urls: { spotify: 'https://open.spotify.com/collection/tracks' },
    tracks: {
      total: backup.savedTracks.length,
      items: backup.savedTracks.map(saved => ({
        added_at: saved.added_at ?? null,
        added_by: null,
        is_local: false,
        item: saved.track
      }))
    }
  }
}

const exportablePlaylists = (backup: BackupData): SpotifyPlaylist[] => {
  const liked = likedSongsPlaylist(backup)
  return liked ? [...backup.playlists, liked] : [...backup.playlists]
}

/** Track export as CSV (RFC 4180, UTF-8 BOM). Liked Songs appear with playlist = "Liked Songs". */
export const buildCsv = (backup: BackupData): string => {
  const lines = [csvRow(CSV_COLUMNS)]

  for (const playlist of exportablePlaylists(backup)) {
    for (const entry of playlist.tracks?.items ?? []) {
      const row = trackRow(playlist.name, entry)
      if (row) lines.push(row)
    }
  }

  return UTF8_BOM + lines.join(CRLF) + CRLF
}

export const buildAlbumsCsv = (backup: BackupData): string => {
  const lines = [csvRow(ALBUM_CSV_COLUMNS)]

  for (const saved of backup.savedAlbums ?? []) {
    lines.push(csvRow([
      saved.album?.name ?? '',
      saved.album?.artists?.map(artist => artist.name).join(', ') ?? '',
      saved.album?.release_date ?? '',
      saved.album?.total_tracks ?? '',
      toIsoDate(saved.added_at),
      saved.album?.uri ?? saved.album?.external_urls?.spotify ?? '',
      saved.album?.external_ids?.upc ?? ''
    ]))
  }

  return UTF8_BOM + lines.join(CRLF) + CRLF
}

export const buildArtistsCsv = (backup: BackupData): string => {
  const lines = [csvRow(ARTIST_CSV_COLUMNS)]

  for (const artist of backup.followedArtists ?? []) {
    lines.push(csvRow([
      artist.name,
      artist.genres?.join(', ') ?? '',
      artist.uri ?? artist.external_urls?.spotify ?? ''
    ]))
  }

  return UTF8_BOM + lines.join(CRLF) + CRLF
}

const openSpotifyUrl = (item: SpotifyTrack | SpotifyEpisode): string | null => {
  if (!item.id) return item.external_urls?.spotify ?? null
  return `https://open.spotify.com/${isEpisode(item) ? 'episode' : 'track'}/${item.id}`
}

const singleLine = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim()

/**
 * Extended M3U for one playlist. Local files are skipped: they have no resolvable
 * Spotify URL and cannot be restored through the API either.
 */
export const buildM3u = (playlist: SpotifyPlaylist): string => {
  const lines = ['#EXTM3U', `#PLAYLIST:${singleLine(playlist.name)}`]

  for (const entry of playlist.tracks?.items ?? []) {
    const item = entry.item
    if (!item || entry.is_local) continue

    const url = openSpotifyUrl(item)
    if (!url) continue

    const artists = artistNames(item)
    const title = singleLine(artists ? `${artists} - ${item.name}` : item.name)
    lines.push(`#EXTINF:${durationSeconds(item)},${title}`)
    lines.push(url)
  }

  return lines.join('\n') + '\n'
}

export const buildJson = (backup: BackupData): string => JSON.stringify(backup, null, 2)

/** Removes characters that are invalid in file names on Windows, macOS and Linux. */
export const sanitizeFileName = (name: string): string => {
  const cleaned = name
    .replace(/[\r\n]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')

  const truncated = cleaned.slice(0, MAX_FILE_NAME_LENGTH).trim()
  return truncated || 'Playlist'
}

const uniqueFileName = (base: string, extension: string, used: Set<string>): string => {
  let candidate = `${base}${extension}`
  let counter = 2

  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`
    candidate = `${base.slice(0, MAX_FILE_NAME_LENGTH - suffix.length)}${suffix}${extension}`
    counter += 1
  }

  used.add(candidate.toLowerCase())
  return candidate
}

/** One .m3u8 file per playlist, Liked Songs included, packed into a single ZIP. */
export const buildM3uZip = async (backup: BackupData): Promise<Blob> => {
  const zip = new JSZip()
  const used = new Set<string>()

  for (const playlist of exportablePlaylists(backup)) {
    if (!playlist.tracks?.items || playlist.tracks.items.length === 0) continue
    const fileName = uniqueFileName(sanitizeFileName(playlist.name), '.m3u8', used)
    zip.file(fileName, buildM3u(playlist))
  }

  return zip.generateAsync({ type: 'blob' })
}

export const hasExtraCsvSections = (backup: BackupData): boolean =>
  (backup.savedAlbums?.length ?? 0) > 0 || (backup.followedArtists?.length ?? 0) > 0

/** ZIP with tracks.csv plus albums.csv/artists.csv, used when the backup holds more than tracks. */
export const buildCsvZip = async (backup: BackupData): Promise<Blob> => {
  const zip = new JSZip()
  zip.file('tracks.csv', buildCsv(backup))

  if ((backup.savedAlbums?.length ?? 0) > 0) {
    zip.file('albums.csv', buildAlbumsCsv(backup))
  }
  if ((backup.followedArtists?.length ?? 0) > 0) {
    zip.file('artists.csv', buildArtistsCsv(backup))
  }

  return zip.generateAsync({ type: 'blob' })
}

export const backupFileName = (extension: string, date: Date = new Date()): string =>
  `backspin-${date.toISOString().slice(0, 10)}.${extension}`
