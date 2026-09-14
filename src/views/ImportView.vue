<template>
  <div class="min-h-screen bg-background">
    <div class="container-custom section-padding">
      <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-12">
          <h1 class="text-3xl sm:text-4xl font-bold text-text mb-4">
            📤 Backup importieren
          </h1>
          <p class="text-xl text-text-secondary">
            Spiele ein Backup zurück in deinen Spotify-Account
          </p>
        </div>

        <!-- Not Authenticated -->
        <div v-if="!isAuthenticated" class="card text-center animate-fade-in">
          <div class="mb-6">
            <div class="w-16 h-16 bg-border-strong rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
                <path d="M17.306 4.422A9.25 9.25 0 1 1 6.694 4.422" />
                <circle cx="12" cy="12" r="5.4" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <path d="M14.357 2.357 18.683 2.456 15.929 6.388Z" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-text mb-2">Nicht angemeldet</h2>
            <p class="text-text-secondary mb-6">
              Melde dich bei Spotify an, um ein Backup zu importieren.
            </p>
          </div>

          <button
            :disabled="isAuthenticating"
            class="btn-spotify text-lg px-8 py-4"
            @click="startAuth"
          >
            <div v-if="isAuthenticating" class="loading-spinner w-5 h-5 mr-2" />
            <svg v-else class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 1 1-.277-1.215c3.809-.871 7.077-.496 9.713 1.115.293.18.386.563.206.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.688-1.652-6.786-2.131-9.965-1.166a.78.78 0 1 1-.452-1.492c3.632-1.102 8.147-.568 11.234 1.329a.78.78 0 0 1 .255 1.072zm.105-2.835C14.692 8.99 9.375 8.807 6.328 9.732a.935.935 0 1 1-.542-1.79c3.498-1.062 9.37-.857 13.07 1.34a.935.935 0 0 1-.942 1.615z" />
            </svg>
            {{ isAuthenticating ? 'Anmeldung läuft...' : 'Bei Spotify anmelden' }}
          </button>
        </div>

        <!-- Authenticated -->
        <div v-else class="space-y-6">
          <!-- User Info -->
          <div class="card animate-fade-in">
            <div class="flex items-center space-x-4">
              <img
                v-if="user?.images && user.images.length > 0"
                :src="user.images[0].url"
                :alt="user.display_name"
                class="w-14 h-14 rounded-full ring-2 ring-brand/40 flex-shrink-0"
              >
              <div v-else class="w-14 h-14 bg-primary-500 rounded-full flex items-center justify-center ring-2 ring-brand/40 flex-shrink-0">
                <span class="text-xl text-on-primary font-bold">{{ user?.display_name?.charAt(0).toUpperCase() }}</span>
              </div>
              <div class="min-w-0">
                <h2 class="text-lg font-semibold text-text">Importieren in: {{ user?.display_name }}</h2>
                <p v-if="user?.email" class="text-sm text-text-secondary">{{ user.email }}</p>
              </div>
            </div>
          </div>

          <!-- Missing scopes -->
          <div v-if="importStore.needsReauth" class="status-error">
            <h3 class="font-semibold text-text mb-2">Berechtigungen fehlen</h3>
            <p class="text-sm text-text-secondary mb-3">
              Diese Sitzung hat keine Schreibrechte für deinen Account.
              Bitte einmal ab- und wieder anmelden, damit die neuen Berechtigungen greifen.
            </p>
            <button class="btn-secondary text-sm" @click="logout">
              Abmelden
            </button>
          </div>

          <!-- Step 1: File -->
          <div v-if="step === 1" class="card">
            <div class="card-header">
              <h2 class="card-title">Schritt 1: Backup-Datei auswählen</h2>
              <p class="card-description">
                Wähle eine Backup-Datei (.json) aus, die du zuvor erstellt hast.
              </p>
            </div>

            <div class="form-group">
              <label for="backupFile" class="form-label">Backup-Datei</label>
              <div
                class="border-2 border-dashed border-border-strong rounded-lg p-8 text-center hover:border-brand transition-colors cursor-pointer"
                @click="fileInput?.click()"
                @dragover.prevent
                @drop.prevent="handleFileDrop"
              >
                <input
                  id="backupFile"
                  ref="fileInput"
                  type="file"
                  accept=".json"
                  class="hidden"
                  @change="handleFileSelect"
                >

                <div v-if="!selectedFile" class="space-y-4">
                  <svg class="w-12 h-12 text-text-secondary mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  <div>
                    <p class="text-text font-medium">Datei hier ablegen oder klicken zum Auswählen</p>
                    <p class="text-text-secondary text-sm">Nur .json Dateien werden akzeptiert</p>
                  </div>
                </div>

                <div v-else class="space-y-4">
                  <div class="loading-spinner w-8 h-8 mx-auto" />
                  <p class="text-text font-medium">{{ selectedFile.name }} wird geprüft...</p>
                </div>
              </div>
            </div>

            <div class="status-info">
              <p class="text-sm text-text-secondary">
                Lokale Dateien aus deinen Playlists lassen sich über die Spotify-API nicht wiederherstellen
                und werden beim Import übersprungen.
              </p>
            </div>
          </div>

          <!-- Step 2: Options -->
          <template v-if="step === 2 && backupPreview">
            <!-- Backup details -->
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">Schritt 2: Backup prüfen</h2>
                <p class="card-description">{{ selectedFile?.name }}</p>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p class="text-sm text-text-secondary">Exportiert von</p>
                  <p class="font-medium text-text truncate">{{ backupPreview.user.display_name }}</p>
                </div>
                <div>
                  <p class="text-sm text-text-secondary">Exportiert am</p>
                  <p class="font-medium text-text">{{ new Date(backupPreview.exportDate).toLocaleDateString('de-DE') }}</p>
                </div>
                <div>
                  <p class="text-sm text-text-secondary">Playlists</p>
                  <p class="font-medium text-text">{{ backupPreview.metadata.totalPlaylists }}</p>
                </div>
                <div>
                  <p class="text-sm text-text-secondary">Format-Version</p>
                  <p class="font-medium text-text">{{ backupPreview.version }}</p>
                </div>
              </div>
            </div>

            <!-- Playlist selection -->
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">Playlist-Auswahl</h2>
                <p class="card-description">
                  {{ selectedPlaylists.length }} von {{ backupPreview.playlists.length }} Playlists ausgewählt
                </p>
              </div>

              <div class="flex gap-3 mb-4">
                <button class="btn-secondary text-sm" @click="selectAllPlaylists">Alle auswählen</button>
                <button class="btn-secondary text-sm" @click="deselectAllPlaylists">Keine auswählen</button>
              </div>

              <div v-if="duplicateCount > 0" class="status-warning mb-4">
                <p class="text-sm text-text-secondary">
                  {{ duplicateCount }} Playlist(s) tragen den Namen einer bereits vorhandenen eigenen Playlist.
                  Wie damit umgegangen wird, legt die Duplikat-Strategie weiter unten fest.
                </p>
              </div>

              <div class="space-y-2 max-h-[24rem] overflow-y-auto pr-1">
                <label
                  v-for="playlist in backupPreview.playlists"
                  :key="playlist.id"
                  class="flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors"
                  :class="selectedPlaylists.includes(playlist.id)
                    ? 'border-brand bg-primary-500/10'
                    : 'border-border hover:border-brand/50'"
                >
                  <input
                    v-model="selectedPlaylists"
                    type="checkbox"
                    class="form-checkbox mt-1"
                    :value="playlist.id"
                  >
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-text truncate">
                      {{ playlist.name }}
                      <span
                        v-if="isDuplicate(playlist.name)"
                        class="ml-2 text-xs bg-warning-surface text-warning px-1.5 py-0.5 rounded-full"
                      >bereits vorhanden</span>
                    </p>
                    <p class="text-xs text-text-secondary mt-0.5">
                      {{ importableCount(playlist) }} importierbare Titel ·
                      {{ playlist.public ? 'Öffentlich' : 'Privat' }}
                      <span v-if="playlist.collaborative"> · Kollaborativ</span>
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <!-- Content options -->
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">Weitere Inhalte</h2>
                <p class="card-description">Was zusätzlich in deine Bibliothek zurückgespielt wird</p>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label
                  class="flex items-start gap-3 p-3 border rounded-xl transition-colors"
                  :class="[
                    options.includeSavedTracks ? 'border-brand bg-primary-500/10' : 'border-border',
                    savedTracksCount > 0 ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  ]"
                >
                  <input
                    v-model="options.includeSavedTracks"
                    type="checkbox"
                    class="form-checkbox mt-0.5"
                    :disabled="savedTracksCount === 0"
                  >
                  <div>
                    <p class="text-sm font-medium text-text">Gespeicherte Songs</p>
                    <p class="text-xs text-text-secondary mt-0.5">{{ savedTracksCount }} im Backup</p>
                  </div>
                </label>

                <label
                  class="flex items-start gap-3 p-3 border rounded-xl transition-colors"
                  :class="[
                    options.includeSavedAlbums ? 'border-brand bg-primary-500/10' : 'border-border',
                    savedAlbumsCount > 0 ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  ]"
                >
                  <input
                    v-model="options.includeSavedAlbums"
                    type="checkbox"
                    class="form-checkbox mt-0.5"
                    :disabled="savedAlbumsCount === 0"
                  >
                  <div>
                    <p class="text-sm font-medium text-text">Gespeicherte Alben</p>
                    <p class="text-xs text-text-secondary mt-0.5">{{ savedAlbumsCount }} im Backup</p>
                  </div>
                </label>

                <label
                  class="flex items-start gap-3 p-3 border rounded-xl transition-colors"
                  :class="[
                    options.includeFollowedArtists ? 'border-brand bg-primary-500/10' : 'border-border',
                    followedArtistsCount > 0 ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  ]"
                >
                  <input
                    v-model="options.includeFollowedArtists"
                    type="checkbox"
                    class="form-checkbox mt-0.5"
                    :disabled="followedArtistsCount === 0"
                  >
                  <div>
                    <p class="text-sm font-medium text-text">Gefolgte Künstler</p>
                    <p class="text-xs text-text-secondary mt-0.5">{{ followedArtistsCount }} im Backup</p>
                  </div>
                </label>
              </div>
            </div>

            <!-- Visibility and duplicates -->
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">Sichtbarkeit &amp; Duplikate</h2>
                <p class="card-description">So werden die Playlists angelegt</p>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p class="form-label">Sichtbarkeit</p>
                  <div class="space-y-2">
                    <label
                      v-for="visibility in visibilityOptions"
                      :key="visibility.value"
                      class="flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors"
                      :class="options.playlistVisibility === visibility.value
                        ? 'border-brand bg-primary-500/10'
                        : 'border-border hover:border-brand/50'"
                    >
                      <input
                        v-model="options.playlistVisibility"
                        :value="visibility.value"
                        type="radio"
                        class="form-radio mt-0.5"
                      >
                      <div>
                        <p class="text-sm font-medium text-text">{{ visibility.label }}</p>
                        <p class="text-xs text-text-secondary mt-0.5">{{ visibility.hint }}</p>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <p class="form-label">Bei gleichnamiger Playlist</p>
                  <div class="space-y-2">
                    <label
                      v-for="strategy in duplicateOptions"
                      :key="strategy.value"
                      class="flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors"
                      :class="options.duplicateStrategy === strategy.value
                        ? 'border-brand bg-primary-500/10'
                        : 'border-border hover:border-brand/50'"
                    >
                      <input
                        v-model="options.duplicateStrategy"
                        :value="strategy.value"
                        type="radio"
                        class="form-radio mt-0.5"
                      >
                      <div>
                        <p class="text-sm font-medium text-text">{{ strategy.label }}</p>
                        <p class="text-xs text-text-secondary mt-0.5">{{ strategy.hint }}</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex justify-between items-center">
              <button class="btn-ghost" @click="resetFile">← Andere Datei</button>
              <button
                :disabled="!hasSomethingToImport"
                class="btn-primary px-6"
                data-testid="start-import"
                @click="startImport"
              >
                Import starten
              </button>
            </div>
          </template>

          <!-- Step 3: Progress -->
          <div v-if="step === 3" class="card">
            <div class="card-header">
              <h2 class="card-title">Schritt 3: Import läuft</h2>
              <p class="card-description">Bitte lass diesen Tab geöffnet, bis der Import fertig ist.</p>
            </div>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-text">{{ importStore.currentOperation }}</span>
                <span class="text-sm text-text-secondary">{{ Math.round(importStore.progress) }}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: `${importStore.progress}%` }" />
              </div>

              <div class="flex justify-end">
                <button
                  :disabled="importStore.cancelRequested"
                  class="btn-secondary text-sm"
                  @click="importStore.cancel()"
                >
                  {{ importStore.cancelRequested ? 'Wird abgebrochen...' : 'Abbrechen' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Step 4: Result -->
          <div v-if="step === 4 && importStore.results" class="card" data-testid="import-result">
            <div class="card-header">
              <h2 class="card-title">Schritt 4: Ergebnis</h2>
              <p class="card-description">{{ importStore.currentOperation }}</p>
            </div>

            <div class="mb-6" :class="resultBannerClass" data-testid="result-banner">
              <p class="text-sm text-text-secondary">{{ importStore.resultSummary }}</p>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div class="text-center">
                <p class="text-2xl font-bold text-success" data-testid="playlists-created">{{ importStore.results.playlistsCreated }}</p>
                <p class="text-xs text-text-secondary mt-1">Playlists erstellt</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-success" data-testid="tracks-added">{{ importStore.results.tracksAdded }}</p>
                <p class="text-xs text-text-secondary mt-1">Titel hinzugefügt</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-success" data-testid="saved-tracks-added">{{ importStore.results.savedTracksAdded }}</p>
                <p class="text-xs text-text-secondary mt-1">Songs gespeichert</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-warning" data-testid="tracks-skipped">{{ importStore.results.tracksSkipped }}</p>
                <p class="text-xs text-text-secondary mt-1">Titel übersprungen</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-text" data-testid="playlists-skipped">{{ importStore.results.playlistsSkipped }}</p>
                <p class="text-xs text-text-secondary mt-1">Playlists übersprungen</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-text" data-testid="albums-added">{{ importStore.results.savedAlbumsAdded }}</p>
                <p class="text-xs text-text-secondary mt-1">Alben gespeichert</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-text" data-testid="artists-followed">{{ importStore.results.artistsFollowed }}</p>
                <p class="text-xs text-text-secondary mt-1">Künstlern gefolgt</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-text">{{ importStore.results.errors.length }}</p>
                <p class="text-xs text-text-secondary mt-1">Hinweise</p>
              </div>
            </div>

            <div v-if="importStore.results.errors.length > 0" class="status-warning mb-6">
              <button
                class="flex items-center justify-between w-full text-left"
                @click="showErrors = !showErrors"
              >
                <span class="font-semibold text-text">
                  Hinweise &amp; Fehler ({{ importStore.results.errors.length }})
                </span>
                <svg
                  class="w-4 h-4 text-text-secondary transition-transform duration-200"
                  :class="{ 'rotate-180': showErrors }"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <ul v-if="showErrors" class="mt-3 space-y-1 text-sm text-text-secondary">
                <li v-for="(message, index) in importStore.results.errors" :key="index">• {{ message }}</li>
              </ul>
            </div>

            <div class="flex justify-between items-center">
              <button class="btn-ghost" @click="resetFile">Weiteres Backup importieren</button>
              <router-link to="/backup" class="btn-primary">Zurück zum Backup</router-link>
            </div>
          </div>

          <!-- Navigation -->
          <div class="flex justify-between">
            <router-link to="/backup" class="btn-ghost">← Zurück</router-link>
            <button class="btn-ghost" @click="logout">Abmelden</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSpotifyAuth } from '@/composables/useSpotifyAuth'
import { useAppStore } from '@/stores/app'
import { useImportStore, defaultImportOptions } from '@/stores/import'
import { normalizeBackup } from '@/services/backup-format'
import { validateBackupFile } from '@/services/validate-backup'
import type { BackupData, DuplicateStrategy, ImportOptions, PlaylistVisibility, SpotifyPlaylist } from '@/types'

const { isAuthenticated, user, isAuthenticating, startAuth, logout } = useSpotifyAuth()
const appStore = useAppStore()
const importStore = useImportStore()

// The store outlives the route change: entering the view again must not show the
// result of the previous run. A running import keeps its progress view.
if (!importStore.isImporting) importStore.reset()

// State
const selectedFile = ref<File | null>(null)
const backupPreview = ref<BackupData | null>(null)
const selectedPlaylists = ref<string[]>([])
const options = ref<ImportOptions>(defaultImportOptions())
const showErrors = ref(false)
const fileInput = ref<HTMLInputElement>()

const visibilityOptions: { value: PlaylistVisibility; label: string; hint: string }[] = [
  { value: 'original', label: 'Wie im Backup', hint: 'Öffentliche Playlists bleiben öffentlich' },
  { value: 'private', label: 'Alle privat', hint: 'Jede Playlist wird privat angelegt' }
]

const duplicateOptions: { value: DuplicateStrategy; label: string; hint: string }[] = [
  { value: 'skip', label: 'Überspringen', hint: 'Vorhandene Playlist bleibt unverändert' },
  { value: 'rename', label: 'Umbenennen', hint: 'Wird als "Name (Import JJJJ-MM-TT)" angelegt' },
  { value: 'create', label: 'Trotzdem anlegen', hint: 'Legt eine zweite Playlist gleichen Namens an' }
]

// Computed
const step = computed(() => {
  if (importStore.isImporting) return 3
  if (importStore.results) return 4
  if (backupPreview.value) return 2
  return 1
})

const savedTracksCount = computed(() => backupPreview.value?.savedTracks?.length ?? 0)
const savedAlbumsCount = computed(() => backupPreview.value?.savedAlbums?.length ?? 0)
const followedArtistsCount = computed(() => backupPreview.value?.followedArtists?.length ?? 0)

const existingNames = computed(
  () => new Set(importStore.existingPlaylistNames.map(name => name.trim().toLowerCase()))
)

const isDuplicate = (name: string): boolean => existingNames.value.has(name.trim().toLowerCase())

const duplicateCount = computed(
  () => (backupPreview.value?.playlists ?? []).filter(playlist => isDuplicate(playlist.name)).length
)

const hasHints = computed(() => (importStore.results?.errors.length ?? 0) > 0)

// An abort and a run that changed nothing each get their own wording instead of a
// green success. The text itself comes from the store, so it matches the toast.
const resultBannerClass = computed(() => {
  if (importStore.wasCancelled || hasHints.value) return 'status-warning'
  return importStore.nothingToDo ? 'status-info' : 'status-success'
})

const hasSomethingToImport = computed(() =>
  selectedPlaylists.value.length > 0 ||
  (options.value.includeSavedTracks && savedTracksCount.value > 0) ||
  (options.value.includeSavedAlbums && savedAlbumsCount.value > 0) ||
  (options.value.includeFollowedArtists && followedArtistsCount.value > 0)
)

// Local files and no longer available items cannot be restored
const importableCount = (playlist: SpotifyPlaylist): number =>
  (playlist.tracks?.items ?? []).filter(entry => entry.item && !entry.is_local).length

// Methods
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    void processFile(target.files[0])
  }
}

const handleFileDrop = (event: DragEvent) => {
  if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
    void processFile(event.dataTransfer.files[0])
  }
}

const processFile = async (file: File) => {
  selectedFile.value = file
  importStore.reset()

  try {
    // validateBackupFile guards the untrusted file (size, extension, JSON, structure),
    // normalizeBackup then lifts old 2.0 and 2.1 backups to the current shape
    const validated = await validateBackupFile(file)
    const backup = normalizeBackup(validated)
    backupPreview.value = backup

    selectedPlaylists.value = backup.playlists.map(playlist => playlist.id)
    options.value = {
      ...defaultImportOptions(),
      includeSavedTracks: backup.savedTracks.length > 0,
      includeSavedAlbums: (backup.savedAlbums?.length ?? 0) > 0,
      includeFollowedArtists: (backup.followedArtists?.length ?? 0) > 0
    }

    appStore.showSuccess('Datei geladen', 'Backup-Datei wurde erfolgreich geladen.')

    // Own playlists of the target account, needed for the duplicate hint
    try {
      await importStore.loadExistingPlaylists()
    } catch {
      // A failed lookup only costs the hint, the import itself checks again
    }
  } catch (error) {
    // BackupValidationError and the errors of normalizeBackup both carry German messages
    const message = error instanceof Error ? error.message : 'Die Backup-Datei konnte nicht gelesen werden.'
    appStore.showError('Datei-Fehler', message)
    selectedFile.value = null
    backupPreview.value = null
  }
}

const selectAllPlaylists = () => {
  selectedPlaylists.value = (backupPreview.value?.playlists ?? []).map(playlist => playlist.id)
}

const deselectAllPlaylists = () => {
  selectedPlaylists.value = []
}

const resetFile = () => {
  selectedFile.value = null
  backupPreview.value = null
  selectedPlaylists.value = []
  showErrors.value = false
  options.value = defaultImportOptions()
  importStore.reset()
  if (fileInput.value) fileInput.value.value = ''
}

const startImport = async () => {
  if (!backupPreview.value) return

  importStore.setImportOptions({
    ...options.value,
    selectedPlaylists: selectedPlaylists.value
  })

  try {
    await importStore.runImport(backupPreview.value)
  } catch {
    // Toast and error list are handled inside the store
  }
}
</script>
