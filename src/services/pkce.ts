/**
 * PKCE helpers for the Spotify OAuth flow (RFC 7636).
 *
 * Pure Web Crypto wrappers, kept out of the composable so they can be
 * verified against the RFC test vectors without a Vue/router context.
 */

/** Number of random bytes behind a code verifier (43 base64url characters). */
export const CODE_VERIFIER_BYTES = 32

/** Number of random bytes behind the CSRF state value (22 base64url characters). */
export const AUTH_STATE_BYTES = 16

/** base64url encoding without padding, as required by RFC 7636. */
export const toBase64Url = (bytes: Uint8Array): string => {
  return btoa(String.fromCharCode.apply(null, Array.from(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

const randomBase64Url = (byteLength: number): string => {
  const array = new Uint8Array(byteLength)
  crypto.getRandomValues(array)
  return toBase64Url(array)
}

/** Random PKCE code verifier. */
export const generateCodeVerifier = (): string => randomBase64Url(CODE_VERIFIER_BYTES)

/** Random CSRF state value that binds a started flow to its callback. */
export const generateState = (): string => randomBase64Url(AUTH_STATE_BYTES)

/** S256 challenge: base64url(SHA-256(verifier)). */
export const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toBase64Url(new Uint8Array(digest))
}
