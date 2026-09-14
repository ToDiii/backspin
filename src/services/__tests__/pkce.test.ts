import { describe, expect, it } from 'vitest'
import {
  AUTH_STATE_BYTES,
  CODE_VERIFIER_BYTES,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  toBase64Url
} from '@/services/pkce'

const BASE64URL = /^[A-Za-z0-9_-]+$/

describe('toBase64Url', () => {
  it('encodes bytes without padding', () => {
    expect(toBase64Url(new Uint8Array([1, 2, 3]))).toBe('AQID')
    expect(toBase64Url(new Uint8Array([1, 2]))).toBe('AQI')
    expect(toBase64Url(new Uint8Array([1]))).toBe('AQ')
  })

  it('replaces the URL unsafe base64 characters', () => {
    // 0xfb 0xff encodes to "+/8" in standard base64
    expect(toBase64Url(new Uint8Array([0xfb, 0xff, 0x00]))).toBe('-_8A')
  })

  it('returns an empty string for empty input', () => {
    expect(toBase64Url(new Uint8Array([]))).toBe('')
  })
})

describe('generateCodeVerifier', () => {
  it('produces 43 characters for 32 random bytes', () => {
    const verifier = generateCodeVerifier()
    expect(verifier).toHaveLength(Math.ceil((CODE_VERIFIER_BYTES * 8) / 6))
    expect(verifier).toHaveLength(43)
  })

  it('uses the unreserved base64url character set only', () => {
    expect(generateCodeVerifier()).toMatch(BASE64URL)
  })

  it('satisfies the RFC 7636 length range of 43 to 128 characters', () => {
    const verifier = generateCodeVerifier()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
  })

  it('returns a different value on every call', () => {
    const values = new Set(Array.from({ length: 20 }, () => generateCodeVerifier()))
    expect(values.size).toBe(20)
  })
})

describe('generateState', () => {
  it('produces 22 characters for 16 random bytes', () => {
    expect(AUTH_STATE_BYTES).toBe(16)
    expect(generateState()).toHaveLength(22)
  })

  it('uses the base64url character set and is random', () => {
    const state = generateState()
    expect(state).toMatch(BASE64URL)
    expect(state).not.toBe(generateState())
  })
})

describe('generateCodeChallenge', () => {
  it('matches the S256 test vector of RFC 7636 appendix B', async () => {
    const challenge = await generateCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('is base64url encoded without padding', async () => {
    const challenge = await generateCodeChallenge(generateCodeVerifier())
    expect(challenge).toMatch(BASE64URL)
    expect(challenge).toHaveLength(43)
  })

  it('is deterministic for the same verifier', async () => {
    const verifier = generateCodeVerifier()
    expect(await generateCodeChallenge(verifier)).toBe(await generateCodeChallenge(verifier))
  })

  it('differs for different verifiers', async () => {
    expect(await generateCodeChallenge('a')).not.toBe(await generateCodeChallenge('b'))
  })
})
