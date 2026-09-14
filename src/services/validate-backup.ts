/**
 * Validation of user supplied backup files.
 *
 * The file comes from the user's disk and is therefore untrusted input:
 * size, media type, JSON syntax and structure are checked before any part of
 * the data reaches the UI. No external schema library is used on purpose.
 *
 * This module only guards the input. Lifting an accepted file to the current
 * backup shape is the job of `normalizeBackup` in `@/services/backup-format`,
 * so nothing is validated twice.
 */

/** Maximum accepted file size (50 MB). */
export const MAX_BACKUP_FILE_SIZE = 50 * 1024 * 1024

/** Backup format versions this app can read. */
export const SUPPORTED_BACKUP_VERSIONS = ['2.0', '2.1', '2.2']

export type BackupValidationCode =
  | 'file-empty'
  | 'file-too-large'
  | 'file-type'
  | 'file-unreadable'
  | 'json-syntax'
  | 'schema'
  | 'version'

/** Error with a German, user facing message and a machine readable code. */
export class BackupValidationError extends Error {
  readonly code: BackupValidationCode

  constructor(code: BackupValidationCode, message: string) {
    super(message)
    this.name = 'BackupValidationError'
    this.code = code
  }
}

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const fail = (code: BackupValidationCode, message: string): never => {
  throw new BackupValidationError(code, message)
}

/**
 * A track entry inside `playlist.tracks.items` or inside `savedTracks`.
 * Tolerant on purpose: format 2.0 stores the track object directly,
 * 2.1 and 2.2 wrap it as `{ item: ... }` and saved tracks as `{ track: ... }`.
 */
const isTrackEntry = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  if (typeof value.id === 'string') return true
  if (isRecord(value.item)) return true
  if (isRecord(value.track)) return true
  return false
}

const validatePlaylist = (value: unknown, index: number): void => {
  if (!isRecord(value)) {
    fail('schema', `Playlist ${index + 1} ist kein gültiger Eintrag.`)
    return
  }
  if (!isNonEmptyString(value.id)) {
    fail('schema', `Playlist ${index + 1} hat keine gültige ID.`)
  }
  if (typeof value.name !== 'string') {
    fail('schema', `Playlist ${index + 1} hat keinen gültigen Namen.`)
  }
  if (!isRecord(value.tracks)) {
    fail('schema', `Playlist "${value.name}" enthält keine Track-Daten.`)
    return
  }

  const items = value.tracks.items
  if (items !== undefined) {
    if (!Array.isArray(items)) {
      fail('schema', `Die Track-Liste der Playlist "${value.name}" ist ungültig.`)
      return
    }
    const invalid = items.findIndex(entry => !isTrackEntry(entry))
    if (invalid >= 0) {
      fail(
        'schema',
        `Track ${invalid + 1} der Playlist "${value.name}" hat ein unbekanntes Format.`
      )
    }
  }
}

/**
 * Validates the parsed content of a backup file structurally.
 * Returns the untouched value so `normalizeBackup` can lift it afterwards.
 */
export const validateBackupData = (parsed: unknown): unknown => {
  if (!isRecord(parsed)) {
    fail('schema', 'Die Backup-Datei enthält kein Backup-Objekt.')
    return parsed
  }

  if (!isNonEmptyString(parsed.version)) {
    fail('schema', 'Der Backup-Datei fehlt die Formatversion.')
  }
  if (!SUPPORTED_BACKUP_VERSIONS.includes(parsed.version as string)) {
    fail(
      'version',
      `Die Backup-Version "${parsed.version}" wird nicht unterstützt (unterstützt: ${SUPPORTED_BACKUP_VERSIONS.join(', ')}).`
    )
  }
  if (!isNonEmptyString(parsed.exportDate)) {
    fail('schema', 'Der Backup-Datei fehlt das Exportdatum.')
  }
  if (!isRecord(parsed.user) || !isNonEmptyString(parsed.user.id)) {
    fail('schema', 'Der Backup-Datei fehlen gültige Nutzerdaten.')
  }
  if (!Array.isArray(parsed.playlists)) {
    fail('schema', 'Die Backup-Datei enthält keine Playlist-Liste.')
    return parsed
  }
  if (!Array.isArray(parsed.savedTracks)) {
    fail('schema', 'Die Backup-Datei enthält keine Liste gespeicherter Titel.')
    return parsed
  }
  if (parsed.savedAlbums !== undefined && !Array.isArray(parsed.savedAlbums)) {
    fail('schema', 'Die Liste gespeicherter Alben ist ungültig.')
  }
  if (parsed.followedArtists !== undefined && !Array.isArray(parsed.followedArtists)) {
    fail('schema', 'Die Liste gefolgter Künstler ist ungültig.')
  }

  ;(parsed.playlists as unknown[]).forEach(validatePlaylist)

  const invalidSaved = (parsed.savedTracks as unknown[]).findIndex(entry => !isTrackEntry(entry))
  if (invalidSaved >= 0) {
    fail(
      'schema',
      `Der gespeicherte Titel ${invalidSaved + 1} hat ein unbekanntes Format.`
    )
  }

  return parsed
}

/**
 * Reads and validates a backup file selected by the user.
 * Rejects with a {@link BackupValidationError} carrying a German message.
 */
export const validateBackupFile = async (file: File): Promise<unknown> => {
  if (file.size === 0) {
    fail('file-empty', 'Die Datei ist leer.')
  }
  if (file.size > MAX_BACKUP_FILE_SIZE) {
    fail(
      'file-too-large',
      `Die Datei ist zu groß (maximal ${Math.round(MAX_BACKUP_FILE_SIZE / (1024 * 1024))} MB).`
    )
  }

  const hasJsonExtension = file.name.toLowerCase().endsWith('.json')
  const hasJsonType = file.type === '' || file.type === 'application/json' || file.type === 'text/json'
  if (!hasJsonExtension || !hasJsonType) {
    fail('file-type', 'Bitte wähle eine Backup-Datei im JSON-Format (.json) aus.')
  }

  let text = ''
  try {
    text = await file.text()
  } catch {
    fail('file-unreadable', 'Die Datei konnte nicht gelesen werden.')
  }

  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    fail('json-syntax', 'Die Datei enthält kein gültiges JSON.')
  }

  return validateBackupData(parsed)
}
