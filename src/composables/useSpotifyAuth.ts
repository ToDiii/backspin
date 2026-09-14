import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, STORAGE_KEYS } from '@/stores/auth'
import { SpotifyAuthError, describeAuthError } from '@/services/auth-errors'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '@/services/pkce'
import { useAppStore } from '@/stores/app'
import { useBackupStore } from '@/stores/backup'
import type { SpotifyUser } from '@/types'

export function useSpotifyAuth() {
  const authStore = useAuthStore()
  const appStore = useAppStore()
  const backupStore = useBackupStore()
  const router = useRouter()

  const isAuthenticating = ref(false)
  const authError = ref<string | null>(null)

  // Spotify OAuth configuration
  const REDIRECT_URI = `${import.meta.env.VITE_APP_URL || window.location.origin}/callback`
  const SCOPES = [
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
    // needed for GET /me/following?type=artist (followed artists in the backup)
    'user-follow-read',
    // restore: POST /me/playlists and POST /playlists/{id}/items
    'playlist-modify-public',
    'playlist-modify-private',
    // restore: PUT /me/library (tracks, albums) and following artists
    'user-library-modify',
    'user-follow-modify',
    'user-read-email',
    'user-read-private'
  ].join(' ')

  // Start OAuth flow
  const startAuth = async (): Promise<void> => {
    authError.value = null

    try {
      const clientId = authStore.clientId

      if (!clientId) {
        appStore.showError(
          'Client-ID fehlt',
          'Hinterlege zuerst deine Spotify Client-ID im Setup, um dich anmelden zu können.'
        )
        await router.push('/setup')
        return
      }

      isAuthenticating.value = true

      const codeVerifier = generateCodeVerifier()
      const codeChallenge = await generateCodeChallenge(codeVerifier)
      const oauthState = generateState()

      // Store code verifier and state for the callback
      sessionStorage.setItem(STORAGE_KEYS.codeVerifier, codeVerifier)
      sessionStorage.setItem(STORAGE_KEYS.authState, oauthState)

      // Build authorization URL
      const authUrl = new URL('https://accounts.spotify.com/authorize')
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('scope', SCOPES)
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('state', oauthState)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('code_challenge', codeChallenge)

      // Redirect to Spotify
      window.location.href = authUrl.toString()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentifizierung fehlgeschlagen'
      authError.value = message
      isAuthenticating.value = false
      appStore.showError('Anmeldung fehlgeschlagen', message)
    }
  }

  // Handle OAuth callback
  const handleCallback = async (code: string, returnedState: string | null): Promise<void> => {
    const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.codeVerifier)
    const expectedState = sessionStorage.getItem(STORAGE_KEYS.authState)

    isAuthenticating.value = true

    try {
      if (!codeVerifier) {
        throw new SpotifyAuthError('missing_verifier', 'Code verifier nicht gefunden')
      }

      if (!expectedState || !returnedState || expectedState !== returnedState) {
        throw new SpotifyAuthError('state_mismatch', 'Ungültiger state-Parameter')
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: authStore.clientId,
          code_verifier: codeVerifier,
        }),
      })

      if (!tokenResponse.ok) {
        // Spotify answers with the OAuth error code, which says far more about
        // the cause than the status: invalid_client is a wrong Client ID,
        // invalid_grant usually a Redirect URI that differs by one character.
        const errorData = await tokenResponse.json().catch(() => ({}))
        throw new SpotifyAuthError(
          typeof errorData.error === 'string' ? errorData.error : 'token_exchange_failed',
          errorData.error_description || 'Token-Austausch fehlgeschlagen'
        )
      }

      const tokenData = await tokenResponse.json()

      // Fetch user profile
      const userResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
      })

      if (!userResponse.ok) {
        // A 403 right after a successful token exchange means Spotify accepted
        // the login but refuses the data – the account is not on the app's
        // user list, or it has no Premium.
        throw new SpotifyAuthError(
          userResponse.status === 403 ? 'profile_forbidden' : 'profile_failed',
          'Benutzerprofil konnte nicht geladen werden'
        )
      }

      const user: SpotifyUser = await userResponse.json()

      // Store authentication data
      authStore.login(
        user,
        tokenData.access_token,
        tokenData.refresh_token,
        tokenData.expires_in,
        // `scope` lists what Spotify actually granted – needed to check restore permissions
        tokenData.scope
      )

      appStore.showSuccess(
        'Anmeldung erfolgreich',
        `Willkommen, ${user.display_name}! Du kannst jetzt dein Backup erstellen.`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentifizierung fehlgeschlagen'
      const info = describeAuthError(error instanceof SpotifyAuthError ? error.code : null, message)
      authError.value = message
      appStore.showError(info.title, info.message)
      throw error
    } finally {
      // Always drop the one-time OAuth artifacts, also on the error path
      sessionStorage.removeItem(STORAGE_KEYS.codeVerifier)
      sessionStorage.removeItem(STORAGE_KEYS.authState)
      isAuthenticating.value = false
    }
  }

  // Logout: clears the session and every trace of the previous backup.
  // backupStore is used here (not inside authStore.logout) to avoid a circular store import.
  const logout = (): void => {
    authStore.logout()
    backupStore.reset()
    appStore.showInfo('Abgemeldet', 'Du wurdest erfolgreich abgemeldet.')
  }

  // Check if user is authenticated
  const isAuthenticated = computed(() => authStore.isAuthenticated)
  const user = computed(() => authStore.user)

  return {
    isAuthenticating,
    authError,
    isAuthenticated,
    user,
    startAuth,
    handleCallback,
    logout
  }
}
