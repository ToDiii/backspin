import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BackupState, BackupData, BackupOptions, BackupRunResult, SpotifyPlaylist } from '@/types'
import { useAuthStore } from './auth'
import { useAppStore } from './app'
import {
  SpotifyApiError,
  getFollowedArtists,
  getMe,
  getMyPlaylists,
  getPlaylistItems,
  getSavedAlbums,
  getSavedTracks
} from '@/services/spotify'
import {
  BACKUP_FORMAT_VERSION,
  applyBackupOptions,
  countPlaylistItems,
  defaultBackupFilters
} from '@/services/backup-format'
import {
  backupFileName,
  buildCsv,
  buildCsvZip,
  buildJson,
  buildM3uZip,
  hasExtraCsvSections
} from '@/services/export'
import { downloadBlob } from '@/services/download'

const errorMessage = (error: unknown): string => {
  if (error instanceof SpotifyApiError) return `${error.message} (HTTP ${error.status})`
  if (error instanceof Error) return error.message
  return 'Unbekannter Fehler'
}

export const useBackupStore = defineStore('backup', () => {
  // State
  const state = ref<BackupState>({
    isBackingUp: false,
    backupProgress: 0,
    currentOperation: '',
    backupData: null,
    lastBackupDate: null,
    lastRunResult: null
  })

  // Backup options for preview
  const backupOptions = ref<BackupOptions>({
    selectedPlaylists: [],
    filters: defaultBackupFilters(),
    exportFormat: 'json'
  })

  const authStore = useAuthStore()
  const appStore = useAppStore()

  // Getters
  const isBackingUp = computed(() => state.value.isBackingUp)
  const backupProgress = computed(() => state.value.backupProgress)
  const currentOperation = computed(() => state.value.currentOperation)
  const backupData = computed(() => state.value.backupData)
  const lastBackupDate = computed(() => state.value.lastBackupDate)
  const lastRunResult = computed(() => state.value.lastRunResult)

  // Actions
  const setBackingUp = (backingUp: boolean) => {
    state.value.isBackingUp = backingUp
  }

  const setBackupProgress = (progress: number) => {
    state.value.backupProgress = progress
  }

  const setCurrentOperation = (operation: string) => {
    state.value.currentOperation = operation
  }

  const setBackupData = (data: BackupData | null) => {
    state.value.backupData = data
  }

  const setLastBackupDate = (date: string | null) => {
    state.value.lastBackupDate = date
  }

  const setLastRunResult = (result: BackupRunResult | null) => {
    state.value.lastRunResult = result
  }

  // Main backup function. All HTTP work lives in @/services/spotify.
  const createBackup = async (): Promise<BackupData> => {
    if (!authStore.isAuthenticated) {
      throw new Error('Du bist nicht bei Spotify angemeldet.')
    }

    const filters = backupOptions.value.filters
    const errors: string[] = []
    const failedPlaylistNames: string[] = []

    setBackingUp(true)
    setBackupProgress(0)
    // A new run invalidates the result of the previous one
    setLastRunResult(null)
    setCurrentOperation('Lade Benutzerprofil...')

    try {
      const user = await getMe()
      setBackupProgress(5)

      setCurrentOperation('Lade Playlists...')
      const playlists = await getMyPlaylists((loaded, total) => {
        setCurrentOperation(`Lade Playlists (${loaded}/${total})...`)
      })
      setBackupProgress(15)

      // Playlist items: a failing playlist must not silently end up empty in the backup
      const playlistsWithItems: SpotifyPlaylist[] = []
      for (let i = 0; i < playlists.length; i++) {
        const playlist = playlists[i]
        setCurrentOperation(`Lade Tracks für "${playlist.name}"...`)

        try {
          const items = await getPlaylistItems(playlist.id)
          playlistsWithItems.push({ ...playlist, tracks: { total: playlist.tracks.total, items } })
        } catch (error) {
          failedPlaylistNames.push(playlist.name)
          errors.push(`Playlist "${playlist.name}": ${errorMessage(error)}`)
          playlistsWithItems.push({ ...playlist, tracks: { total: playlist.tracks.total, items: [] } })
        }

        setBackupProgress(15 + ((i + 1) / Math.max(playlists.length, 1)) * 55)
      }
      setBackupProgress(70)

      let savedTracks: BackupData['savedTracks'] = []
      if (filters.includeSavedTracks) {
        setCurrentOperation('Lade gespeicherte Songs...')
        try {
          savedTracks = await getSavedTracks((loaded, total) => {
            setCurrentOperation(`Lade gespeicherte Songs (${loaded}/${total})...`)
          })
        } catch (error) {
          errors.push(`Gespeicherte Songs: ${errorMessage(error)}`)
        }
      }
      setBackupProgress(85)

      let savedAlbums: BackupData['savedAlbums']
      if (filters.includeSavedAlbums) {
        setCurrentOperation('Lade gespeicherte Alben...')
        try {
          savedAlbums = await getSavedAlbums()
        } catch (error) {
          errors.push(`Gespeicherte Alben: ${errorMessage(error)}`)
        }
      }
      setBackupProgress(93)

      let followedArtists: BackupData['followedArtists']
      if (filters.includeFollowedArtists) {
        setCurrentOperation('Lade gefolgte Künstler...')
        try {
          followedArtists = await getFollowedArtists()
        } catch (error) {
          errors.push(`Gefolgte Künstler: ${errorMessage(error)}`)
        }
      }

      const data: BackupData = {
        version: BACKUP_FORMAT_VERSION,
        exportDate: new Date().toISOString(),
        user,
        playlists: playlistsWithItems,
        savedTracks,
        savedAlbums,
        followedArtists,
        metadata: {
          totalPlaylists: playlistsWithItems.length,
          totalTracks: countPlaylistItems(playlistsWithItems),
          totalSavedTracks: savedTracks.length,
          totalSavedAlbums: savedAlbums?.length,
          totalFollowedArtists: followedArtists?.length,
          errors: errors.length > 0 ? errors : undefined
        }
      }

      const finishedAt = new Date().toISOString()

      setBackupData(data)
      setLastBackupDate(finishedAt)
      setBackupProgress(100)
      setCurrentOperation('Backup abgeschlossen!')

      // The result outlives the toasts: BackupView renders it as a permanent card
      setLastRunResult({
        finishedAt,
        loadedPlaylists: playlistsWithItems.length - failedPlaylistNames.length,
        failedPlaylistNames,
        errors
      })

      // Success and warning must not contradict each other: with errors only the warning
      if (failedPlaylistNames.length > 0) {
        appStore.showWarning(
          'Backup unvollständig',
          `${failedPlaylistNames.length} Playlist(s) konnten nicht geladen werden. Die Übersicht auf dieser Seite nennt die Namen.`
        )
      } else if (errors.length > 0) {
        appStore.showWarning(
          'Backup unvollständig',
          `${errors.length} Bereich(e) konnten nicht geladen werden. Die Übersicht auf dieser Seite nennt die Details.`
        )
      } else {
        appStore.showSuccess(
          'Backup erfolgreich',
          `${data.metadata.totalPlaylists} Playlists, ${data.metadata.totalTracks} Playlist-Tracks und ${data.metadata.totalSavedTracks} gespeicherte Songs wurden gesichert.`
        )
      }

      return data
    } catch (error) {
      const message = errorMessage(error)
      appStore.showError('Backup fehlgeschlagen', message)
      throw error
    } finally {
      setBackingUp(false)
    }
  }

  const downloadBackup = (data: BackupData) => {
    try {
      const blob = new Blob([buildJson(data)], { type: 'application/json' })
      downloadBlob(blob, backupFileName('json'))
      appStore.showSuccess('Download gestartet', 'Dein Backup wird heruntergeladen.')
    } catch (error) {
      appStore.showError('Download fehlgeschlagen', errorMessage(error))
    }
  }

  // Tracks only: a single CSV. With albums or artists: a ZIP with tracks/albums/artists.csv
  const downloadBackupAsCSV = async (data: BackupData) => {
    try {
      if (hasExtraCsvSections(data)) {
        const blob = await buildCsvZip(data)
        downloadBlob(blob, backupFileName('zip'))
      } else {
        const blob = new Blob([buildCsv(data)], { type: 'text/csv;charset=utf-8;' })
        downloadBlob(blob, backupFileName('csv'))
      }
      appStore.showSuccess('Download gestartet', 'CSV-Backup wird heruntergeladen.')
    } catch (error) {
      appStore.showError('Download fehlgeschlagen', errorMessage(error))
    }
  }

  // One .m3u8 per playlist, packed into a single ZIP instead of many single downloads
  const downloadBackupAsM3U = async (data: BackupData) => {
    try {
      const blob = await buildM3uZip(data)
      downloadBlob(blob, backupFileName('zip'))
      appStore.showSuccess('Download gestartet', 'M3U-Playlists werden als ZIP heruntergeladen.')
    } catch (error) {
      appStore.showError('Download fehlgeschlagen', errorMessage(error))
    }
  }

  const reset = () => {
    state.value = {
      isBackingUp: false,
      backupProgress: 0,
      currentOperation: '',
      backupData: null,
      lastBackupDate: null,
      lastRunResult: null
    }
  }

  const setBackupOptions = (options: BackupOptions) => {
    backupOptions.value = options
  }

  /** Selection and filters of the preview, applied to a backup before it is exported. */
  const buildExportData = (data: BackupData, options: BackupOptions): BackupData =>
    applyBackupOptions(data, options)

  return {
    // State
    state,
    backupOptions,

    // Getters
    isBackingUp,
    backupProgress,
    currentOperation,
    backupData,
    lastBackupDate,
    lastRunResult,

    // Actions
    setBackingUp,
    setBackupProgress,
    setCurrentOperation,
    setBackupData,
    setLastBackupDate,
    setLastRunResult,
    createBackup,
    downloadBackup,
    reset,

    // Export
    setBackupOptions,
    buildExportData,
    downloadBackupAsCSV,
    downloadBackupAsM3U
  }
})
