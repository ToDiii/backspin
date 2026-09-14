import { describe, expect, it } from 'vitest'
import {
  BackupValidationError,
  MAX_BACKUP_FILE_SIZE,
  SUPPORTED_BACKUP_VERSIONS,
  validateBackupData,
  validateBackupFile
} from '@/services/validate-backup'
import type { BackupValidationCode } from '@/services/validate-backup'
import { BACKUP_FORMAT_VERSION } from '@/services/backup-format'

const minimalBackup = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  version: BACKUP_FORMAT_VERSION,
  exportDate: '2024-01-01T00:00:00.000Z',
  user: { id: 'user-1', display_name: 'Test User' },
  playlists: [],
  savedTracks: [],
  ...overrides
})

const jsonFile = (content: unknown, name = 'backup.json', type = 'application/json'): File => {
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  return new File([text], name, { type })
}

const fileOfSize = (size: number): File => {
  const file = jsonFile(minimalBackup())
  Object.defineProperty(file, 'size', { value: size })
  return file
}

/** Runs the validation and returns the thrown error, so code and message can be asserted. */
const expectRejection = async (file: File): Promise<BackupValidationError> => {
  try {
    await validateBackupFile(file)
  } catch (error) {
    expect(error).toBeInstanceOf(BackupValidationError)
    return error as BackupValidationError
  }
  throw new Error('Expected validateBackupFile to reject')
}

const expectDataError = (parsed: unknown): BackupValidationError => {
  try {
    validateBackupData(parsed)
  } catch (error) {
    expect(error).toBeInstanceOf(BackupValidationError)
    return error as BackupValidationError
  }
  throw new Error('Expected validateBackupData to throw')
}

const isGerman = (message: string): boolean => /[a-zäöüß]/i.test(message) && message.endsWith('.')

describe('BackupValidationError', () => {
  it('carries a machine readable code and the error name', () => {
    const error = new BackupValidationError('schema', 'Kaputt.')
    expect(error.code).toBe('schema')
    expect(error.name).toBe('BackupValidationError')
    expect(error).toBeInstanceOf(Error)
  })
})

describe('validateBackupFile (file level)', () => {
  it('rejects an empty file', async () => {
    const error = await expectRejection(fileOfSize(0))
    expect(error.code satisfies BackupValidationCode).toBe('file-empty')
    expect(error.message).toBe('Die Datei ist leer.')
  })

  it('rejects a file above the 50 MB limit', async () => {
    expect(MAX_BACKUP_FILE_SIZE).toBe(50 * 1024 * 1024)
    const error = await expectRejection(fileOfSize(MAX_BACKUP_FILE_SIZE + 1))
    expect(error.code).toBe('file-too-large')
    expect(error.message).toContain('50 MB')
  })

  it('accepts a file exactly at the limit', async () => {
    await expect(validateBackupFile(jsonFile(minimalBackup()))).resolves.toBeTruthy()
  })

  it('rejects a wrong file extension', async () => {
    const error = await expectRejection(jsonFile(minimalBackup(), 'backup.txt', ''))
    expect(error.code).toBe('file-type')
    expect(error.message).toContain('.json')
  })

  it('rejects a wrong media type', async () => {
    const error = await expectRejection(jsonFile(minimalBackup(), 'backup.json', 'application/zip'))
    expect(error.code).toBe('file-type')
  })

  it('accepts an uppercase extension and an empty media type', async () => {
    await expect(validateBackupFile(jsonFile(minimalBackup(), 'BACKUP.JSON', ''))).resolves.toBeTruthy()
  })

  it('accepts text/json', async () => {
    await expect(
      validateBackupFile(jsonFile(minimalBackup(), 'backup.json', 'text/json'))
    ).resolves.toBeTruthy()
  })

  it('rejects broken JSON', async () => {
    const error = await expectRejection(jsonFile('{ "version": '))
    expect(error.code).toBe('json-syntax')
    expect(error.message).toBe('Die Datei enthält kein gültiges JSON.')
  })

  it('rejects an array as the root value', async () => {
    const error = await expectRejection(jsonFile([minimalBackup()]))
    expect(error.code).toBe('schema')
    expect(error.message).toBe('Die Backup-Datei enthält kein Backup-Objekt.')
  })

  it('returns the untouched parsed value on success', async () => {
    const data = minimalBackup({ metadata: { totalPlaylists: 0 } })
    await expect(validateBackupFile(jsonFile(data))).resolves.toEqual(data)
  })
})

describe('validateBackupData (versions)', () => {
  it('supports exactly 2.0, 2.1 and 2.2', () => {
    expect(SUPPORTED_BACKUP_VERSIONS).toEqual(['2.0', '2.1', '2.2'])
  })

  it('contains the version the app currently writes', () => {
    expect(SUPPORTED_BACKUP_VERSIONS).toContain(BACKUP_FORMAT_VERSION)
  })

  it.each(['2.0', '2.1', '2.2'])('accepts the known version %s explicitly', version => {
    expect(() => validateBackupData(minimalBackup({ version }))).not.toThrow()
  })

  it.each(SUPPORTED_BACKUP_VERSIONS)('accepts version %s', version => {
    expect(() => validateBackupData(minimalBackup({ version }))).not.toThrow()
  })

  it('rejects version 1.0 of the original SpotMyBackup', () => {
    const error = expectDataError(minimalBackup({ version: '1.0' }))
    expect(error.code).toBe('version')
    expect(error.message).toContain('"1.0"')
    expect(error.message).toContain('2.0, 2.1, 2.2')
  })

  it('rejects a future version', () => {
    expect(expectDataError(minimalBackup({ version: '3.0' })).code).toBe('version')
  })

  it('rejects a missing version as a schema error', () => {
    const error = expectDataError(minimalBackup({ version: '   ' }))
    expect(error.code).toBe('schema')
    expect(error.message).toBe('Der Backup-Datei fehlt die Formatversion.')
  })

  it('rejects a non-string version', () => {
    expect(expectDataError(minimalBackup({ version: 2.1 })).code).toBe('schema')
  })
})

describe('validateBackupData (required fields)', () => {
  it('rejects a missing export date', () => {
    const error = expectDataError(minimalBackup({ exportDate: undefined }))
    expect(error.code).toBe('schema')
    expect(error.message).toBe('Der Backup-Datei fehlt das Exportdatum.')
  })

  it('rejects missing user data', () => {
    expect(expectDataError(minimalBackup({ user: undefined })).message).toBe(
      'Der Backup-Datei fehlen gültige Nutzerdaten.'
    )
  })

  it('rejects a user without an id', () => {
    expect(expectDataError(minimalBackup({ user: { display_name: 'X' } })).code).toBe('schema')
  })

  it('rejects a missing playlist list', () => {
    expect(expectDataError(minimalBackup({ playlists: undefined })).message).toBe(
      'Die Backup-Datei enthält keine Playlist-Liste.'
    )
  })

  it('rejects a missing saved track list', () => {
    expect(expectDataError(minimalBackup({ savedTracks: undefined })).message).toBe(
      'Die Backup-Datei enthält keine Liste gespeicherter Titel.'
    )
  })

  it('rejects savedAlbums that are not an array', () => {
    expect(expectDataError(minimalBackup({ savedAlbums: {} })).message).toBe(
      'Die Liste gespeicherter Alben ist ungültig.'
    )
  })

  it('rejects followedArtists that are not an array', () => {
    expect(expectDataError(minimalBackup({ followedArtists: 'none' })).message).toBe(
      'Die Liste gefolgter Künstler ist ungültig.'
    )
  })

  it('accepts absent optional sections', () => {
    expect(() => validateBackupData(minimalBackup())).not.toThrow()
  })
})

describe('validateBackupData (playlists)', () => {
  const withPlaylist = (playlist: unknown): Record<string, unknown> =>
    minimalBackup({ playlists: [playlist] })

  it('rejects a playlist that is not an object', () => {
    expect(expectDataError(withPlaylist('nope')).message).toBe('Playlist 1 ist kein gültiger Eintrag.')
  })

  it('rejects a playlist without an id', () => {
    expect(expectDataError(withPlaylist({ name: 'X', tracks: {} })).message).toBe(
      'Playlist 1 hat keine gültige ID.'
    )
  })

  it('rejects a playlist without a name', () => {
    expect(expectDataError(withPlaylist({ id: 'p1', tracks: {} })).message).toBe(
      'Playlist 1 hat keinen gültigen Namen.'
    )
  })

  it('rejects a playlist without track data', () => {
    expect(expectDataError(withPlaylist({ id: 'p1', name: 'Mix' })).message).toBe(
      'Playlist "Mix" enthält keine Track-Daten.'
    )
  })

  it('rejects a non-array item list', () => {
    expect(
      expectDataError(withPlaylist({ id: 'p1', name: 'Mix', tracks: { items: {} } })).message
    ).toBe('Die Track-Liste der Playlist "Mix" ist ungültig.')
  })

  it('names the position of an unknown track entry', () => {
    const error = expectDataError(
      withPlaylist({ id: 'p1', name: 'Mix', tracks: { items: [{ id: 'a' }, 42] } })
    )
    expect(error.message).toBe('Track 2 der Playlist "Mix" hat ein unbekanntes Format.')
  })

  it('accepts a playlist without loaded items', () => {
    expect(() => validateBackupData(withPlaylist({ id: 'p1', name: 'Mix', tracks: { total: 5 } }))).not.toThrow()
  })

  it('accepts 2.0 (bare track), 2.1 (item) and saved (track) entries', () => {
    const items = [{ id: 'a' }, { item: { id: 'b' } }, { track: { id: 'c' } }]
    expect(() =>
      validateBackupData(withPlaylist({ id: 'p1', name: 'Mix', tracks: { items } }))
    ).not.toThrow()
  })

  it('reports the index of the failing playlist', () => {
    const data = minimalBackup({
      playlists: [{ id: 'p1', name: 'Ok', tracks: {} }, { id: '', name: 'Bad', tracks: {} }]
    })
    expect(expectDataError(data).message).toBe('Playlist 2 hat keine gültige ID.')
  })
})

describe('validateBackupData (saved tracks)', () => {
  it('rejects an unknown saved track entry and names its position', () => {
    const data = minimalBackup({ savedTracks: [{ track: { id: 'a' } }, null] })
    expect(expectDataError(data).message).toBe(
      'Der gespeicherte Titel 2 hat ein unbekanntes Format.'
    )
  })

  it('accepts saved tracks in both shapes', () => {
    const data = minimalBackup({ savedTracks: [{ track: { id: 'a' } }, { id: 'b' }] })
    expect(() => validateBackupData(data)).not.toThrow()
  })
})

describe('error messages', () => {
  it('are German sentences for every rejection path', () => {
    const cases: unknown[] = [
      [],
      minimalBackup({ version: '1.0' }),
      minimalBackup({ user: undefined }),
      minimalBackup({ playlists: undefined }),
      minimalBackup({ savedTracks: undefined })
    ]
    cases.forEach(value => {
      const error = expectDataError(value)
      expect(isGerman(error.message)).toBe(true)
      expect(typeof error.code).toBe('string')
    })
  })
})
