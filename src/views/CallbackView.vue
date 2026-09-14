<template>
  <div class="min-h-screen bg-background">
    <div class="container-custom section-padding">
      <div class="max-w-2xl mx-auto">
        <div v-if="isProcessing" class="text-center space-y-6">
          <div class="loading-spinner w-12 h-12 mx-auto" />
          <h1 class="text-2xl font-bold text-text">Anmeldung wird verarbeitet …</h1>
          <p class="text-text-secondary">Einen Moment, deine Anmeldung bei Spotify wird abgeschlossen.</p>
        </div>

        <div v-else-if="errorInfo" class="card animate-fade-in" data-testid="callback-error">
          <div class="text-center mb-6">
            <div class="w-16 h-16 bg-error rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-on-status" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-text mb-2" data-testid="error-title">{{ errorInfo.title }}</h1>
            <p class="text-text-secondary">{{ errorInfo.message }}</p>
          </div>

          <!-- Der häufigste Stolperstein bekommt den direkten Weg zur Lösung -->
          <div v-if="errorInfo.userListLikely" class="status-warning mb-6">
            <h2 class="font-semibold text-text mb-2">Das behebt es fast immer</h2>
            <p class="text-sm text-text-secondary mb-4">
              Deine App läuft im Development Mode. Spotify lässt dort nur Konten zu, die in der App selbst
              eingetragen sind – auch dein eigenes. Der Eintrag steht im Dashboard unter
              „Settings" → „User Management".
            </p>
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-primary w-full flex items-center justify-center"
            >
              <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Dashboard öffnen
            </a>
          </div>

          <div class="status-info mb-6">
            <h2 class="font-semibold text-text mb-2">Das kannst du prüfen</h2>
            <ul class="space-y-2 text-sm text-text-secondary" data-testid="error-hints">
              <li v-for="hint in errorInfo.hints" :key="hint" class="flex items-start gap-2">
                <span class="text-brand flex-shrink-0">•</span>
                <span class="min-w-0">{{ hint }}</span>
              </li>
            </ul>
          </div>

          <div class="flex flex-col sm:flex-row gap-3">
            <button class="btn-primary flex-1" @click="retryAuth">
              Anmeldung erneut starten
            </button>
            <router-link :to="setupTarget" class="btn-secondary flex-1 flex items-center justify-center">
              Zurück zum Setup
            </router-link>
          </div>

          <p v-if="technicalDetail" class="text-xs text-text-muted mt-6 break-words">
            Technische Meldung von Spotify: <span class="font-mono">{{ technicalDetail }}</span>
          </p>
        </div>

        <div v-else class="text-center space-y-6">
          <div class="w-16 h-16 bg-success rounded-full flex items-center justify-center mx-auto">
            <svg class="w-8 h-8 text-on-status" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-text">Anmeldung erfolgreich!</h1>
          <p class="text-text-secondary">Du wirst automatisch weitergeleitet …</p>
          <div class="loading-spinner w-6 h-6 mx-auto" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSpotifyAuth } from '@/composables/useSpotifyAuth'
import { SpotifyAuthError, describeAuthError } from '@/services/auth-errors'
import type { AuthErrorInfo } from '@/services/auth-errors'

const route = useRoute()
const router = useRouter()
const { handleCallback } = useSpotifyAuth()

const isProcessing = ref(true)
const errorInfo = ref<AuthErrorInfo | null>(null)
const technicalDetail = ref<string | null>(null)

/** Sends the user back to the step that most likely needs fixing. */
const setupTarget = computed(() => ({
  path: '/setup',
  query: errorInfo.value?.userListLikely ? { schritt: '2' } : {},
}))

const retryAuth = () => {
  router.replace('/backup')
}

onMounted(async () => {
  // Read the query before scrubbing it from the address bar
  const code = route.query.code as string | undefined
  const returnedState = (route.query.state as string | undefined) ?? null
  const errorParam = route.query.error as string | undefined
  const errorDescription = route.query.error_description as string | undefined

  // Keep the authorization code out of the address bar and the browser history
  window.history.replaceState({}, '', '/callback')

  try {
    if (errorParam) {
      throw new SpotifyAuthError(errorParam, errorDescription || errorParam)
    }

    if (!code) {
      throw new SpotifyAuthError('missing_code', 'Kein Autorisierungscode erhalten')
    }

    // Handle the OAuth callback (verifies the state parameter)
    await handleCallback(code, returnedState)

    // Without this the spinner stays up and the success screen below is never
    // reached, because the redirect only happens two seconds later.
    isProcessing.value = false

    // Success - redirect to backup page
    setTimeout(() => {
      router.replace('/backup')
    }, 2000)

  } catch (err) {
    console.error('Callback error:', err)
    const message = err instanceof Error ? err.message : null
    const code = err instanceof SpotifyAuthError ? err.code : null
    errorInfo.value = describeAuthError(code, message)
    // The raw code stays visible, but small: it is what a bug report needs.
    // Without an error_description Spotify only sends the code, so it would
    // otherwise be printed twice.
    const parts = [code, message === code ? null : message].filter(Boolean)
    technicalDetail.value = parts.join(' – ') || null
    isProcessing.value = false
  }
})
</script>
