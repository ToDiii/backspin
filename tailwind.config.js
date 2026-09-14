import forms from '@tailwindcss/forms'
import typography from '@tailwindcss/typography'

/**
 * Themeable colors are defined once as CSS custom properties in src/style.css
 * (`:root` = light, `.dark` = dark) and referenced here as space separated RGB
 * channels, so Tailwind can still apply opacity modifiers like `bg-surface/80`.
 */
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Fixed brand ramp: the amber reads the same in both themes and is only
        // used for fills, tints and gradients, never for text on a surface.
        primary: {
          50: '#fdf7ec',
          100: '#faebcf',
          200: '#f5d79e',
          300: '#efc26c',
          400: '#eab24a',
          500: '#E6A62E', // Bernstein, die Markenfarbe
          600: '#c88a1e',
          700: '#a06d17',
          800: '#7a5200',
          900: '#5e3f00',
          DEFAULT: '#E6A62E',
        },
        // Text/icon color on top of a primary fill. Near black: white on
        // #E6A62E only reaches 1.9:1 and fails WCAG AA by a wide margin.
        'on-primary': token('on-primary'),
        // Text/icon color on top of a solid status fill: the status tones flip
        // from dark (light theme) to bright (dark theme), so this flips too.
        'on-status': token('on-status'),
        // The amber as text, border or focus ring. Themed, because #E6A62E on
        // a light surface is far below AA.
        brand: {
          DEFAULT: token('brand'),
          strong: token('brand-strong'),
        },
        // Spotify's own green. Only for UI that acts on Spotify itself, above
        // all the sign in button - never as this product's brand color.
        spotify: {
          DEFAULT: '#1DB954',
          strong: '#1AA34A',
          // Themed green as a line or label around the fixed fill, because
          // #1DB954 on a light surface only reaches 2.6:1.
          line: token('spotify-line'),
        },
        // Near black label on a Spotify green fill, like Spotify's own buttons.
        'on-spotify': '#07130B',
        // Neutral surfaces, from the page background up to raised rows.
        background: token('background'),
        surface: {
          DEFAULT: token('surface'),
          muted: token('surface-muted'),
          raised: token('surface-raised'),
        },
        border: {
          DEFAULT: token('border'),
          strong: token('border-strong'),
        },
        text: {
          DEFAULT: token('text'),
          secondary: token('text-secondary'),
          muted: token('text-muted'),
        },
        // Status colors. DEFAULT is the AA safe text/icon tone, `surface` and
        // `border` are the tinted panel behind it.
        success: {
          DEFAULT: token('success'),
          surface: token('success-surface'),
          border: token('success-border'),
        },
        error: {
          DEFAULT: token('error'),
          surface: token('error-surface'),
          border: token('error-border'),
        },
        warning: {
          DEFAULT: token('warning'),
          surface: token('warning-surface'),
          border: token('warning-border'),
        },
        info: {
          DEFAULT: token('text-secondary'),
          surface: token('info-surface'),
          border: token('border'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    forms,
    typography,
  ],
}
