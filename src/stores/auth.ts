import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AuthState, SpotifyUser } from '@/types'

/**
 * Central list of all browser storage keys used by the app.
 * Access token and expiry live in memory only. The refresh token and the
 * user profile are kept in sessionStorage so they disappear when the tab is
 * closed; only the user's own settings stay in localStorage.
 * Keep in sync with PRIVACY.md and CLAUDE.md.
 */
export const STORAGE_KEYS = {
  // localStorage
  clientId: 'spotify_client_id',
  redirectUri: 'spotify_redirect_uri',
  // sessionStorage
  refreshToken: 'spotify_refresh_token',
  user: 'spotify_user',
  grantedScopes: 'spotify_granted_scopes',
  codeVerifier: 'spotify_code_verifier',
  authState: 'spotify_auth_state'
} as const

/** Keys written by older versions into localStorage; removed once on startup. */
const LEGACY_LOCAL_KEYS = [
  'spotify_access_token',
  'spotify_refresh_token',
  'spotify_expires_at',
  'spotify_user'
]

/** Scopes a restore needs; checked client side before an import starts. */
export const IMPORT_SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-modify',
  'user-follow-modify'
]

/** Refresh this long before the access token actually expires. */
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000

export const useAuthStore = defineStore('auth', () => {
  // User-configurable settings
  const clientId = ref<string>('')
  const redirectUri = ref<string>(`${window.location.origin}/callback`)

  // State
  const state = ref<AuthState>({
    isAuthenticated: false,
    user: null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null
  })

  // Scopes Spotify actually granted (from the `scope` field of the token response).
  // Empty means unknown – older sessions never stored it.
  const grantedScopes = ref<string[]>([])

  // Prevents parallel refresh calls (Spotify may rotate the refresh token)
  let refreshInFlight: Promise<boolean> | null = null

  // Getters
  const isAuthenticated = computed(() => state.value.isAuthenticated)
  const user = computed(() => state.value.user)
  const accessToken = computed(() => state.value.accessToken)
  const refreshToken = computed(() => state.value.refreshToken)
  const expiresAt = computed(() => state.value.expiresAt)
  const hasImportScopes = computed(() =>
    // unknown scopes must not block the import; a 403 handles that case at runtime
    grantedScopes.value.length === 0 || IMPORT_SCOPES.every(scope => grantedScopes.value.includes(scope))
  )
  /**
   * True when there is no access token expiry or it is less than a minute away.
   * Deliberately a plain function and not a `computed`: `Date.now()` is not
   * reactive, so a computed would cache its first result and never report an
   * expiry that happened since.
   */
  const isTokenExpired = (): boolean => {
    if (!state.value.expiresAt) return true
    return Date.now() >= state.value.expiresAt - TOKEN_EXPIRY_BUFFER_MS
  }

  /** Stores the granted scope list of a token response (space separated). */
  const setGrantedScopes = (scope: string | null | undefined) => {
    const scopes = (scope ?? '').split(' ').map(entry => entry.trim()).filter(Boolean)
    if (scopes.length === 0) return

    grantedScopes.value = scopes
    try {
      sessionStorage.setItem(STORAGE_KEYS.grantedScopes, scopes.join(' '))
    } catch {
      console.error('Error writing auth session storage')
    }
  }

  // Storage helpers (never log token values)
  const persistSession = (user: SpotifyUser | null, refreshToken: string | null) => {
    try {
      if (refreshToken) {
        sessionStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken)
      }
      if (user) {
        sessionStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user))
      }
    } catch {
      console.error('Error writing auth session storage')
    }
  }

  const clearStoredSession = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.refreshToken)
      sessionStorage.removeItem(STORAGE_KEYS.user)
      sessionStorage.removeItem(STORAGE_KEYS.grantedScopes)

      // Clear pending OAuth artifacts
      sessionStorage.removeItem(STORAGE_KEYS.codeVerifier)
      sessionStorage.removeItem(STORAGE_KEYS.authState)

      // Remnants of the former localStorage based token storage
      LEGACY_LOCAL_KEYS.forEach(key => localStorage.removeItem(key))
    } catch {
      console.error('Error clearing auth storage')
    }
  }

  // Actions
  const setAuthenticated = (authenticated: boolean) => {
    state.value.isAuthenticated = authenticated
  }

  const setUser = (user: SpotifyUser | null) => {
    state.value.user = user
  }

  const setTokens = (accessToken: string, refreshToken: string, expiresIn: number) => {
    state.value.accessToken = accessToken
    state.value.refreshToken = refreshToken
    state.value.expiresAt = Date.now() + (expiresIn * 1000)
  }

  const clearTokens = () => {
    state.value.accessToken = null
    state.value.refreshToken = null
    state.value.expiresAt = null
  }

  const logout = () => {
    state.value.isAuthenticated = false
    state.value.user = null
    grantedScopes.value = []
    clearTokens()
    refreshInFlight = null

    clearStoredSession()
  }

  const login = (
    user: SpotifyUser,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    scope?: string | null
  ) => {
    state.value.isAuthenticated = true
    state.value.user = user
    setTokens(accessToken, refreshToken, expiresIn)
    setGrantedScopes(scope)

    // Access token and expiry stay in memory, only these two are persisted
    persistSession(user, refreshToken)
  }

  const refreshAccessToken = async (): Promise<boolean> => {
    if (!state.value.refreshToken || !clientId.value) {
      return false
    }

    if (refreshInFlight) {
      return refreshInFlight
    }

    const run = async (): Promise<boolean> => {
      try {
        // PKCE flow: no client_secret → send client_id in body, no Authorization header
        const response = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: state.value.refreshToken as string,
            client_id: clientId.value
          })
        })

        if (!response.ok) {
          throw new Error('Failed to refresh token')
        }

        const data = await response.json()
        // Handle refresh token rotation: Spotify may return a new refresh_token
        const newRefreshToken = data.refresh_token || state.value.refreshToken
        setTokens(data.access_token, newRefreshToken, data.expires_in)
        setGrantedScopes(data.scope)
        state.value.isAuthenticated = true

        if (data.refresh_token) {
          persistSession(null, newRefreshToken)
        }

        return true
      } catch (error) {
        console.error('Error refreshing token:', error)
        logout()
        return false
      }
    }

    refreshInFlight = run().finally(() => {
      refreshInFlight = null
    })

    return refreshInFlight
  }

  const loadFromStorage = () => {
    try {
      const storedRefreshToken = sessionStorage.getItem(STORAGE_KEYS.refreshToken)
      const storedUser = sessionStorage.getItem(STORAGE_KEYS.user)
      setGrantedScopes(sessionStorage.getItem(STORAGE_KEYS.grantedScopes))

      // Migration: drop tokens written to localStorage by older versions
      LEGACY_LOCAL_KEYS.forEach(key => localStorage.removeItem(key))

      if (!storedRefreshToken || !storedUser) {
        return
      }

      // Restore the session optimistically so guards and views do not flash a
      // logged-out state; a failing refresh logs out afterwards.
      state.value.user = JSON.parse(storedUser)
      state.value.refreshToken = storedRefreshToken
      state.value.isAuthenticated = true

      // No access token is persisted → fetch a fresh one without blocking startup
      void refreshAccessToken()
    } catch (error) {
      console.error('Error loading auth from storage:', error)
      logout()
    }
  }

  const getValidAccessToken = async (): Promise<string | null> => {
    if (!state.value.accessToken || isTokenExpired()) {
      if (!state.value.refreshToken) {
        return null
      }
      const refreshed = await refreshAccessToken()
      if (!refreshed) {
        return null
      }
    }

    return state.value.accessToken
  }

  // Methods for user settings
  const setClientId = (id: string) => {
    clientId.value = id
    // Save to localStorage
    localStorage.setItem(STORAGE_KEYS.clientId, id)
  }

  const setRedirectUri = (uri: string) => {
    redirectUri.value = uri
    // Save to localStorage
    localStorage.setItem(STORAGE_KEYS.redirectUri, uri)
  }

  const loadUserSettings = () => {
    const savedClientId = localStorage.getItem(STORAGE_KEYS.clientId)
    const savedRedirectUri = localStorage.getItem(STORAGE_KEYS.redirectUri)

    if (savedClientId) clientId.value = savedClientId
    if (savedRedirectUri) redirectUri.value = savedRedirectUri
  }

  // Settings first: the refresh triggered by loadFromStorage needs the client ID
  loadUserSettings()
  loadFromStorage()

  return {
    // State
    state,
    clientId,
    redirectUri,
    grantedScopes,

    // Getters
    isAuthenticated,
    user,
    accessToken,
    refreshToken,
    expiresAt,
    isTokenExpired,
    hasImportScopes,

    // Actions
    setAuthenticated,
    setUser,
    setTokens,
    clearTokens,
    setGrantedScopes,
    login,
    logout,
    loadFromStorage,
    refreshAccessToken,
    getValidAccessToken,
    setClientId,
    setRedirectUri,
    loadUserSettings
  }
})
