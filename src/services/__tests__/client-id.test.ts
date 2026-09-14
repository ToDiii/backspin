import { describe, expect, it } from 'vitest'
import { CLIENT_ID_LENGTH, checkClientId, normalizeClientId } from '@/services/client-id'

const VALID = '0a1b2c3d4e5f60718293a4b5c6d7e8f9'

describe('normalizeClientId', () => {
  it('removes surrounding whitespace and the newline a paste adds', () => {
    expect(normalizeClientId(`  ${VALID}\n`)).toBe(VALID)
  })

  it('removes whitespace inside the value', () => {
    expect(normalizeClientId('0a1b 2c3d4e5f60718293a4b5c6d7e8f9')).toBe(VALID)
  })
})

describe('checkClientId', () => {
  it('accepts a well formed id', () => {
    expect(checkClientId(VALID)).toEqual({ value: VALID, valid: true, error: null })
  })

  it('accepts an id in upper case', () => {
    const upper = VALID.toUpperCase()
    expect(checkClientId(upper)).toEqual({ value: upper, valid: true, error: null })
  })

  it('accepts an id that was pasted with whitespace', () => {
    expect(checkClientId(` ${VALID} `).valid).toBe(true)
  })

  it('stays quiet while the field is empty', () => {
    expect(checkClientId('')).toEqual({ value: '', valid: false, error: null })
    expect(checkClientId('   ').error).toBeNull()
  })

  it('recognises a pasted dashboard link', () => {
    const check = checkClientId('https://developer.spotify.com/dashboard/0a1b2c3d')
    expect(check.valid).toBe(false)
    expect(check.error).toMatch(/Adresse/)
  })

  it('recognises a pasted spotify address without a scheme', () => {
    expect(checkClientId('developer.spotify.com/dashboard').error).toMatch(/Adresse/)
  })

  it('names the length that was actually entered', () => {
    const check = checkClientId(VALID.slice(0, 20))
    expect(check.valid).toBe(false)
    expect(check.error).toContain('20 Zeichen')
    expect(check.error).toContain(String(CLIENT_ID_LENGTH))
  })

  it('uses the singular for a single character', () => {
    expect(checkClientId('a').error).toContain('1 Zeichen')
  })

  it('lists the characters that do not belong in a hexadecimal value', () => {
    const check = checkClientId(`${VALID.slice(0, 30)}zz`)
    expect(check.valid).toBe(false)
    expect(check.error).toContain('z')
  })

  it('lists each offending character only once', () => {
    const check = checkClientId(`${VALID.slice(0, 29)}zzz`)
    expect(check.error?.match(/z/g)).toHaveLength(1)
  })
})
