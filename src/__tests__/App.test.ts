import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '@/App.vue'

/** A catch-all route keeps every `router-link` in the layout resolvable. */
const mountApp = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', name: 'any', component: { template: '<div />' } }]
  })

  const wrapper = mount(App, {
    global: { plugins: [createTestingPinia({ createSpy: vi.fn }), router] }
  })
  await router.isReady()
  return wrapper
}

describe('App footer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the current year in the copyright line', async () => {
    const wrapper = await mountApp()

    expect(wrapper.text()).toContain(`© ${new Date().getFullYear()}`)
  })

  it('follows the system clock instead of a hard-coded year', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2031-06-15T12:00:00Z'))

    const wrapper = await mountApp()

    expect(wrapper.text()).toContain('© 2031 Backspin')
    expect(wrapper.text()).not.toContain('© 2024')
  })

  it('uses the product name Backspin in navigation and footer', async () => {
    const wrapper = await mountApp()

    expect(wrapper.text()).toContain('Backspin')
    expect(wrapper.text()).not.toContain('MySpotBackup')
    // The footer still credits the origin as the repository name
    // `MaximilianRTS/SpotMyBackup2`, but the product is never called that.
    expect(wrapper.text()).not.toContain('SpotMyBackup 2')
  })
})

describe('App attribution', () => {
  it('points the project links at this fork, not at the original repository', async () => {
    const wrapper = await mountApp()

    // Every link that offers "the" repository of the running app, in the navigation
    // (desktop and mobile menu) as well as in the footer icon row.
    const projectLinks = wrapper
      .findAll('a')
      .filter(link => link.text().includes('GitHub Projekt') || link.attributes('title') === 'GitHub Repository')
      .map(link => link.attributes('href'))

    expect(projectLinks.length).toBeGreaterThan(0)
    expect(projectLinks).toEqual(projectLinks.map(() => 'https://github.com/ToDiii/backspin'))
  })

  it('names the fork owner as contact and links the GitHub profile', async () => {
    const wrapper = await mountApp()

    expect(wrapper.text()).toContain('@ToDiii')

    const hrefs = wrapper.findAll('a').map(link => link.attributes('href') ?? '')
    expect(hrefs).toContain('https://github.com/ToDiii')
  })

  it('carries no mail address at all', async () => {
    const wrapper = await mountApp()

    const hrefs = wrapper.findAll('a').map(link => link.attributes('href') ?? '')
    expect(hrefs.filter(href => href.startsWith('mailto:'))).toEqual([])
    expect(wrapper.html()).not.toContain('maximilianrts@proton.me')
  })

  it('sends the donation button to the operator of this fork', async () => {
    const wrapper = await mountApp()

    const hrefs = wrapper.findAll('a').map(link => link.attributes('href') ?? '')
    const donationLinks = hrefs.filter(href => href.includes('buymeacoffee.com'))

    expect(donationLinks.length).toBeGreaterThan(0)
    expect(donationLinks).toEqual(donationLinks.map(() => 'https://buymeacoffee.com/todiii'))
    expect(wrapper.html()).not.toContain('maximilianrts')
  })

  it('keeps the origin of the fork visible', async () => {
    const wrapper = await mountApp()

    expect(wrapper.text()).toContain('MaximilianRTS/SpotMyBackup2')
    expect(wrapper.text()).toContain('Maximilian Reitsberger')
    expect(wrapper.text()).toContain('secuvera/SpotMyBackup')

    const hrefs = wrapper.findAll('a').map(link => link.attributes('href') ?? '')
    expect(hrefs).toContain('https://github.com/MaximilianRTS/SpotMyBackup2')
    expect(hrefs).toContain('https://github.com/secuvera/SpotMyBackup')
  })
})
