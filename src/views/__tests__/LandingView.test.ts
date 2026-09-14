import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import LandingView from '@/views/LandingView.vue'

/** A catch-all route keeps every `router-link` in the view resolvable. */
const mountLanding = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', name: 'any', component: { template: '<div />' } }]
  })

  const wrapper = mount(LandingView, { global: { plugins: [router] } })
  await router.isReady()
  return wrapper
}

describe('LandingView source link', () => {
  it('points at this fork, not at the original repository', async () => {
    const wrapper = await mountLanding()

    const sourceLink = wrapper.findAll('a').find(link => link.text().includes('Quellcode'))

    expect(sourceLink?.attributes('href')).toBe('https://github.com/ToDiii/backspin')
  })

  it('carries no mail address', async () => {
    const wrapper = await mountLanding()

    const hrefs = wrapper.findAll('a').map(link => link.attributes('href') ?? '')
    expect(hrefs.filter(href => href.startsWith('mailto:'))).toEqual([])
  })
})
