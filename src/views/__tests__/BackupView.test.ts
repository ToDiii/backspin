import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BackupView from '@/views/BackupView.vue'
import { useAuthStore } from '@/stores/auth'
import { useBackupStore } from '@/stores/backup'
import type { BackupRunResult, SpotifyPlaylist } from '@/types'
import {
  makeBackup,
  makeItem,
  makeMetadata,
  makePlaylist,
  makeTrack,
  makeUser
} from '@/test/fixtures'

const push = vi.fn()

// The view and useSpotifyAuth both call useRouter; router-link is stubbed on mount.
vi.mock('vue-router', () => ({
  useRouter: () => ({ push })
}))

const mountView = (): VueWrapper => mount(BackupView, {
  global: {
    stubs: {
      RouterLink: { template: '<a><slot /></a>' }
    }
  }
})

/** A playlist whose reported size is larger than what was actually loaded. */
const partialPlaylist = (id: string, name: string, total: number, loaded: number): SpotifyPlaylist =>
  makePlaylist({
    id,
    name,
    tracks: {
      total,
      items: Array.from({ length: loaded }, (_value, index) =>
        makeItem(makeTrack({ id: `${id}-track-${index}` }))
      )
    }
  })

const makeRunResult = (overrides: Partial<BackupRunResult> = {}): BackupRunResult => ({
  finishedAt: '2024-03-01T12:00:00.000Z',
  loadedPlaylists: 1,
  failedPlaylistNames: [],
  errors: [],
  ...overrides
})

beforeEach(() => {
  push.mockReset()
  setActivePinia(createPinia())
  useAuthStore().login(makeUser(), 'access-token', 'refresh-token', 3600)
})

describe('BackupView result card', () => {
  it('is absent before the first run', () => {
    expect(mountView().find('[data-testid="backup-result"]').exists()).toBe(false)
  })

  it('reports a complete run without a failure list', () => {
    useBackupStore().setLastRunResult(makeRunResult({ loadedPlaylists: 3 }))

    const wrapper = mountView()
    const card = wrapper.get('[data-testid="backup-result"]')

    expect(card.text()).toContain('Backup vollständig')
    expect(card.get('[data-testid="loaded-playlists"]').text()).toBe('3')
    expect(card.get('[data-testid="failed-playlists"]').text()).toBe('0')
    expect(wrapper.find('[data-testid="failed-playlist-names"]').exists()).toBe(false)
  })

  it('renders the card after a run with errors and names the failed playlists', async () => {
    useBackupStore().setLastRunResult(makeRunResult({
      loadedPlaylists: 109,
      failedPlaylistNames: ['Abonnierter Mix', 'Fremde Sammlung'],
      errors: [
        'Playlist "Abonnierter Mix": Forbidden (HTTP 403)',
        'Playlist "Fremde Sammlung": Forbidden (HTTP 403)'
      ]
    }))

    const wrapper = mountView()
    const card = wrapper.get('[data-testid="backup-result"]')

    expect(card.text()).toContain('Backup unvollständig')
    expect(card.get('[data-testid="loaded-playlists"]').text()).toBe('109')
    expect(card.get('[data-testid="failed-playlists"]').text()).toBe('2')
    // The hint has to explain that subscribed playlists of other users are the usual cause
    expect(card.text()).toContain('abonnierte fremde Playlists')

    // The list is collapsed until the user opens it
    expect(wrapper.find('[data-testid="failed-playlist-names"]').exists()).toBe(false)
    await card.get('button').trigger('click')

    const names = wrapper.get('[data-testid="failed-playlist-names"]')
    expect(names.text()).toContain('Abonnierter Mix')
    expect(names.text()).toContain('Fremde Sammlung')
  })

  it('mentions metadata.errors when only a section failed', () => {
    useBackupStore().setLastRunResult(makeRunResult({
      errors: ['Gespeicherte Songs: Forbidden (HTTP 403)']
    }))

    const card = mountView().get('[data-testid="backup-result"]')

    expect(card.text()).toContain('Backup unvollständig')
    expect(card.text()).toContain('metadata.errors')
  })
})

describe('BackupView track counts', () => {
  it('counts the loaded items, not the playlist size reported by Spotify', () => {
    const backupStore = useBackupStore()
    const playlists = [
      partialPlaylist('p1', 'Eigene Playlist', 2, 2),
      // A failed playlist: Spotify reports 87 tracks, none of them are in the backup
      partialPlaylist('p2', 'Abonnierter Mix', 87, 0)
    ]
    backupStore.setBackupData(makeBackup({
      playlists,
      metadata: makeMetadata({ totalPlaylists: 2, totalTracks: 2, totalSavedTracks: 5 })
    }))

    const wrapper = mountView()

    // Summing tracks.total would render 89 here and 94 as the exportable total
    expect(wrapper.text()).toContain('2 in eigenen Playlists')
    expect(wrapper.text()).not.toContain('89 in eigenen Playlists')
    expect(wrapper.get('[data-testid="exportable-tracks"]').text()).toBe('7')
  })

  it('ignores playlists owned by someone else', () => {
    const backupStore = useBackupStore()
    backupStore.setBackupData(makeBackup({
      playlists: [
        partialPlaylist('p1', 'Eigene Playlist', 3, 3),
        makePlaylist({
          id: 'p2',
          name: 'Fremde Playlist',
          owner: { id: 'other-user', display_name: 'Other' },
          tracks: { total: 40, items: [makeItem(makeTrack({ id: 'x' }))] }
        })
      ],
      metadata: makeMetadata({ totalPlaylists: 2, totalTracks: 4, totalSavedTracks: 0 })
    }))

    const wrapper = mountView()

    expect(wrapper.get('[data-testid="own-playlists"]').text()).toBe('1')
    expect(wrapper.text()).toContain('3 in eigenen Playlists')
    expect(wrapper.get('[data-testid="exportable-tracks"]').text()).toBe('3')
  })
})
