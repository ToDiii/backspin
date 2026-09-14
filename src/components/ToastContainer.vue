<template>
  <div
    class="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-[60] pointer-events-none"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup
      tag="div"
      class="flex flex-col gap-3"
      enter-active-class="animate-slide-up"
      leave-active-class="transition-all duration-200 ease-in absolute"
      leave-to-class="opacity-0 translate-x-4"
      move-class="transition-transform duration-200"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['pointer-events-auto shadow-lg backdrop-blur-sm flex items-start gap-3', statusClass(toast.type)]"
      >
        <!-- Icon -->
        <div :class="['flex-shrink-0 mt-0.5', iconClass(toast.type)]">
          <svg v-if="toast.type === 'success'" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          <svg v-else-if="toast.type === 'error'" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <svg v-else-if="toast.type === 'warning'" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
        </div>

        <!-- Text -->
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-text">{{ toast.title }}</p>
          <p class="text-sm text-text-secondary break-words">{{ toast.message }}</p>
        </div>

        <!-- Close -->
        <button
          type="button"
          class="flex-shrink-0 p-1 rounded text-text-secondary hover:text-text transition-colors focus:outline-none focus:ring-2 focus:ring-brand"
          aria-label="Meldung schließen"
          @click="appStore.removeToast(toast.id)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import type { Toast } from '@/types'

const appStore = useAppStore()
const toasts = computed(() => appStore.toasts)

const statusClass = (type: Toast['type']): string => {
  switch (type) {
    case 'success':
      return 'status-success'
    case 'error':
      return 'status-error'
    case 'warning':
      return 'status-warning'
    default:
      return 'status-info'
  }
}

const iconClass = (type: Toast['type']): string => {
  switch (type) {
    case 'success':
      return 'text-success'
    case 'error':
      return 'text-error'
    case 'warning':
      return 'text-warning'
    default:
      return 'text-text-secondary'
  }
}
</script>
