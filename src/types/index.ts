// Spotify API Types
// GET /me no longer returns email, country, product, explicit_content or followers
// since February 2026 – every field except id/display_name/images is optional.
export interface SpotifyUser {
  id: string
  display_name: string
  images: SpotifyImage[]
  // Stable identifier introduced in February 2026
  account_id?: string
  email?: string
  country?: string
  product?: string
  followers?: {
    total: number
  }
}

export interface SpotifyImage {
  url: string
  height: number
  width: number
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description: string
  public: boolean
  collaborative: boolean
  owner: {
    id: string
    display_name: string
  }
  // tracks.total is the real playlist size reported by Spotify (items.total since Feb 2026);
  // tracks.items is populated after fetching the playlist items separately
  tracks: {
    total: number
    items?: SpotifyPlaylistItem[]
  }
  images: SpotifyImage[]
  external_urls: {
    spotify: string
  }
  uri?: string
  snapshot_id?: string
}

// One entry of GET /playlists/{id}/items (PlaylistTrackObject).
// `item` replaces the deprecated `track` field and can be null for unavailable content.
export interface SpotifyPlaylistItem {
  added_at: string | null
  added_by?: {
    id: string
  } | null
  is_local: boolean
  item: SpotifyTrack | SpotifyEpisode | null
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: SpotifyArtist[]
  album: SpotifyAlbum
  duration_ms: number
  explicit: boolean
  uri: string
  type?: 'track'
  added_at?: string
  external_urls: {
    spotify: string
  }
  // External identifiers of the recording. `isrc` is the provider independent
  // recording id. Optional because it is absent for local files and because a file may
  // simply not carry it. It is a documented part of the backup format only since 2.2,
  // but older files usually hold it too: it was never filtered out of the API response.
  external_ids?: {
    isrc?: string
  }
  // Deprecated by Spotify since Nov 2024, kept optional for old backups
  preview_url?: string | null
}

// Minimal episode shape: episodes have neither artists nor album
export interface SpotifyEpisode {
  type: 'episode'
  id: string
  name: string
  uri: string
  duration_ms?: number
  external_urls?: {
    spotify: string
  }
}

export interface SpotifyArtist {
  id: string
  name: string
  external_urls: {
    spotify: string
  }
  uri?: string
  genres?: string[]
  images?: SpotifyImage[]
}

export interface SpotifyAlbum {
  id: string
  name: string
  artists: SpotifyArtist[]
  images: SpotifyImage[]
  release_date: string
  external_urls: {
    spotify: string
  }
  uri?: string
  total_tracks?: number
  // External identifiers of the release. `upc` is the album side counterpart of the
  // track ISRC; simplified album objects (e.g. `track.album`) do not carry it.
  // Optional for the same reasons as SpotifyTrack.external_ids.
  external_ids?: {
    upc?: string
  }
}

export interface SpotifySavedTrack {
  added_at: string
  track: SpotifyTrack
}

export interface SpotifySavedAlbum {
  added_at: string
  album: SpotifyAlbum
}

// Backup Data Types
export interface BackupMetadata {
  totalPlaylists: number
  totalTracks: number
  totalSavedTracks: number
  totalSavedAlbums?: number
  totalFollowedArtists?: number
  errors?: string[]
}

export interface BackupData {
  version: string
  exportDate: string
  user: SpotifyUser
  playlists: SpotifyPlaylist[]
  savedTracks: SpotifySavedTrack[]
  savedAlbums?: SpotifySavedAlbum[]
  followedArtists?: SpotifyArtist[]
  metadata: BackupMetadata
}

export interface BackupFilters {
  onlyOwnPlaylists: boolean
  includePublicPlaylists: boolean
  includePrivatePlaylists: boolean
  includeCollaborativePlaylists: boolean
  includeSavedTracks: boolean
  includeSavedAlbums: boolean
  includeFollowedArtists: boolean
  includeMetadata: boolean
}

export type ExportFormat = 'json' | 'csv' | 'm3u'

export interface BackupOptions {
  selectedPlaylists: string[]
  filters: BackupFilters
  exportFormat: ExportFormat
}

// App State Types
export interface AppState {
  error: string | null
}

export interface AuthState {
  isAuthenticated: boolean
  user: SpotifyUser | null
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
}

/**
 * Outcome of the last backup run. Kept in the store so an incomplete backup
 * stays visible after the toast is gone.
 */
export interface BackupRunResult {
  finishedAt: string
  loadedPlaylists: number
  failedPlaylistNames: string[]
  errors: string[]
}

export interface BackupState {
  isBackingUp: boolean
  backupProgress: number
  currentOperation: string
  backupData: BackupData | null
  lastBackupDate: string | null
  lastRunResult: BackupRunResult | null
}

// Import (restore) Types
export type PlaylistVisibility = 'original' | 'private'

/** skip: keep an existing playlist of the same name, rename: append a date, create: always create */
export type DuplicateStrategy = 'skip' | 'rename' | 'create'

export interface ImportOptions {
  selectedPlaylists: string[]
  includeSavedTracks: boolean
  includeSavedAlbums: boolean
  includeFollowedArtists: boolean
  playlistVisibility: PlaylistVisibility
  duplicateStrategy: DuplicateStrategy
}

export interface ImportResult {
  /** True when the run was stopped by the user before it finished */
  cancelled: boolean
  playlistsCreated: number
  playlistsSkipped: number
  tracksAdded: number
  tracksSkipped: number
  savedTracksAdded: number
  savedAlbumsAdded: number
  artistsFollowed: number
  errors: string[]
}

export interface ImportState {
  isImporting: boolean
  progress: number
  currentOperation: string
  results: ImportResult | null
  cancelRequested: boolean
}

// UI Types
export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  duration?: number
}
