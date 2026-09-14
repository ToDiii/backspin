import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CallbackView from '@/views/CallbackView.vue'
import { SpotifyAuthError } from '@/services/auth-errors'

const handleCallback = vi.fn<(code: string, state: string | null) => Promise<void>>()

// The real composable would talk to Spotify; the view only needs its result.
vi.mock('@/composables/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({ handleCallback })
}))

const mountCallback = async (query: string): Promise<VueWrapper> => {
  setActivePinia(createPinia())

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', name: 'any', component: { template: '<div />' } }]
  })
  await router.push(`/callback${query}`)
  await router.isReady()

  const wrapper = mount(CallbackView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  handleCallback.mockReset()
  handleCallback.mockResolvedValue()
})

describe('CallbackView on a refused authorization', () => {
  it('leads with the user list, the step people forget', async () => {
    const wrapper = await mountCallback('?error=access_denied')

    expect(wrapper.find('[data-testid="callback-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('User Management')
    expect(wrapper.text()).toContain('Development Mode')
  })

  it('also names the other possible cause instead of guessing', async () => {
    const wrapper = await mountCallback('?error=access_denied')
    expect(wrapper.text()).toMatch(/abgebrochen/)
  })

  it('offers the dashboard as a direct link', async () => {
    const wrapper = await mountCallback('?error=access_denied')

    const dashboard = wrapper.findAll('a').find(link => link.text().includes('Dashboard'))
    expect(dashboard?.attributes('href')).toBe('https://developer.spotify.com/dashboard')
  })

  it('sends the user back to the step about the user list', async () => {
    const wrapper = await mountCallback('?error=access_denied')

    const back = wrapper.findAll('a').find(link => link.text().includes('Zurück zum Setup'))
    expect(back?.attributes('href')).toBe('/setup?schritt=2')
  })

  it('lists something to check', async () => {
    const wrapper = await mountCallback('?error=access_denied')
    expect(wrapper.findAll('[data-testid="error-hints"] li').length).toBeGreaterThan(0)
  })
})

describe('CallbackView on other failures', () => {
  it('points at the client id when Spotify does not know the app', async () => {
    const wrapper = await mountCallback('?error=invalid_client')

    expect(wrapper.text()).toContain('Client ID')
    expect(wrapper.text()).not.toContain('Das behebt es fast immer')
  })

  it('goes back to the plain setup when the user list is not the suspect', async () => {
    const wrapper = await mountCallback('?error=invalid_client')

    const back = wrapper.findAll('a').find(link => link.text().includes('Zurück zum Setup'))
    expect(back?.attributes('href')).toBe('/setup')
  })

  it('reports a missing authorization code', async () => {
    const wrapper = await mountCallback('')
    expect(wrapper.find('[data-testid="error-title"]').text()).toMatch(/keinen Code/)
  })

  it('translates a failure thrown while exchanging the code', async () => {
    handleCallback.mockRejectedValue(new SpotifyAuthError('profile_forbidden', 'kein Profil'))

    const wrapper = await mountCallback('?code=abc&state=xyz')

    expect(wrapper.text()).toContain('User Management')
    expect(wrapper.text()).toContain('Premium')
  })

  it('keeps the raw code visible for a bug report', async () => {
    const wrapper = await mountCallback('?error=access_denied')
    expect(wrapper.text()).toContain('access_denied')
  })

  it('survives an error that carries no code at all', async () => {
    handleCallback.mockRejectedValue(new Error('Netzwerk weg'))

    const wrapper = await mountCallback('?code=abc&state=xyz')

    expect(wrapper.find('[data-testid="callback-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Netzwerk weg')
  })
})

describe('CallbackView on success', () => {
  it('shows the success state and hands the code to the composable', async () => {
    const wrapper = await mountCallback('?code=abc&state=xyz')

    expect(handleCallback).toHaveBeenCalledWith('abc', 'xyz')
    expect(wrapper.find('[data-testid="callback-error"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Anmeldung erfolgreich')
  })
})
