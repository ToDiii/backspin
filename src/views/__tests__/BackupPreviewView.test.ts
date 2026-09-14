import { describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createMemoryHistory, createRouter } from 'vue-router'
import BackupPreviewView from '@/views/BackupPreviewView.vue'
import { useBackupStore } from '@/stores/backup'
import {
  makeArtists,
  makeBackup,
  makeSavedAlbums,
  makeSavedTrack,
  makeTracks
} from '@/test/fixtures'
import type { BackupData } from '@/types'

/** A catch-all route keeps every `router-link` in the view resolvable. */
const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', name: 'any', component: { template: '<div />' } }]
  })

const mountPreview = async (backup: BackupData | null) => {
  const pinia = createTestingPinia({ createSpy: vi.fn })
  const router = makeRouter()

  const backupStore = useBackupStore(pinia)
  backupStore.state.backupData = backup

  const wrapper = mount(BackupPreviewView, { global: { plugins: [pinia, router] } })
  await router.isReady()
  return wrapper
}

/** Text of the filter option whose label matches, so counts are checked in their own row. */
const optionText = (wrapper: VueWrapper, label: string): string => {
  const option = wrapper.findAll('label').find(candidate => candidate.text().includes(label))
  return option ? option.text() : ''
}

describe('BackupPreviewView content counts', () => {
  it('shows the number of saved albums and followed artists', async () => {
    const wrapper = await mountPreview(
      makeBackup({
        savedAlbums: makeSavedAlbums(17),
        followedArtists: makeArtists(68)
      })
    )

    expect(optionText(wrapper, 'Gespeicherte Alben')).toContain('17 im Backup')
    expect(optionText(wrapper, 'Gefolgte Künstler')).toContain('68 im Backup')
  })

  it('shows the number of saved tracks in the same wording', async () => {
    const wrapper = await mountPreview(
      makeBackup({ savedTracks: makeTracks(4).map(track => makeSavedTrack(track)) })
    )

    expect(optionText(wrapper, 'Gespeicherte Songs')).toContain('4 im Backup')
  })

  it('shows zero for library sections the backup does not contain', async () => {
    const wrapper = await mountPreview(makeBackup())

    expect(optionText(wrapper, 'Gespeicherte Songs')).toContain('0 im Backup')
    expect(optionText(wrapper, 'Gespeicherte Alben')).toContain('0 im Backup')
    expect(optionText(wrapper, 'Gefolgte Künstler')).toContain('0 im Backup')
  })

  it('leaves the playlist filters without a count', async () => {
    const wrapper = await mountPreview(makeBackup({ savedAlbums: makeSavedAlbums(17) }))

    expect(optionText(wrapper, 'Nur eigene Playlists')).not.toContain('im Backup')
    expect(optionText(wrapper, 'Metadaten')).not.toContain('im Backup')
  })
})
