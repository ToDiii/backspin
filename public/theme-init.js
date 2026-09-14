/*
 * Sets the theme class on <html> before the first paint, so a dark mode user
 * does not get a white flash while the Vue app boots.
 *
 * Deliberately a separate file and not an inline <script>: the CSP allows
 * script-src 'self' only, and an inline block would need a matching hash in
 * both index.html and deploy/backspin.caddy.
 *
 * Keep the storage key and the preference values in sync with
 * src/stores/theme.ts, which takes over once the app is mounted.
 */
;(function () {
  var dark = false
  try {
    var stored = localStorage.getItem('theme-preference')
    if (stored === 'dark') {
      dark = true
    } else if (stored !== 'light') {
      // 'auto' or nothing stored yet: follow the operating system.
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    }
  } catch {
    // Private mode can throw on localStorage; the light default still applies.
  }
  document.documentElement.classList.add(dark ? 'dark' : 'light')
})()
