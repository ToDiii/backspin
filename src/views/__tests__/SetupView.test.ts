import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Router } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import SetupView from '@/views/SetupView.vue'
import { useAuthStore } from '@/stores/auth'

const VALID_CLIENT_ID = '0a1b2c3d4e5f60718293a4b5c6d7e8f9'

/**
 * The wizard reads the route query and renders router-links, so it mounts over
 * a real memory router. A catch-all keeps every link resolvable.
 */
const mountSetup = async (query = ''): Promise<{ wrapper: VueWrapper; router: Router }> => {
  setActivePinia(createPinia())

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', name: 'any', component: { template: '<div />' } }]
  })

  await router.push(`/setup${query}`)
  await router.isReady()

  const wrapper = mount(SetupView, { global: { plugins: [router] } })
  return { wrapper, router }
}

/** Clicks the "Weiter" button of the currently visible step. */
const goNext = async (wrapper: VueWrapper): Promise<void> => {
  const next = wrapper.findAll('button').find(button => button.text().includes('Weiter'))
  await next?.trigger('click')
}

const copyFieldValues = (wrapper: VueWrapper): Record<string, string> =>
  Object.fromEntries(
    wrapper.findAll<HTMLInputElement>('input[readonly]').map(input => [
      input.attributes('aria-label') ?? '',
      input.element.value
    ])
  )

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('SetupView step 1: creating the app', () => {
  it('names the dashboard fields exactly as they appear there', async () => {
    const { wrapper } = await mountSetup()
    const labels = Object.keys(copyFieldValues(wrapper))

    expect(labels).toEqual(['App name', 'App description', 'Website', 'Redirect URI'])
  })

  it('offers the redirect URI as a value that can be copied in one click', async () => {
    const { wrapper } = await mountSetup()
    const values = copyFieldValues(wrapper)

    expect(values['Redirect URI']).toBe(`${window.location.origin}/callback`)
    const copyButtons = wrapper.findAll('button').filter(button =>
      button.attributes('aria-label')?.endsWith('kopieren')
    )
    expect(copyButtons.map(button => button.attributes('aria-label'))).toContain('Redirect URI kopieren')
  })

  it('says that only the Web API checkbox is needed', async () => {
    const { wrapper } = await mountSetup()
    expect(wrapper.text()).toContain('Which API/SDKs are you planning to use?')
    expect(wrapper.text()).toContain('Web API')
  })

  it('warns that the redirect URI is compared character by character', async () => {
    const { wrapper } = await mountSetup()
    expect(wrapper.text()).toMatch(/zeichengenau/i)
  })

  it('states the Premium requirement up front', async () => {
    const { wrapper } = await mountSetup()
    expect(wrapper.text()).toContain('Spotify Premium')
  })
})

describe('SetupView step 2: adding yourself as a user', () => {
  it('explains the development mode restriction', async () => {
    const { wrapper } = await mountSetup()
    await goNext(wrapper)

    expect(wrapper.text()).toContain('Development Mode')
    expect(wrapper.text()).toContain('User Management')
  })

  it('blocks the next step until the entry is confirmed', async () => {
    const { wrapper } = await mountSetup()
    await goNext(wrapper)

    const next = wrapper.findAll('button').find(button => button.text().includes('Weiter'))
    expect(next?.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="user-added"]').setValue(true)
    expect(next?.attributes('disabled')).toBeUndefined()
  })

  it('insists on the mail address of the Spotify account', async () => {
    const { wrapper } = await mountSetup()
    await goNext(wrapper)

    expect(wrapper.text()).toMatch(/E-Mail-Adresse deines Spotify-Kontos/)
  })

  it('can be opened directly, which is where the callback error links to', async () => {
    const { wrapper } = await mountSetup('?schritt=2')
    expect(wrapper.text()).toContain('Dich selbst als Nutzer eintragen')
  })

  it('ignores a step outside the wizard', async () => {
    const { wrapper } = await mountSetup('?schritt=99')
    expect(wrapper.text()).toContain('Spotify App anlegen')
  })
})

describe('SetupView step 3: the client id', () => {
  const openClientIdStep = async (): Promise<VueWrapper> => {
    const { wrapper } = await mountSetup()
    await goNext(wrapper)
    await wrapper.find('[data-testid="user-added"]').setValue(true)
    await goNext(wrapper)
    return wrapper
  }

  it('accepts a well formed id and hands it to the store', async () => {
    const wrapper = await openClientIdStep()
    await wrapper.find('#clientId').setValue(VALID_CLIENT_ID)

    expect(wrapper.find('[data-testid="client-id-ok"]').exists()).toBe(true)
    expect(useAuthStore().clientId).toBe(VALID_CLIENT_ID)
  })

  it('strips the whitespace a paste carries along', async () => {
    const wrapper = await openClientIdStep()
    await wrapper.find('#clientId').setValue(`  ${VALID_CLIENT_ID}\n`)

    expect(useAuthStore().clientId).toBe(VALID_CLIENT_ID)
  })

  it('explains a wrong length instead of just rejecting it', async () => {
    const wrapper = await openClientIdStep()
    await wrapper.find('#clientId').setValue('0a1b2c3d')

    const error = wrapper.find('[data-testid="client-id-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('8 Zeichen')
  })

  it('recognises a pasted dashboard link', async () => {
    const wrapper = await openClientIdStep()
    await wrapper.find('#clientId').setValue('https://developer.spotify.com/dashboard')

    expect(wrapper.find('[data-testid="client-id-error"]').text()).toMatch(/Adresse/)
  })

  it('keeps the next step locked while the id is wrong', async () => {
    const wrapper = await openClientIdStep()
    await wrapper.find('#clientId').setValue('nope')

    const next = wrapper.findAll('button').find(button => button.text().includes('Weiter'))
    expect(next?.attributes('disabled')).toBeDefined()
    expect(useAuthStore().clientId).toBe('')
  })

  it('says where the client id lives and that the secret is not needed', async () => {
    const wrapper = await openClientIdStep()
    expect(wrapper.text()).toContain('Basic Information')
    expect(wrapper.text()).toMatch(/Client Secret/)
  })
})
