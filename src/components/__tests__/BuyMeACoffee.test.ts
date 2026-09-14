import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BuyMeACoffee from '@/components/BuyMeACoffee.vue'

const DONATION_URL = 'https://buymeacoffee.com/todiii'

describe('BuyMeACoffee', () => {
  it('points the donation link at the operator of this fork', () => {
    const wrapper = mount(BuyMeACoffee)

    expect(wrapper.get('a').attributes('href')).toBe(DONATION_URL)
  })

  it('carries no link to the original author any more', () => {
    const wrapper = mount(BuyMeACoffee)

    expect(wrapper.html()).not.toContain('maximilianrts')
  })

  it('opens the donation page safely in a new tab', () => {
    const link = mount(BuyMeACoffee).get('a')

    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })
})
