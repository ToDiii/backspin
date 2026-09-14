/**
 * Checks what the user pasted into the setup wizard.
 *
 * The Client ID is the one value a user has to transfer by hand, and a wrong
 * one only shows up much later as an opaque Spotify error page. The checks
 * here therefore name the concrete problem instead of just rejecting the input.
 */

/** A Spotify Client ID is exactly 32 hexadecimal characters. */
export const CLIENT_ID_LENGTH = 32

const HEX_ONLY = /^[0-9a-f]+$/i
const LOOKS_LIKE_URL = /(^https?:\/\/)|(spotify\.com)/i

export interface ClientIdCheck {
  /** The input with surrounding and inner whitespace removed. */
  value: string
  valid: boolean
  /** German, user facing, null while the field is still empty. */
  error: string | null
}

/** Strips whitespace, including the newline a copy from the dashboard adds. */
export const normalizeClientId = (raw: string): string => raw.replace(/\s+/g, '')

export const checkClientId = (raw: string): ClientIdCheck => {
  const value = normalizeClientId(raw)

  if (!value) {
    return { value, valid: false, error: null }
  }

  if (LOOKS_LIKE_URL.test(value)) {
    return {
      value,
      valid: false,
      error: 'Das sieht nach einer Adresse aus. Gebraucht wird nur die Client ID aus den App-Einstellungen, nicht der Link zum Dashboard.',
    }
  }

  if (value.length !== CLIENT_ID_LENGTH) {
    const zeichen = value.length === 1 ? '1 Zeichen' : `${value.length} Zeichen`
    return {
      value,
      valid: false,
      error: `Die Client ID ist ${CLIENT_ID_LENGTH} Zeichen lang, deine Eingabe hat ${zeichen}. Kopiere im Dashboard den Wert unter „Client ID" komplett.`,
    }
  }

  if (!HEX_ONLY.test(value)) {
    const unerlaubt = [...new Set(value.split('').filter(char => !/[0-9a-f]/i.test(char)))]
    return {
      value,
      valid: false,
      error: `Die Client ID besteht nur aus den Ziffern 0-9 und den Buchstaben a-f. Nicht erlaubt ist hier: ${unerlaubt.join(' ')}`,
    }
  }

  return { value, valid: true, error: null }
}
