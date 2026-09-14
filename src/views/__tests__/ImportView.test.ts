import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ImportView from '@/views/ImportView.vue'
import { useAuthStore } from '@/stores/auth'
import { useImportStore } from '@/stores/import'
import type { ImportResult } from '@/types'
import { makeUser } from '@/test/fixtures'

// The view only needs a router for the auth composable; navigation is not exercised here
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

const makeResult = (overrides: Partial<ImportResult> = {}): ImportResult => ({
  cancelled: false,
  playlistsCreated: 2,
  playlistsSkipped: 0,
  tracksAdded: 12,
  tracksSkipped: 0,
  savedTracksAdded: 3,
  savedAlbumsAdded: 1,
  artistsFollowed: 4,
  errors: [],
  ...overrides
})

const mountView = () =>
  mount(ImportView, {
    global: {
      stubs: { 'router-link': true }
    }
  })

const signIn = () => {
  const authStore = useAuthStore()
  authStore.setClientId('client-1')
  authStore.login(makeUser(), 'access-token', 'refresh-token', 3600)
}

beforeEach(() => {
  setActivePinia(createPinia())
  signIn()
})

describe('ImportView (entering the route)', () => {
  it('starts at the file picker even when a previous result is still in the store', () => {
    const store = useImportStore()
    store.state.results = makeResult()
    store.state.currentOperation = 'Import abgeschlossen'
    store.state.progress = 100

    const wrapper = mountView()

    expect(wrapper.find('[data-testid="import-result"]').exists()).toBe(false)
    expect(wrapper.find('#backupFile').exists()).toBe(true)
    expect(store.results).toBeNull()
    expect(store.progress).toBe(0)
  })

  it('keeps a running import on screen', () => {
    const store = useImportStore()
    store.state.isImporting = true
    store.state.results = makeResult()
    store.state.progress = 42
    store.state.currentOperation = 'Playlist "First" wird angelegt...'

    const wrapper = mountView()

    expect(wrapper.find('.progress-bar').exists()).toBe(true)
    expect(wrapper.text()).toContain('Schritt 3: Import läuft')
    expect(wrapper.text()).toContain('Playlist "First" wird angelegt...')
    expect(wrapper.find('#backupFile').exists()).toBe(false)
    expect(store.results).not.toBeNull()
    expect(store.progress).toBe(42)
  })
})

describe('ImportView (result banner)', () => {
  it('celebrates a run that transferred something', async () => {
    const store = useImportStore()
    const wrapper = mountView()

    store.state.results = makeResult()
    store.state.currentOperation = 'Import abgeschlossen'
    await wrapper.vm.$nextTick()

    const banner = wrapper.find('[data-testid="result-banner"]')
    expect(banner.classes()).toContain('status-success')
    expect(banner.text()).toBe(
      '2 Playlist(s), 12 Titel, 3 gespeicherte Songs, 1 gespeicherte Alben, 4 gefolgte Künstler.'
    )
  })

  it('warns instead of reporting nothing to do when there were hints', async () => {
    const store = useImportStore()
    const wrapper = mountView()

    store.state.results = makeResult({
      playlistsCreated: 0,
      tracksAdded: 0,
      savedTracksAdded: 0,
      savedAlbumsAdded: 0,
      artistsFollowed: 0,
      errors: ['Playlist "First": Server kaputt (HTTP 500)']
    })
    await wrapper.vm.$nextTick()

    const banner = wrapper.find('[data-testid="result-banner"]')
    expect(banner.classes()).toContain('status-warning')
    expect(banner.text()).toBe('Es wurde nichts übertragen.')
  })

  it('names an abort that transferred nothing as an abort', async () => {
    const store = useImportStore()
    const wrapper = mountView()

    store.state.results = makeResult({
      cancelled: true,
      playlistsCreated: 0,
      tracksAdded: 0,
      savedTracksAdded: 0,
      savedAlbumsAdded: 0,
      artistsFollowed: 0
    })
    store.state.currentOperation = 'Import abgebrochen'
    await wrapper.vm.$nextTick()

    const banner = wrapper.find('[data-testid="result-banner"]')
    expect(banner.classes()).toContain('status-warning')
    expect(banner.text()).toBe('Bis zum Abbruch wurde nichts übertragen.')
    expect(banner.text()).not.toContain('bereits vorhanden')
  })

  it('names what an abort transferred before it stopped', async () => {
    const store = useImportStore()
    const wrapper = mountView()

    store.state.results = makeResult({
      cancelled: true,
      playlistsCreated: 1,
      tracksAdded: 100,
      savedTracksAdded: 0,
      savedAlbumsAdded: 0,
      artistsFollowed: 0
    })
    store.state.currentOperation = 'Import abgebrochen'
    await wrapper.vm.$nextTick()

    const banner = wrapper.find('[data-testid="result-banner"]')
    expect(banner.classes()).toContain('status-warning')
    expect(banner.text()).toBe('Bis zum Abbruch übertragen: 1 Playlist(s), 100 Titel.')
    expect(banner.text()).not.toContain('bereits vorhanden')
  })

  it('says that there was nothing to do when nothing was written', async () => {
    const store = useImportStore()
    const wrapper = mountView()

    store.state.results = makeResult({
      playlistsCreated: 0,
      tracksAdded: 0,
      savedTracksAdded: 0,
      savedAlbumsAdded: 0,
      artistsFollowed: 0
    })
    store.state.currentOperation = 'Nichts zu tun'
    await wrapper.vm.$nextTick()

    const banner = wrapper.find('[data-testid="result-banner"]')
    expect(banner.classes()).toContain('status-info')
    expect(banner.text()).toContain('nichts zu tun')
    expect(banner.text()).toContain('bereits vorhanden')
  })
})
