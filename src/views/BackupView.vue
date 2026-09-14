<template>
  <div class="min-h-screen bg-background">
    <div class="container-custom section-padding">
      <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-12">
          <h1 class="text-3xl sm:text-4xl font-bold text-text mb-4">
            🎵 Backup erstellen
          </h1>
          <p class="text-xl text-text-secondary">
            Sichere alle deine Spotify-Daten in einer Datei
          </p>
        </div>

        <!-- User Info -->
        <div v-if="isAuthenticated && user" class="card mb-8 animate-fade-in">
          <div class="flex items-center space-x-4">
            <img 
              v-if="user.images && user.images.length > 0"
              :src="user.images[0].url" 
              :alt="user.display_name"
              class="w-16 h-16 rounded-full flex-shrink-0"
            >
            <div v-else class="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span class="text-2xl text-on-primary">{{ user.display_name.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="min-w-0">
              <h2 class="text-xl font-semibold text-text">{{ user.display_name }}</h2>
              <!-- GET /me no longer returns email or followers since February 2026 -->
              <p v-if="user.email" class="text-text-secondary">{{ user.email }}</p>
              <p v-if="user.followers" class="text-sm text-text-secondary">{{ user.followers.total }} Follower</p>
            </div>
          </div>
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
              Melde dich bei Spotify an, um dein Backup zu erstellen.
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

        <!-- Authenticated - Backup Interface -->
        <div v-else class="space-y-8">
          <!-- Backup Stats -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="card text-center">
              <div class="text-3xl mb-2">📊</div>
              <h3 class="text-lg font-semibold text-text mb-1">Eigene Playlists</h3>
              <p class="text-2xl font-bold text-brand" data-testid="own-playlists">{{ ownPlaylistsCount }}</p>
              <p v-if="backupData" class="text-sm text-text-secondary">Exportierbar</p>
            </div>
            
            <div class="card text-center">
              <div class="text-3xl mb-2">🎵</div>
              <h3 class="text-lg font-semibold text-text mb-1">Exportierbare Tracks</h3>
              <p class="text-2xl font-bold text-brand" data-testid="exportable-tracks">{{ totalExportableTracksCount }}</p>
              <div v-if="backupData" class="text-sm text-text-secondary">
                <p>{{ ownPlaylistTracksCount }} in eigenen Playlists</p>
                <p>+ {{ backupData?.metadata.totalSavedTracks || 0 }} <span class="text-error">❤️</span> Favoriten</p>
              </div>
            </div>
            
            <div class="card text-center">
              <div class="text-3xl mb-2">📅</div>
              <h3 class="text-lg font-semibold text-text mb-1">Letztes Backup</h3>
              <p class="text-sm text-text-secondary">
                {{ lastBackupDate ? new Date(lastBackupDate).toLocaleDateString('de-DE') : 'Nie' }}
              </p>
            </div>
          </div>

          <!-- Backup Actions -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">Backup erstellen</h2>
              <p class="card-description">
                Erstelle ein vollständiges Backup aller deiner Spotify-Daten.
              </p>
            </div>

            <!-- Backup Progress -->
            <div v-if="isBackingUp" class="mb-6">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-text">{{ currentOperation }}</span>
                <span class="text-sm text-text-secondary">{{ Math.round(backupProgress) }}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: `${backupProgress}%` }" />
              </div>
            </div>

            <!-- Backup Buttons -->
            <div class="flex flex-col sm:flex-row gap-4">
              <button 
                :disabled="isBackingUp"
                class="btn-primary flex-1 flex items-center justify-center"
                @click="createBackup"
              >
                <div v-if="isBackingUp" class="loading-spinner w-5 h-5 mr-2" />
                <svg v-else class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {{ isBackingUp ? 'Backup wird erstellt...' : 'Backup erstellen' }}
              </button>

              <button 
                v-if="backupData"
                class="btn-secondary flex items-center justify-center"
                @click="goToPreview"
              >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Vorschau & Export
              </button>

              <!-- Export Format Buttons -->
              <div v-if="backupData" class="flex flex-col sm:flex-row gap-2">
                <button 
                  class="btn-secondary flex items-center justify-center text-sm"
                  @click="downloadBackup"
                >
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  JSON
                </button>
                
                <button 
                  class="btn-secondary flex items-center justify-center text-sm"
                  @click="downloadCSV"
                >
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  CSV
                </button>
                
                <button 
                  class="btn-secondary flex items-center justify-center text-sm"
                  @click="downloadM3U"
                >
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  M3U
                </button>
              </div>
            </div>
          </div>

          <!-- Result of the last run: stays visible, unlike the toasts -->
          <div v-if="lastRunResult" class="card" data-testid="backup-result">
            <div class="card-header">
              <h2 class="card-title">
                {{ hasRunErrors ? 'Backup unvollständig' : 'Backup vollständig' }}
              </h2>
              <p class="card-description">
                Lauf vom {{ new Date(lastRunResult.finishedAt).toLocaleString('de-DE') }}
              </p>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-4">
              <div class="text-center">
                <p class="text-2xl font-bold text-success" data-testid="loaded-playlists">{{ lastRunResult.loadedPlaylists }}</p>
                <p class="text-xs text-text-secondary mt-1">Playlists geladen</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold" :class="failedPlaylistNames.length > 0 ? 'text-warning' : 'text-text'" data-testid="failed-playlists">
                  {{ failedPlaylistNames.length }}
                </p>
                <p class="text-xs text-text-secondary mt-1">Playlists fehlgeschlagen</p>
              </div>
            </div>

            <div v-if="failedPlaylistNames.length > 0" class="status-warning mb-4">
              <p class="text-sm text-text-secondary mb-3">
                Diese Playlists sind im Backup ohne Tracks enthalten. Betroffen sind in der Regel
                abonnierte fremde Playlists, die Spotify nicht mehr ausliefert; deine eigenen
                Playlists sind vollständig gesichert.
              </p>
              <button class="flex items-center justify-between w-full text-left" @click="showFailedPlaylists = !showFailedPlaylists">
                <span class="font-semibold text-text">
                  Betroffene Playlists ({{ failedPlaylistNames.length }})
                </span>
                <svg
                  class="w-4 h-4 text-text-secondary transition-transform duration-200"
                  :class="{ 'rotate-180': showFailedPlaylists }"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <ul v-if="showFailedPlaylists" class="mt-3 space-y-1 text-sm text-text-secondary" data-testid="failed-playlist-names">
                <li v-for="(name, index) in failedPlaylistNames" :key="index">• {{ name }}</li>
              </ul>
            </div>

            <div v-else-if="hasRunErrors" class="status-warning mb-4">
              <p class="text-sm text-text-secondary">
                Einzelne Bereiche konnten nicht geladen werden. Die Meldungen stehen im Backup unter
                <code>metadata.errors</code>.
              </p>
            </div>

            <div v-else class="status-success">
              <p class="text-sm text-text-secondary">
                Alle Playlists wurden vollständig geladen.
              </p>
            </div>
          </div>

          <!-- Import Section -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">Backup importieren</h2>
              <p class="card-description">
                Importiere ein vorhandenes Backup in einen anderen Account.
              </p>
            </div>

            <router-link to="/import" class="btn-secondary w-full flex items-center justify-center">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Backup importieren
            </router-link>
          </div>

          <!-- Logout -->
          <div class="text-center">
            <button class="btn-ghost" @click="logout">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Abmelden
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSpotifyAuth } from '@/composables/useSpotifyAuth'
import { useBackupStore } from '@/stores/backup'
import { countPlaylistItems } from '@/services/backup-format'

const router = useRouter()
const { isAuthenticated, user, isAuthenticating, startAuth, logout } = useSpotifyAuth()
const backupStore = useBackupStore()

// Computed properties
const isBackingUp = computed(() => backupStore.isBackingUp)
const backupProgress = computed(() => backupStore.backupProgress)
const currentOperation = computed(() => backupStore.currentOperation)
const backupData = computed(() => backupStore.backupData)
const lastBackupDate = computed(() => backupStore.lastBackupDate)
const lastRunResult = computed(() => backupStore.lastRunResult)

const showFailedPlaylists = ref(false)
const failedPlaylistNames = computed(() => lastRunResult.value?.failedPlaylistNames ?? [])
const hasRunErrors = computed(() => (lastRunResult.value?.errors.length ?? 0) > 0)

const ownPlaylists = computed(() => {
  if (!backupData.value?.playlists) return []
  return backupData.value.playlists.filter(playlist =>
    playlist.owner.id === backupData.value?.user?.id
  )
})

// Calculate own playlists count
const ownPlaylistsCount = computed(() => ownPlaylists.value.length)

// Tracks from own playlists, counted the same way as metadata.totalTracks and the
// preview: only items that really made it into the backup, not playlist.tracks.total
const ownPlaylistTracksCount = computed(() => countPlaylistItems(ownPlaylists.value))

// Calculate total exportable tracks (own playlist tracks + saved tracks)
const totalExportableTracksCount = computed(() => {
  if (!backupData.value) return 0
  
  const ownPlaylistTracks = ownPlaylistTracksCount.value
  const savedTracks = backupData.value.metadata.totalSavedTracks || 0
  
  return ownPlaylistTracks + savedTracks
})

// Methods
// The store already reports the outcome as a toast and as lastRunResult
const createBackup = async () => {
  showFailedPlaylists.value = false
  try {
    await backupStore.createBackup()
  } catch (error) {
    console.error('Backup failed:', error)
  }
}

const downloadBackup = () => {
  if (backupData.value) {
    backupStore.downloadBackup(backupData.value)
  }
}

const goToPreview = () => {
  router.push('/backup/preview')
}

const downloadCSV = async () => {
  if (backupData.value) {
    await backupStore.downloadBackupAsCSV(backupData.value)
  }
}

const downloadM3U = async () => {
  if (backupData.value) {
    await backupStore.downloadBackupAsM3U(backupData.value)
  }
}
</script>
