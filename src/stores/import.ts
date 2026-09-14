import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  BackupData,
  ImportOptions,
  ImportResult,
  ImportState,
  SpotifyEpisode,
  SpotifyPlaylist,
  SpotifyTrack
} from '@/types'
import { useAuthStore } from './auth'
import { useAppStore } from './app'
import {
  SpotifyApiError,
  addItemsToPlaylist,
  createPlaylist,
  followArtists,
  getMyPlaylists,
  libraryContains,
  saveToLibrary
} from '@/services/spotify'

const emptyResult = (): ImportResult => ({
  cancelled: false,
  playlistsCreated: 0,
  playlistsSkipped: 0,
  tracksAdded: 0,
  tracksSkipped: 0,
  savedTracksAdded: 0,
  savedAlbumsAdded: 0,
  artistsFollowed: 0,
  errors: []
})

/** Message for a run that found everything already in place. */
export const NOTHING_TO_DO_MESSAGE = 'Es gab nichts zu tun – alle Inhalte waren bereits vorhanden.'

/** Everything that was actually written during a run. */
const countActions = (result: ImportResult): number =>
  result.playlistsCreated +
  result.tracksAdded +
  result.savedTracksAdded +
  result.savedAlbumsAdded +
  result.artistsFollowed

/**
 * Lists what was written. Only categories with a value are named so the sentence
 * stays readable; without any value it reports that nothing was left to do.
 */
const buildSummary = (result: ImportResult): string => {
  const parts: string[] = []
  if (result.playlistsCreated > 0) parts.push(`${result.playlistsCreated} Playlist(s)`)
  if (result.tracksAdded > 0) parts.push(`${result.tracksAdded} Titel`)
  if (result.savedTracksAdded > 0) parts.push(`${result.savedTracksAdded} gespeicherte Songs`)
  if (result.savedAlbumsAdded > 0) parts.push(`${result.savedAlbumsAdded} gespeicherte Alben`)
  if (result.artistsFollowed > 0) parts.push(`${result.artistsFollowed} gefolgte Künstler`)
  if (parts.length === 0) return NOTHING_TO_DO_MESSAGE
  return `${parts.join(', ')}.`
}

/**
 * The one message for a finished run: toast and result view share it, so they can
 * never contradict each other. An abort and a run that failed everywhere both have
 * to stay apart from "everything was already there".
 */
const resultMessage = (result: ImportResult): string => {
  const didSomething = countActions(result) > 0
  if (result.cancelled) {
    return didSomething
      ? `Bis zum Abbruch übertragen: ${buildSummary(result)}`
      : 'Bis zum Abbruch wurde nichts übertragen.'
  }
  if (!didSomething && result.errors.length > 0) return 'Es wurde nichts übertragen.'
  return buildSummary(result)
}

export const defaultImportOptions = (): ImportOptions => ({
  selectedPlaylists: [],
  includeSavedTracks: true,
  includeSavedAlbums: true,
  includeFollowedArtists: true,
  playlistVisibility: 'original',
  duplicateStrategy: 'skip'
})

const errorMessage = (error: unknown): string => {
  if (error instanceof SpotifyApiError) return `${error.message} (HTTP ${error.status})`
  if (error instanceof Error) return error.message
  return 'Unbekannter Fehler'
}

/**
 * A token without the modify scopes answers 403 with `insufficient_scope`.
 * The scopes of an existing token cannot be queried, so this is the runtime fallback
 * for sessions that were created before the restore scopes existed.
 */
const isInsufficientScope = (error: unknown): boolean =>
  error instanceof SpotifyApiError &&
  error.status === 403 &&
  /insufficient|scope/i.test(error.message)

const SCOPE_HINT = 'Bitte einmal ab- und wieder anmelden, damit die neuen Berechtigungen greifen.'

/** Backups of format 2.0 may lack `uri`; it is rebuilt from the id where possible. */
const itemUri = (item: SpotifyTrack | SpotifyEpisode): string | null => {
  if (typeof item.uri === 'string' && item.uri.length > 0) return item.uri
  if (typeof item.id !== 'string' || item.id.length === 0) return null
  return item.type === 'episode' ? `spotify:episode:${item.id}` : `spotify:track:${item.id}`
}

const normalizeName = (name: string): string => name.trim().toLowerCase()

const importSuffix = (): string => `(Import ${new Date().toISOString().slice(0, 10)})`

interface PlaylistPlan {
  playlist: SpotifyPlaylist
  uris: string[]
  skippedLocal: number
  skippedUnavailable: number
}

/**
 * Collects the URIs of a playlist for the restore.
 * Local files (`is_local`, `spotify:local:`) cannot be added through the API and
 * entries without content (`item === null`) no longer exist – both are counted.
 */
const planPlaylist = (playlist: SpotifyPlaylist): PlaylistPlan => {
  const plan: PlaylistPlan = { playlist, uris: [], skippedLocal: 0, skippedUnavailable: 0 }

  for (const entry of playlist.tracks?.items ?? []) {
    if (entry.is_local) {
      plan.skippedLocal += 1
      continue
    }
    if (!entry.item) {
      plan.skippedUnavailable += 1
      continue
    }

    const uri = itemUri(entry.item)
    if (!uri) {
      plan.skippedUnavailable += 1
      continue
    }
    if (uri.startsWith('spotify:local:')) {
      plan.skippedLocal += 1
      continue
    }

    plan.uris.push(uri)
  }

  return plan
}

export const useImportStore = defineStore('import', () => {
  // State
  const state = ref<ImportState>({
    isImporting: false,
    progress: 0,
    currentOperation: '',
    results: null,
    cancelRequested: false
  })

  const importOptions = ref<ImportOptions>(defaultImportOptions())

  // Names of the user's own playlists, used for the duplicate strategy
  const existingPlaylistNames = ref<string[]>([])
  const existingPlaylistsLoaded = ref(false)

  // Set when the session is missing the modify scopes: the view offers a re-login
  const needsReauth = ref(false)

  const authStore = useAuthStore()
  const appStore = useAppStore()

  // Getters
  const isImporting = computed(() => state.value.isImporting)
  const progress = computed(() => state.value.progress)
  const currentOperation = computed(() => state.value.currentOperation)
  const results = computed(() => state.value.results)
  const cancelRequested = computed(() => state.value.cancelRequested)

  /** Message of the last run, empty while no result exists. */
  const resultSummary = computed(() => (state.value.results ? resultMessage(state.value.results) : ''))

  /** True once a finished run was stopped by the user. */
  const wasCancelled = computed(() => state.value.results?.cancelled === true)

  /**
   * A finished run that neither created nor added anything because everything was
   * already there. An aborted run does not count: it never got that far.
   */
  const nothingToDo = computed(
    () =>
      state.value.results !== null &&
      !state.value.isImporting &&
      !state.value.results.cancelled &&
      countActions(state.value.results) === 0
  )

  // Actions
  const setOperation = (operation: string) => {
    state.value.currentOperation = operation
  }

  const setProgress = (value: number) => {
    state.value.progress = Math.min(100, Math.max(0, value))
  }

  const setImportOptions = (options: ImportOptions) => {
    importOptions.value = options
  }

  const cancel = () => {
    if (!state.value.isImporting) return
    state.value.cancelRequested = true
    setOperation('Import wird abgebrochen...')
  }

  const reset = () => {
    state.value = {
      isImporting: false,
      progress: 0,
      currentOperation: '',
      results: null,
      cancelRequested: false
    }
    needsReauth.value = false
    importOptions.value = defaultImportOptions()
    // The cached names would be stale after a run that created playlists
    existingPlaylistNames.value = []
    existingPlaylistsLoaded.value = false
  }

  /** Loads the names of the user's own playlists so duplicates can be detected. */
  const loadExistingPlaylists = async (force = false): Promise<string[]> => {
    if (existingPlaylistsLoaded.value && !force) return existingPlaylistNames.value

    const playlists = await getMyPlaylists()
    const ownerId = authStore.user?.id
    existingPlaylistNames.value = playlists
      .filter(playlist => !ownerId || playlist.owner?.id === ownerId)
      .map(playlist => playlist.name)
    existingPlaylistsLoaded.value = true
    return existingPlaylistNames.value
  }

  const runImport = async (backup: BackupData): Promise<ImportResult> => {
    if (!authStore.isAuthenticated) {
      throw new Error('Du bist nicht bei Spotify angemeldet.')
    }
    if (!authStore.hasImportScopes) {
      needsReauth.value = true
      appStore.showError('Berechtigungen fehlen', SCOPE_HINT)
      throw new Error(SCOPE_HINT)
    }

    const options = importOptions.value
    const result = emptyResult()

    state.value.isImporting = true
    state.value.cancelRequested = false
    state.value.results = result
    needsReauth.value = false
    setProgress(0)
    setOperation('Import wird vorbereitet...')

    const stopped = () => state.value.cancelRequested

    try {
      // Duplicate detection works on the user's own playlists only
      setOperation('Vorhandene Playlists werden geprüft...')
      let existing = new Set<string>()
      try {
        const names = await loadExistingPlaylists()
        existing = new Set(names.map(normalizeName))
      } catch (error) {
        if (isInsufficientScope(error)) throw error
        result.errors.push(`Vorhandene Playlists: ${errorMessage(error)}`)
      }

      const plans = backup.playlists
        .filter(playlist => options.selectedPlaylists.includes(playlist.id))
        .map(planPlaylist)

      // Liked songs are restored oldest first, so the library order roughly matches again
      const savedTrackUris = options.includeSavedTracks
        ? [...backup.savedTracks]
          .reverse()
          .map(entry => (entry.track ? itemUri(entry.track) : null))
          .filter((uri): uri is string => Boolean(uri))
        : []

      const savedAlbumUris = options.includeSavedAlbums
        ? (backup.savedAlbums ?? [])
          .map(entry => entry.album?.uri ?? (entry.album?.id ? `spotify:album:${entry.album.id}` : null))
          .filter((uri): uri is string => Boolean(uri))
          .reverse()
        : []

      const artistUris = options.includeFollowedArtists
        ? (backup.followedArtists ?? [])
          .map(artist => artist.uri ?? (artist.id ? `spotify:artist:${artist.id}` : null))
          .filter((uri): uri is string => Boolean(uri))
        : []

      // One step per playlist plus one per batch, so the bar moves with the real work
      const batches = (count: number, size: number) => Math.ceil(count / size)
      const totalSteps = Math.max(
        1,
        plans.reduce((sum, plan) => sum + 1 + batches(plan.uris.length, 100), 0) +
          batches(savedTrackUris.length, 40) * 2 +
          batches(savedAlbumUris.length, 40) * 2 +
          batches(artistUris.length, 40) * 2
      )
      let doneSteps = 0
      const step = (count = 1) => {
        doneSteps += count
        setProgress((doneSteps / totalSteps) * 100)
      }

      // 1. Playlists
      for (const plan of plans) {
        if (stopped()) break

        const playlist = plan.playlist
        result.tracksSkipped += plan.skippedLocal + plan.skippedUnavailable
        if (plan.skippedLocal > 0) {
          result.errors.push(
            `Playlist "${playlist.name}": ${plan.skippedLocal} lokale Datei(en) übersprungen – lokale Dateien lassen sich über die Spotify-API nicht hinzufügen.`
          )
        }
        if (plan.skippedUnavailable > 0) {
          result.errors.push(
            `Playlist "${playlist.name}": ${plan.skippedUnavailable} Titel übersprungen – bei Spotify nicht mehr verfügbar.`
          )
        }

        const alreadyExists = existing.has(normalizeName(playlist.name))
        if (alreadyExists && options.duplicateStrategy === 'skip') {
          result.playlistsSkipped += 1
          step(1 + batches(plan.uris.length, 100))
          continue
        }

        const name = alreadyExists && options.duplicateStrategy === 'rename'
          ? `${playlist.name} ${importSuffix()}`
          : playlist.name

        setOperation(`Playlist "${name}" wird angelegt...`)

        try {
          const isPublic = options.playlistVisibility === 'private' ? false : playlist.public === true
          const created = await createPlaylist({
            name,
            description: playlist.description || undefined,
            public: isPublic,
            collaborative: playlist.collaborative === true
          })
          result.playlistsCreated += 1
          existing.add(normalizeName(name))
          step()

          if (plan.uris.length > 0) {
            setOperation(`Titel werden zu "${name}" hinzugefügt...`)
            const added = await addItemsToPlaylist(created.id, plan.uris, {
              shouldStop: stopped,
              onBatch: processed => {
                step()
                setOperation(`"${name}": ${processed}/${plan.uris.length} Titel hinzugefügt...`)
              }
            })
            result.tracksAdded += added
          }
        } catch (error) {
          if (isInsufficientScope(error)) throw error
          result.errors.push(`Playlist "${playlist.name}": ${errorMessage(error)}`)
        }
      }

      // 2. Liked songs, saved albums and followed artists
      const restoreLibrary = async (
        uris: string[],
        label: string,
        save: (values: string[]) => Promise<number>
      ): Promise<number> => {
        if (uris.length === 0 || stopped()) return 0

        setOperation(`${label}: bereits vorhandene werden geprüft...`)
        let pending = uris
        try {
          const flags = await libraryContains(uris, { shouldStop: stopped, onBatch: () => step() })
          pending = uris.filter((_uri, index) => flags[index] !== true)
        } catch (error) {
          if (isInsufficientScope(error)) throw error
          // Without the check everything is sent; Spotify handles duplicates itself
          result.errors.push(`${label}: Abgleich fehlgeschlagen (${errorMessage(error)}).`)
        }

        if (pending.length === 0 || stopped()) return 0

        setOperation(`${label} werden übertragen...`)
        return await save(pending)
      }

      if (options.includeSavedTracks) {
        try {
          result.savedTracksAdded = await restoreLibrary(savedTrackUris, 'Gespeicherte Songs', uris =>
            saveToLibrary(uris, { shouldStop: stopped, onBatch: () => step() })
          )
        } catch (error) {
          if (isInsufficientScope(error)) throw error
          result.errors.push(`Gespeicherte Songs: ${errorMessage(error)}`)
        }
      }

      if (options.includeSavedAlbums) {
        try {
          result.savedAlbumsAdded = await restoreLibrary(savedAlbumUris, 'Gespeicherte Alben', uris =>
            saveToLibrary(uris, { shouldStop: stopped, onBatch: () => step() })
          )
        } catch (error) {
          if (isInsufficientScope(error)) throw error
          result.errors.push(`Gespeicherte Alben: ${errorMessage(error)}`)
        }
      }

      if (options.includeFollowedArtists) {
        try {
          result.artistsFollowed = await restoreLibrary(artistUris, 'Gefolgte Künstler', uris =>
            followArtists(uris, { shouldStop: stopped, onBatch: () => step() })
          )
        } catch (error) {
          if (isInsufficientScope(error)) throw error
          result.errors.push(`Gefolgte Künstler: ${errorMessage(error)}`)
        }
      }

      setProgress(100)

      // The result carries the abort, the cancel flag itself is cleared right after the run
      result.cancelled = stopped()
      const message = resultMessage(result)

      if (result.cancelled) {
        setOperation('Import abgebrochen')
        appStore.showWarning('Import abgebrochen', message)
      } else if (result.errors.length > 0) {
        setOperation('Import abgeschlossen')
        appStore.showWarning('Import mit Hinweisen abgeschlossen', `${message} ${result.errors.length} Hinweis(e).`)
      } else if (countActions(result) === 0) {
        // Nothing was written: every entry of the backup was already in the account
        setOperation('Nichts zu tun')
        appStore.showInfo('Nichts zu tun', message)
      } else {
        setOperation('Import abgeschlossen')
        appStore.showSuccess('Import erfolgreich', message)
      }

      return result
    } catch (error) {
      if (isInsufficientScope(error)) {
        needsReauth.value = true
        result.errors.push(SCOPE_HINT)
        appStore.showError('Berechtigungen fehlen', SCOPE_HINT)
      } else {
        result.errors.push(errorMessage(error))
        appStore.showError('Import fehlgeschlagen', errorMessage(error))
      }
      setOperation('Import fehlgeschlagen')
      throw error
    } finally {
      state.value.isImporting = false
      state.value.cancelRequested = false
    }
  }

  return {
    // State
    state,
    importOptions,
    existingPlaylistNames,
    needsReauth,

    // Getters
    isImporting,
    progress,
    currentOperation,
    results,
    cancelRequested,
    resultSummary,
    nothingToDo,
    wasCancelled,

    // Actions
    setImportOptions,
    loadExistingPlaylists,
    runImport,
    cancel,
    reset
  }
})
