import { describe, expect, it } from 'vitest'
import { SpotifyAuthError, describeAuthError } from '@/services/auth-errors'

describe('SpotifyAuthError', () => {
  it('keeps the code next to the message', () => {
    const error = new SpotifyAuthError('access_denied', 'abgelehnt')
    expect(error.code).toBe('access_denied')
    expect(error.message).toBe('abgelehnt')
    expect(error).toBeInstanceOf(Error)
  })
})

describe('describeAuthError', () => {
  it('names the user list first for a refused authorization', () => {
    const info = describeAuthError('access_denied')
    expect(info.userListLikely).toBe(true)
    expect(info.message).toMatch(/Nutzerliste/)
    expect(info.hints[0]).toMatch(/User Management/)
  })

  it('also mentions a cancelled authorization, because both look the same', () => {
    expect(describeAuthError('access_denied').message).toMatch(/abgebrochen/)
  })

  it('points at the client id when spotify does not know the app', () => {
    const info = describeAuthError('invalid_client')
    expect(info.userListLikely).toBe(false)
    expect(info.hints.join(' ')).toMatch(/Client Secret/)
  })

  it('points at the redirect uri for a rejected grant', () => {
    const info = describeAuthError('invalid_grant')
    expect(info.hints.join(' ')).toMatch(/Redirect URI/)
    expect(info.userListLikely).toBe(false)
  })

  it('treats a forbidden profile as a user list problem too', () => {
    const info = describeAuthError('profile_forbidden')
    expect(info.userListLikely).toBe(true)
    expect(info.hints.join(' ')).toMatch(/Premium/)
  })

  it('blames spotify, not the setup, for a server error', () => {
    const info = describeAuthError('server_error')
    expect(info.userListLikely).toBe(false)
    expect(info.message).toMatch(/bei Spotify/)
  })

  it('keeps the original message for an unknown code', () => {
    expect(describeAuthError('etwas_neues', 'Originaltext').message).toBe('Originaltext')
  })

  it('falls back to a generic sentence without an original message', () => {
    expect(describeAuthError(null).message).toMatch(/fehlgeschlagen/)
    expect(describeAuthError(undefined, '  ').message).toMatch(/fehlgeschlagen/)
  })

  it('always offers at least one thing to check', () => {
    for (const code of ['access_denied', 'invalid_client', 'invalid_grant', 'state_mismatch', 'missing_code', 'missing_verifier', 'server_error', 'profile_forbidden', null]) {
      expect(describeAuthError(code).hints.length).toBeGreaterThan(0)
    }
  })
})
