import type {
  BackupData,
  BackupFilters,
  BackupOptions,
  SpotifyPlaylist,
  SpotifyPlaylistItem,
  SpotifyTrack
} from '@/types'

// 2.0 stored playlist tracks as SpotifyTrack[]; 2.1 stores SpotifyPlaylistItem[] and keeps added_at.
// 2.2 declares the optional `external_ids` of tracks (ISRC) and albums (UPC). The API
// always delivered them unfiltered, so older files usually carry them already.
export const BACKUP_FORMAT_VERSION = '2.2'

export const defaultBackupFilters = (): BackupFilters => ({
  onlyOwnPlaylists: true,
  includePublicPlaylists: true,
  includePrivatePlaylists: true,
  includeCollaborativePlaylists: true,
  includeSavedTracks: true,
  includeSavedAlbums: true,
  includeFollowedArtists: true,
  includeMetadata: true
})

export const countPlaylistItems = (playlists: SpotifyPlaylist[]): number =>
  playlists.reduce((sum, playlist) => sum + (playlist.tracks?.items?.length ?? 0), 0)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// A 2.0 entry is a bare track object, a 2.1 entry carries the `item` key
const isLegacyTrackEntry = (entry: unknown): entry is SpotifyTrack =>
  isRecord(entry) && !('item' in entry) && ('id' in entry || 'name' in entry)

const liftPlaylistItems = (entries: unknown[]): SpotifyPlaylistItem[] =>
  entries.map(entry => {
    if (isLegacyTrackEntry(entry)) {
      return {
        added_at: typeof entry.added_at === 'string' ? entry.added_at : null,
        added_by: null,
        is_local: false,
        item: entry
      }
    }

    const record = isRecord(entry) ? entry : {}
    return {
      added_at: typeof record.added_at === 'string' ? record.added_at : null,
      added_by: (record.added_by ?? null) as SpotifyPlaylistItem['added_by'],
      is_local: record.is_local === true,
      item: (record.item ?? null) as SpotifyPlaylistItem['item']
    }
  }).filter(entry => entry.item !== null)

/**
 * Accepts backups of format 2.0, 2.1 and 2.2 and always returns the current shape.
 * Lifting to 2.2 is a no-op for the external ids: they are passed through untouched,
 * so a file that already carries an ISRC keeps it, whatever version it claims, and one
 * without stays without. Nothing is invented and nothing is looked up.
 * Throws for structurally invalid files.
 */
export const normalizeBackup = (data: unknown): BackupData => {
  if (!isRecord(data)) {
    throw new Error('Ungültige Backup-Datei: kein Objekt')
  }
  if (typeof data.version !== 'string' || !isRecord(data.user) || !Array.isArray(data.playlists) || !Array.isArray(data.savedTracks)) {
    throw new Error('Ungültige Backup-Datei: Pflichtfelder fehlen')
  }

  const playlists: SpotifyPlaylist[] = (data.playlists as unknown[]).map(entry => {
    const playlist = (isRecord(entry) ? entry : {}) as unknown as SpotifyPlaylist
    const rawTracks = isRecord(entry) && isRecord(entry.tracks) ? entry.tracks : {}
    const rawItems = Array.isArray(rawTracks.items) ? rawTracks.items : []
    const items = liftPlaylistItems(rawItems)

    return {
      ...playlist,
      tracks: {
        total: typeof rawTracks.total === 'number' ? rawTracks.total : items.length,
        items
      }
    }
  })

  const savedTracks = data.savedTracks as BackupData['savedTracks']
  const savedAlbums = Array.isArray(data.savedAlbums) ? data.savedAlbums as BackupData['savedAlbums'] : undefined
  const followedArtists = Array.isArray(data.followedArtists) ? data.followedArtists as BackupData['followedArtists'] : undefined
  const metadata = isRecord(data.metadata) ? data.metadata : {}

  return {
    version: BACKUP_FORMAT_VERSION,
    exportDate: typeof data.exportDate === 'string' ? data.exportDate : new Date().toISOString(),
    user: data.user as unknown as BackupData['user'],
    playlists,
    savedTracks,
    savedAlbums,
    followedArtists,
    metadata: {
      totalPlaylists: playlists.length,
      totalTracks: countPlaylistItems(playlists),
      totalSavedTracks: savedTracks.length,
      totalSavedAlbums: savedAlbums?.length,
      totalFollowedArtists: followedArtists?.length,
      errors: Array.isArray(metadata.errors) ? metadata.errors as string[] : undefined
    }
  }
}

const matchesVisibility = (playlist: SpotifyPlaylist, filters: BackupFilters): boolean => {
  if (playlist.collaborative) return filters.includeCollaborativePlaylists
  if (playlist.public) return filters.includePublicPlaylists
  return filters.includePrivatePlaylists
}

// Without metadata only the plain content is exported: no cover images, no descriptions
const stripMetadata = (playlist: SpotifyPlaylist): SpotifyPlaylist => ({
  ...playlist,
  description: '',
  images: []
})

/**
 * Applies the selection and the filters of the preview to a backup and recalculates the metadata.
 * The result is what actually gets exported.
 */
export const applyBackupOptions = (backup: BackupData, options: BackupOptions): BackupData => {
  const { filters, selectedPlaylists } = options
  const ownerId = backup.user?.id

  const playlists = backup.playlists
    .filter(playlist => selectedPlaylists.includes(playlist.id))
    .filter(playlist => !filters.onlyOwnPlaylists || playlist.owner?.id === ownerId)
    .filter(playlist => matchesVisibility(playlist, filters))
    .map(playlist => (filters.includeMetadata ? playlist : stripMetadata(playlist)))

  const savedTracks = filters.includeSavedTracks ? backup.savedTracks : []
  const savedAlbums = filters.includeSavedAlbums ? backup.savedAlbums : undefined
  const followedArtists = filters.includeFollowedArtists ? backup.followedArtists : undefined

  return {
    version: BACKUP_FORMAT_VERSION,
    exportDate: backup.exportDate,
    user: backup.user,
    playlists,
    savedTracks,
    savedAlbums,
    followedArtists,
    metadata: {
      totalPlaylists: playlists.length,
      totalTracks: countPlaylistItems(playlists),
      totalSavedTracks: savedTracks.length,
      totalSavedAlbums: savedAlbums?.length,
      totalFollowedArtists: followedArtists?.length,
      errors: backup.metadata?.errors
    }
  }
}
