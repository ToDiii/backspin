import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useThemeStore } from '@/stores/theme'

const STORAGE_KEY = 'theme-preference'

type MediaListener = (event: { matches: boolean }) => void

const listeners: MediaListener[] = []

/**
 * happy-dom has no color scheme to report, so `matchMedia` is stubbed with a
 * switchable one. `emitSystemChange` plays back what the browser would send
 * when the operating system flips its appearance.
 */
const stubMatchMedia = (prefersDark: boolean): void => {
  listeners.length = 0
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: prefersDark,
      addEventListener: (_event: string, listener: MediaListener) => {
        listeners.push(listener)
      },
      removeEventListener: vi.fn(),
    })),
  )
}

const emitSystemChange = (matches: boolean): void => {
  listeners.forEach(listener => listener({ matches }))
}

const createStore = (prefersDark = false): ReturnType<typeof useThemeStore> => {
  stubMatchMedia(prefersDark)
  setActivePinia(createPinia())
  return useThemeStore()
}

const classes = (): string[] => Array.from(document.documentElement.classList)

beforeEach(() => {
  document.documentElement.className = ''
})

describe('theme store', () => {
  it('follows the system preference when nothing is stored', () => {
    const store = createStore(true)
    store.initTheme()

    expect(store.isDark).toBe(true)
    expect(classes()).toContain('dark')
    expect(classes()).not.toContain('light')
  })

  it('prefers a stored choice over the system preference', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    const store = createStore(true)
    store.initTheme()

    expect(store.isDark).toBe(false)
    expect(classes()).toContain('light')
    expect(classes()).not.toContain('dark')
  })

  it('ignores a stored value that is not a known preference', () => {
    localStorage.setItem(STORAGE_KEY, 'neon')
    const store = createStore(true)
    store.initTheme()

    expect(store.systemPreference).toBe('auto')
    expect(store.isDark).toBe(true)
  })

  it('swaps the class on the document root when toggled', () => {
    const store = createStore(false)
    store.initTheme()
    expect(classes()).toContain('light')

    store.toggleTheme()
    expect(store.isDark).toBe(true)
    expect(classes()).toContain('dark')
    expect(classes()).not.toContain('light')

    store.toggleTheme()
    expect(store.isDark).toBe(false)
    expect(classes()).toContain('light')
    expect(classes()).not.toContain('dark')
  })

  it('persists the explicit choice made by toggling', () => {
    const store = createStore(false)
    store.initTheme()
    store.toggleTheme()

    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('stores auto and re-reads the system preference', () => {
    const store = createStore(true)
    store.setTheme('light')
    expect(store.isDark).toBe(false)

    store.setTheme('auto')

    expect(localStorage.getItem(STORAGE_KEY)).toBe('auto')
    expect(store.isDark).toBe(true)
    expect(classes()).toContain('dark')
  })

  it('reacts to a system change only while set to auto', () => {
    const store = createStore(false)
    store.setTheme('auto')

    emitSystemChange(true)
    expect(store.isDark).toBe(true)
    expect(classes()).toContain('dark')

    store.setTheme('light')
    emitSystemChange(true)
    expect(store.isDark).toBe(false)
    expect(classes()).toContain('light')
  })
})
