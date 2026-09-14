import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-ignore',
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },

  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,cts,tsx,js,mjs,cjs,jsx,vue}'],
  },

  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    // public/ is served as-is and never goes through the bundler, so this file
    // is a classic browser script instead of a module.
    name: 'app/static-scripts',
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        document: 'readonly',
        localStorage: 'readonly',
        window: 'readonly',
      },
    },
  },

  {
    name: 'app/rules',
    rules: {
      // Views und Routen-Komponenten heissen bewusst einwortig (LandingView.vue,
      // App.vue); die Konvention aus CLAUDE.md ist eine Datei je Route.
      'vue/multi-word-component-names': 'off',

      // Reine Umbruchregeln aus flat/recommended. CLAUDE.md legt fest, dass es
      // keinen Prettier gibt und der Stil von Hand gehalten wird; beide Regeln
      // wuerden die kompakten Tailwind-Templates (lange Utility-Klassenlisten,
      // einzeilige Ueberschriften) ueber hunderte Stellen neu umbrechen, ohne
      // dass sich am Markup etwas aendert. Alle inhaltlichen Regeln von
      // flat/recommended (attributes-order, html-self-closing, ...) bleiben aktiv.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
)
