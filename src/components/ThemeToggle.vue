<template>
  <!-- Theme Toggle Button -->
  <button
    type="button"
    class="p-2 rounded-lg bg-surface border border-border-strong hover:border-brand transition-colors"
    :title="isDark ? 'Zu Light Mode wechseln' : 'Zu Dark Mode wechseln'"
    :aria-label="isDark ? 'Zu Light Mode wechseln' : 'Zu Dark Mode wechseln'"
    @click="handleToggleTheme"
  >
    <!-- Sun Icon (Light Mode) -->
    <svg 
      v-if="isDark" 
      class="w-5 h-5 text-text" 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
    
    <!-- Moon Icon (Dark Mode) -->
    <svg 
      v-else 
      class="w-5 h-5 text-text" 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useThemeStore } from '@/stores/theme'

// Theme initialization happens once in App.vue
const themeStore = useThemeStore()
const { isDark } = storeToRefs(themeStore)

// Handle theme toggle - simple toggle between light and dark
const handleToggleTheme = () => {
  themeStore.toggleTheme()
}
</script>
