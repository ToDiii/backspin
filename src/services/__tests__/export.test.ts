import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { normalizeBackup } from '@/services/backup-format'
import {
  LIKED_SONGS_NAME,
  backupFileName,
  buildAlbumsCsv,
  buildArtistsCsv,
  buildCsv,
  buildCsvZip,
  buildJson,
  buildM3u,
  buildM3uZip,
  hasExtraCsvSections,
  likedSongsPlaylist,
  sanitizeFileName
} from '@/services/export'
import {
  makeAlbum,
  makeArtist,
  makeBackup,
  makeEpisode,
  makeItem,
  makePlaylist,
  makeSavedAlbum,
  makeSavedTrack,
  makeTrack,
  makeTracks
} from '@/test/fixtures'
import type { BackupData } from '@/types'

const BOM = '﻿'

const csvLines = (csv: string): string[] => {
  expect(csv.startsWith(BOM)).toBe(true)
  return csv.slice(BOM.length).replace(/\r\n$/, '').split('\r\n')
}

const zipNames = async (blob: Blob): Promise<string[]> => {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return Object.keys(zip.files).sort()
}

describe('buildCsv', () => {
  it('starts with a UTF-8 BOM so Excel detects the encoding', () => {
    expect(buildCsv(makeBackup()).startsWith(BOM)).toBe(true)
  })

  it('writes the documented header columns', () => {
    expect(csvLines(buildCsv(makeBackup()))[0]).toBe(
      '"playlist","track","artists","album","duration_s","added_at","is_local","uri","isrc"'
    )
  })

  it('separates rows with CRLF and ends with one', () => {
    const backup = makeBackup({
      playlists: [makePlaylist({ tracks: { total: 1, items: [makeItem(makeTrack())] } })]
    })
    const csv = buildCsv(backup)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(2)
  })

  it('quotes every field (RFC 4180)', () => {
    const backup = makeBackup({
      playlists: [makePlaylist({ tracks: { total: 1, items: [makeItem(makeTrack())] } })]
    })
    const row = csvLines(buildCsv(backup))[1]
    expect(row.startsWith('"')).toBe(true)
    expect(row.endsWith('"')).toBe(true)
    expect(row.split('","')).toHaveLength(9)
  })

  it('doubles inner quotes', () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({
          name: 'Best of "Rock"',
          tracks: { total: 1, items: [makeItem(makeTrack({ name: 'He said "hi"' }))] }
        })
      ]
    })
    const row = csvLines(buildCsv(backup))[1]
    expect(row).toContain('"Best of ""Rock"""')
    expect(row).toContain('"He said ""hi"""')
  })

  it('keeps commas and newlines inside the quoted field', () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({ tracks: { total: 1, items: [makeItem(makeTrack({ name: 'a,b\nc' }))] } })
      ]
    })
    expect(buildCsv(backup)).toContain('"a,b\nc"')
  })

  it.each(['=cmd', '+1', '-1', '@SUM(A1)', '\tlead'])(
    'prefixes the formula trigger %j against CSV injection',
    value => {
      const backup = makeBackup({
        playlists: [
          makePlaylist({ tracks: { total: 1, items: [makeItem(makeTrack({ name: value }))] } })
        ]
      })
      expect(buildCsv(backup)).toContain(`"'${value}"`)
    }
  )

  it('leaves harmless values untouched', () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({ tracks: { total: 1, items: [makeItem(makeTrack({ name: 'Normal' }))] } })
      ]
    })
    expect(buildCsv(backup)).toContain('"Normal"')
    expect(buildCsv(backup)).not.toContain('"\'Normal"')
  })

  it('normalises added_at to an ISO timestamp', () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({
          tracks: { total: 1, items: [makeItem(makeTrack(), { added_at: '2023-05-01T10:00:00Z' })] }
        })
      ]
    })
    expect(csvLines(buildCsv(backup))[1]).toContain('"2023-05-01T10:00:00.000Z"')
  })

  it('keeps an unparsable added_at verbatim and an empty one empty', () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({
          tracks: {
            total: 2,
            items: [
              makeItem(makeTrack({ id: 'a' }), { added_at: 'not-a-date' }),
              makeItem(makeTrack({ id: 'b' }), { added_at: null })
            ]
          }
        })
      ]
    })
    const rows = csvLines(buildCsv(backup))
    expect(rows[1]).toContain('"not-a-date"')
    expect(rows[2].split(',')[5]).toBe('""')
  })

  it('writes is_local as true or false', () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({
          tracks: {
            total: 2,
            items: [
              makeItem(makeTrack({ id: 'a' }), { is_local: true }),
              makeItem(makeTrack({ id: 'b' }))
            ]
          }
        })
      ]
    })
    const rows = csvLines(buildCsv(backup))
    expect(rows[1].split(',')[6]).toBe('"true"')
    expect(rows[2].split(',')[6]).toBe('"false"')
  })

  it('converts the duration to whole seconds', () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({
          tracks: { total: 1, items: [makeItem(makeTrack({ duration_ms: 210999 }))] }
        })
      ]
    })
    expect(csvLines(buildCsv(backup))[1]).toContain('"210"')
  })

  it('joins multiple artists with a comma', () => {
    const track = makeTrack({ artists: [makeArtist(), makeArtist({ id: 'a2', name: 'Artist Two' })] })
    const backup = makeBackup({
      playlists: [makePlaylist({ tracks: { total: 1, items: [makeItem(track)] } })]
    })
    expect(csvLines(buildCsv(backup))[1]).toContain('"Artist One, Artist Two"')
  })

  it('skips entries whose item is null', () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({ tracks: { total: 2, items: [makeItem(null), makeItem(makeTrack())] } })
      ]
    })
    expect(csvLines(buildCsv(backup))).toHaveLength(2)
  })

  it('writes episodes without artists and album', () => {
    const backup = makeBackup({
      playlists: [makePlaylist({ tracks: { total: 1, items: [makeItem(makeEpisode())] } })]
    })
    const fields = csvLines(buildCsv(backup))[1].split(',')
    expect(fields[1]).toBe('"Episode One"')
    expect(fields[2]).toBe('""')
    expect(fields[3]).toBe('""')
    expect(fields[7]).toBe('"spotify:episode:episode-1"')
  })

  it('writes the ISRC as the last column', () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({
          tracks: {
            total: 1,
            items: [makeItem(makeTrack({ external_ids: { isrc: 'GBAYE0601498' } }))]
          }
        })
      ]
    })
    expect(csvLines(buildCsv(backup))[1].split(',')[8]).toBe('"GBAYE0601498"')
  })

  it('fills the ISRC of a 2.1 backup that already carried the field', () => {
    // The field was never filtered out of the API response, so an older file usually
    // holds it already. Reading it must depend on the data, not on the format version.
    const raw: BackupData = {
      ...makeBackup({
        playlists: [
          makePlaylist({
            tracks: {
              total: 1,
              items: [makeItem(makeTrack({ external_ids: { isrc: 'GBAYE0601498' } }))]
            }
          })
        ],
        savedTracks: [makeSavedTrack(makeTrack({ external_ids: { isrc: 'USRC17607839' } }))]
      }),
      version: '2.1'
    }
    const rows = csvLines(buildCsv(normalizeBackup(raw)))
    expect(rows[1].split(',')[8]).toBe('"GBAYE0601498"')
    expect(rows[2].split(',')[8]).toBe('"USRC17607839"')
  })

  it('leaves the ISRC empty when the data carries no external_ids', () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({
          tracks: { total: 1, items: [makeItem(makeTrack({ external_ids: undefined }))] }
        })
      ]
    })
    expect(csvLines(buildCsv(backup))[1].split(',')[8]).toBe('""')
  })

  it('leaves the ISRC empty for a local file', () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({
          tracks: {
            total: 1,
            items: [
              makeItem(makeTrack({ id: 'local', external_ids: undefined }), { is_local: true })
            ]
          }
        })
      ]
    })
    const fields = csvLines(buildCsv(backup))[1].split(',')
    expect(fields[6]).toBe('"true"')
    expect(fields[8]).toBe('""')
  })

  it('leaves the ISRC empty for an episode', () => {
    const backup = makeBackup({
      playlists: [makePlaylist({ tracks: { total: 1, items: [makeItem(makeEpisode())] } })]
    })
    expect(csvLines(buildCsv(backup))[1].split(',')[8]).toBe('""')
  })

  it('carries the ISRC of a saved track into the Liked Songs rows', () => {
    const backup = makeBackup({
      savedTracks: [makeSavedTrack(makeTrack({ external_ids: { isrc: 'USRC17607839' } }))]
    })
    expect(csvLines(buildCsv(backup))[1].split(',')[8]).toBe('"USRC17607839"')
  })

  it('appends saved tracks as rows of the synthetic Liked Songs playlist', () => {
    const backup = makeBackup({
      playlists: [makePlaylist({ tracks: { total: 1, items: [makeItem(makeTrack())] } })],
      savedTracks: [makeSavedTrack(makeTrack({ id: 'saved', name: 'Saved Song' }))]
    })
    const rows = csvLines(buildCsv(backup))
    expect(rows).toHaveLength(3)
    expect(rows[2]).toContain(`"${LIKED_SONGS_NAME}"`)
    expect(rows[2]).toContain('"Saved Song"')
  })

  it('carries the added_at of a saved track', () => {
    const backup = makeBackup({
      savedTracks: [makeSavedTrack(makeTrack(), '2022-11-05T08:30:00Z')]
    })
    expect(csvLines(buildCsv(backup))[1]).toContain('"2022-11-05T08:30:00.000Z"')
  })

  it('falls back to the external URL when a track has no uri', () => {
    const track = makeTrack({ uri: '' })
    const backup = makeBackup({
      playlists: [makePlaylist({ tracks: { total: 1, items: [makeItem(track)] } })]
    })
    expect(csvLines(buildCsv(backup))[1]).toContain('"https://open.spotify.com/track/track-1"')
  })
})

describe('likedSongsPlaylist', () => {
  it('returns null without saved tracks', () => {
    expect(likedSongsPlaylist(makeBackup())).toBeNull()
  })

  it('maps saved tracks to playlist items', () => {
    const playlist = likedSongsPlaylist(makeBackup({ savedTracks: [makeSavedTrack()] }))
    expect(playlist?.name).toBe(LIKED_SONGS_NAME)
    expect(playlist?.tracks.total).toBe(1)
    expect(playlist?.tracks.items?.[0].is_local).toBe(false)
  })
})

describe('buildAlbumsCsv / buildArtistsCsv', () => {
  it('writes the album columns with a BOM', () => {
    const csv = buildAlbumsCsv(makeBackup({ savedAlbums: [makeSavedAlbum()] }))
    const rows = csvLines(csv)
    expect(rows[0]).toBe('"album","artists","release_date","total_tracks","added_at","uri","upc"')
    expect(rows[1]).toBe(
      '"Album One","Artist One","2020-01-01","10","2023-01-01T00:00:00.000Z","spotify:album:album-1","00602557000001"'
    )
  })

  it('writes the UPC as the last album column', () => {
    const album = makeAlbum({ external_ids: { upc: '00602537540723' } })
    const rows = csvLines(buildAlbumsCsv(makeBackup({ savedAlbums: [makeSavedAlbum(album)] })))
    expect(rows[1].split(',')[6]).toBe('"00602537540723"')
  })

  it('leaves the UPC empty when the data carries no external_ids', () => {
    const album = makeAlbum({ external_ids: undefined })
    const rows = csvLines(buildAlbumsCsv(makeBackup({ savedAlbums: [makeSavedAlbum(album)] })))
    expect(rows[1].split(',')[6]).toBe('""')
  })

  it('writes only the header when there are no albums', () => {
    expect(csvLines(buildAlbumsCsv(makeBackup()))).toHaveLength(1)
  })

  it('writes artist genres joined by a comma', () => {
    const artist = makeArtist({ genres: ['rock', 'indie'] })
    const rows = csvLines(buildArtistsCsv(makeBackup({ followedArtists: [artist] })))
    expect(rows[0]).toBe('"artist","genres","uri"')
    expect(rows[1]).toBe('"Artist One","rock, indie","spotify:artist:artist-1"')
  })

  it('falls back to the external URL when an artist has no uri', () => {
    const artist = makeArtist({ uri: undefined })
    expect(csvLines(buildArtistsCsv(makeBackup({ followedArtists: [artist] })))[1]).toContain(
      'https://open.spotify.com/artist/artist-1'
    )
  })
})

describe('buildM3u', () => {
  it('writes the extended M3U header and the playlist name', () => {
    const lines = buildM3u(makePlaylist({ name: 'My Mix' })).split('\n')
    expect(lines[0]).toBe('#EXTM3U')
    expect(lines[1]).toBe('#PLAYLIST:My Mix')
  })

  it('collapses newlines in the playlist name', () => {
    expect(buildM3u(makePlaylist({ name: 'Line\nBreak' }))).toContain('#PLAYLIST:Line Break')
  })

  it('writes an EXTINF line with duration and "artists - title"', () => {
    const playlist = makePlaylist({
      tracks: { total: 1, items: [makeItem(makeTrack({ duration_ms: 185000 }))] }
    })
    const lines = buildM3u(playlist).split('\n')
    expect(lines[2]).toBe('#EXTINF:185,Artist One - Track One')
    expect(lines[3]).toBe('https://open.spotify.com/track/track-1')
  })

  it('skips local files', () => {
    const playlist = makePlaylist({
      tracks: {
        total: 2,
        items: [
          makeItem(makeTrack({ id: 'local', name: 'Local File' }), { is_local: true }),
          makeItem(makeTrack())
        ]
      }
    })
    const m3u = buildM3u(playlist)
    expect(m3u).not.toContain('Local File')
    expect(m3u.split('\n').filter(line => line.startsWith('#EXTINF'))).toHaveLength(1)
  })

  it('skips entries without an item', () => {
    const playlist = makePlaylist({ tracks: { total: 1, items: [makeItem(null)] } })
    expect(buildM3u(playlist).split('\n').filter(Boolean)).toHaveLength(2)
  })

  it('uses the episode URL for episodes', () => {
    const playlist = makePlaylist({ tracks: { total: 1, items: [makeItem(makeEpisode())] } })
    expect(buildM3u(playlist)).toContain('https://open.spotify.com/episode/episode-1')
  })

  it('omits the artist prefix for episodes', () => {
    const playlist = makePlaylist({ tracks: { total: 1, items: [makeItem(makeEpisode())] } })
    expect(buildM3u(playlist)).toContain('#EXTINF:1800,Episode One')
  })

  it('ends with a trailing newline', () => {
    expect(buildM3u(makePlaylist()).endsWith('\n')).toBe(true)
  })
})

describe('sanitizeFileName', () => {
  it.each(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])(
    'removes the forbidden character %j',
    char => {
      expect(sanitizeFileName(`a${char}b`)).toBe('ab')
    }
  )

  it('replaces line breaks with a space', () => {
    expect(sanitizeFileName('Rock\nRoll')).toBe('Rock Roll')
  })

  it('collapses repeated whitespace and trims', () => {
    expect(sanitizeFileName('  Rock   Roll  ')).toBe('Rock Roll')
  })

  it('removes control characters', () => {
    expect(sanitizeFileName('abc')).toBe('abc')
  })

  it('strips trailing dots (Windows)', () => {
    expect(sanitizeFileName('Playlist...')).toBe('Playlist')
  })

  it('truncates to 100 characters', () => {
    expect(sanitizeFileName('x'.repeat(250))).toHaveLength(100)
  })

  it('falls back to "Playlist" for an empty result', () => {
    expect(sanitizeFileName('   ')).toBe('Playlist')
    expect(sanitizeFileName('///')).toBe('Playlist')
  })

  it('keeps unicode characters', () => {
    expect(sanitizeFileName('Grüße – 音楽')).toBe('Grüße – 音楽')
  })
})

describe('buildM3uZip', () => {
  it('writes one .m3u8 file per playlist', async () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({ id: 'a', name: 'First', tracks: { total: 1, items: [makeItem(makeTrack())] } }),
        makePlaylist({ id: 'b', name: 'Second', tracks: { total: 1, items: [makeItem(makeTrack())] } })
      ]
    })
    expect(await zipNames(await buildM3uZip(backup))).toEqual(['First.m3u8', 'Second.m3u8'])
  })

  it('sanitises the playlist name for the archive entry', async () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({ name: 'AC/DC: Best?', tracks: { total: 1, items: [makeItem(makeTrack())] } })
      ]
    })
    expect(await zipNames(await buildM3uZip(backup))).toEqual(['ACDC Best.m3u8'])
  })

  it('deduplicates identical names with a counter suffix', async () => {
    const items = { total: 1, items: [makeItem(makeTrack())] }
    const backup = makeBackup({
      playlists: [
        makePlaylist({ id: 'a', name: 'Same', tracks: items }),
        makePlaylist({ id: 'b', name: 'Same', tracks: items }),
        makePlaylist({ id: 'c', name: 'same', tracks: items })
      ]
    })
    // The counter compares case insensitively but keeps the original spelling
    expect(await zipNames(await buildM3uZip(backup))).toEqual([
      'Same (2).m3u8',
      'Same.m3u8',
      'same (3).m3u8'
    ])
  })

  it('skips empty playlists', async () => {
    const backup = makeBackup({
      playlists: [
        makePlaylist({ id: 'a', name: 'Empty', tracks: { total: 0, items: [] } }),
        makePlaylist({ id: 'b', name: 'Full', tracks: { total: 1, items: [makeItem(makeTrack())] } })
      ]
    })
    expect(await zipNames(await buildM3uZip(backup))).toEqual(['Full.m3u8'])
  })

  it('adds Liked Songs as its own file', async () => {
    const backup = makeBackup({ savedTracks: [makeSavedTrack()] })
    expect(await zipNames(await buildM3uZip(backup))).toEqual(['Liked Songs.m3u8'])
  })
})

describe('buildCsvZip', () => {
  it('contains only tracks.csv without extra sections', async () => {
    expect(await zipNames(await buildCsvZip(makeBackup()))).toEqual(['tracks.csv'])
  })

  it('adds albums.csv and artists.csv when present', async () => {
    const backup = makeBackup({
      savedAlbums: [makeSavedAlbum()],
      followedArtists: [makeArtist()]
    })
    expect(await zipNames(await buildCsvZip(backup))).toEqual([
      'albums.csv',
      'artists.csv',
      'tracks.csv'
    ])
  })

  it('adds only albums.csv when there are no followed artists', async () => {
    const backup = makeBackup({ savedAlbums: [makeSavedAlbum(makeAlbum())] })
    expect(await zipNames(await buildCsvZip(backup))).toEqual(['albums.csv', 'tracks.csv'])
  })
})

describe('hasExtraCsvSections', () => {
  it('is false for a backup with tracks only', () => {
    expect(hasExtraCsvSections(makeBackup())).toBe(false)
  })

  it('is true with saved albums or followed artists', () => {
    expect(hasExtraCsvSections(makeBackup({ savedAlbums: [makeSavedAlbum()] }))).toBe(true)
    expect(hasExtraCsvSections(makeBackup({ followedArtists: [makeArtist()] }))).toBe(true)
  })
})

describe('buildJson / backupFileName', () => {
  it('writes indented JSON that parses back', () => {
    const backup = makeBackup({ playlists: [makePlaylist()] })
    const json = buildJson(backup)
    expect(json).toContain('\n  "version"')
    expect(JSON.parse(json)).toEqual(backup)
  })

  it('builds a dated file name', () => {
    expect(backupFileName('json', new Date('2024-03-01T12:00:00Z'))).toBe(
      'backspin-2024-03-01.json'
    )
  })

  it('handles large playlists without dropping rows', () => {
    const items = makeTracks(150).map(track => makeItem(track))
    const backup = makeBackup({
      playlists: [makePlaylist({ tracks: { total: items.length, items } })]
    })
    expect(csvLines(buildCsv(backup))).toHaveLength(151)
  })
})
